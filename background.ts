/**
 * background.ts — MV3 service worker.
 *
 * Message router for the popup and content script, plus the full
 * extraction pipeline (logic → Gemini fallback → low-quality excerpt)
 * and the Ctrl/Cmd+Shift+M capture shortcut.
 */
import {
  countStructuralSections,
  deriveTopic,
  buildCapsule,
  extractCodeState,
  geminiToCapsule,
  lowQualityFallback,
  makeId,
  makeName,
  buildSearchText,
  hashContent,
  type CodeSections,
  type GeminiData,
} from './codeState';
import { extractWithGemini } from './gemini';
import {
  deleteCapsule,
  exportAll,
  findDuplicate,
  getCapsule,
  getSettings,
  importCapsules,
  listCapsules,
  saveCapsule,
  setSettings,
  updateAccess,
  type Capsule,
  type CapsuleInput,
  type CapsuleQuality,
} from './storage';
import type { ChatMessage } from './extractor';

/** Message types the router understands. */
type MsgType =
  | 'SAVE_CHAT'
  | 'LIST_CAPSULES'
  | 'DELETE_CAPSULE'
  | 'GET_CAPSULE'
  | 'GET_SETTINGS'
  | 'SET_SETTINGS'
  | 'EXPORT_CAPSULES'
  | 'IMPORT_CAPSULES'
  | 'UPDATE_ACCESS'
  | 'TRIGGER_CAPTURE';

/** Incoming message envelope. */
interface Msg {
  type: MsgType;
  payload?: unknown;
}

/** Payload for SAVE_CHAT. */
interface SaveChatPayload {
  platform: string;
  messages: ChatMessage[];
  rawText: string;
}

const TOKEN_CAP_CHARS = 3200;

/**
 * Runs the extraction pipeline and stores (or refreshes) a capsule.
 * @param payload - platform + messages + raw text from the content script.
 * @returns {Promise<{ ok: boolean; capsule?: Capsule; reason?: string }>}
 */
async function handleSaveChat(
  payload: SaveChatPayload,
): Promise<{ ok: boolean; capsule?: Capsule; reason?: string }> {
  const { platform, messages, rawText } = payload;
  if (!rawText || rawText.trim().length < 20) {
    return { ok: false, reason: 'Conversation too short to capture.' };
  }

  const settings = await getSettings();
  const topic = deriveTopic(messages);
  const name = makeName(topic);

  let capsuleText = '';
  let quality: CapsuleQuality = 'low';
  let usedGemini = false;

  // Step 2+3 — logic-first pass.
  const sections: CodeSections = extractCodeState(rawText);
  const structural = countStructuralSections(sections);

  if (structural >= 2) {
    capsuleText = buildCapsule(topic || name, sections);
    quality = 'logic';
  } else if (settings.geminiKey) {
    // Step 4 — Gemini fallback.
    const data: GeminiData | null = await extractWithGemini(settings.geminiKey, rawText);
    if (data) {
      const gTopic = (data.topic ?? topic).slice(0, 60);
      capsuleText = geminiToCapsule(gTopic || name, data);
      if (capsuleText.trim().length > 0) {
        quality = 'gemini';
        usedGemini = true;
      }
    }
  }

  // Step 5 — ultimate fallback: raw excerpt.
  if (!capsuleText) {
    const low = lowQualityFallback(rawText, platform);
    capsuleText = low.capsule;
    quality = 'low';
  }

  const contentHash = await hashContent(capsuleText);
  const tokenEstimate = Math.ceil(capsuleText.length / 4);
  void TOKEN_CAP_CHARS;

  // Step 6 — dedup: same hash within 24h → update in place.
  const dup = await findDuplicate(contentHash);
  if (dup) {
    const updated: Capsule = {
      ...dup,
      capsule: capsuleText,
      quality,
      platform,
      token_estimate: tokenEstimate,
      raw_excerpt: rawText.slice(0, 1500),
      search_text: buildSearchText(dup.name, capsuleText, platform),
      content_hash: contentHash,
    };
    await saveCapsule(updated);
    return { ok: true, capsule: updated };
  }

  const id = await makeId(topic || name);
  const record: CapsuleInput = {
    id,
    name: quality === 'low' ? lowQualityFallback(rawText, platform).name : name,
    capsule: capsuleText,
    quality,
    platform,
    token_estimate: tokenEstimate,
    raw_excerpt: rawText.slice(0, 1500),
    search_text: buildSearchText(name, capsuleText, platform),
    content_hash: contentHash,
  };
  void usedGemini;
  const stored = await saveCapsule(record);
  return { ok: true, capsule: stored };
}

/** Validates an imported capsule-ish object. */
function isCapsuleLike(x: unknown): x is CapsuleInput {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.capsule === 'string' && typeof o.platform === 'string';
}

/**
 * Message router. Returns true to keep the sendResponse channel open.
 */
chrome.runtime.onMessage.addListener(
  (msg: Msg, _sender, sendResponse) => {
    (async () => {
      try {
        switch (msg.type) {
          case 'SAVE_CHAT':
            sendResponse(await handleSaveChat(msg.payload as SaveChatPayload));
            break;
          case 'LIST_CAPSULES':
            sendResponse({ ok: true, capsules: await listCapsules() });
            break;
          case 'GET_CAPSULE': {
            const id = (msg.payload as { id: string }).id;
            sendResponse({ ok: true, capsule: await getCapsule(id) });
            break;
          }
          case 'DELETE_CAPSULE': {
            const id = (msg.payload as { id: string }).id;
            await deleteCapsule(id);
            sendResponse({ ok: true });
            break;
          }
          case 'UPDATE_ACCESS': {
            const id = (msg.payload as { id: string }).id;
            sendResponse({ ok: true, capsule: await updateAccess(id) });
            break;
          }
          case 'GET_SETTINGS':
            sendResponse({ ok: true, settings: await getSettings() });
            break;
          case 'SET_SETTINGS':
            await setSettings(msg.payload as Partial<import('./storage').MeemorySettings>);
            sendResponse({ ok: true, settings: await getSettings() });
            break;
          case 'EXPORT_CAPSULES':
            sendResponse({ ok: true, capsules: await exportAll() });
            break;
          case 'IMPORT_CAPSULES': {
            const list = (msg.payload as { capsules: unknown[] }).capsules ?? [];
            const valid = list.filter(isCapsuleLike);
            const count = await importCapsules(valid);
            sendResponse({ ok: true, imported: count, skipped: list.length - valid.length });
            break;
          }
          case 'TRIGGER_CAPTURE':
            // Forwarded back to the content script by the caller if needed.
            sendResponse({ ok: true });
            break;
          default:
            sendResponse({ ok: false, reason: `Unknown message type: ${msg.type}` });
        }
      } catch (err) {
        sendResponse({ ok: false, reason: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true;
  },
);

/**
 * Keyboard shortcut: Ctrl/Cmd+Shift+M → ask the active tab to capture.
 */
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'capture-chat') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_CAPTURE' });
    }
  } catch {
    /* content script not injected on this page — ignore */
  }
});
