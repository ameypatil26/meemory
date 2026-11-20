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
  buildInjectionText,
  extractCodeState,
  lastAssistantSummary,
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
  | 'TRIGGER_CAPTURE'
  | 'GET_ACTIVE_TAB'
  | 'CAPTURE_TAB'
  | 'PASTE_CAPSULE';

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
 * Captures a JPEG thumbnail of the active tab via chrome.tabs.captureVisibleTab.
 * @returns {Promise<string | undefined>} data-URL or undefined on failure.
 */
async function captureScreenshot(): Promise<string | undefined> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId == null) return undefined;
    return await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'jpeg',
      quality: 50,
    });
  } catch (err) {
    console.warn('[MEEMORY] captureVisibleTab failed:', err);
    return undefined;
  }
}

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
  let geminiTopic = '';

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
      geminiTopic = (data.topic ?? topic).slice(0, 60);
      capsuleText = geminiToCapsule(geminiTopic || name, data);
      if (capsuleText.trim().length > 0) {
        quality = 'gemini';
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
  const screenshot = await captureScreenshot();
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
      ...(screenshot ? { screenshot } : {}),
    };
    await saveCapsule(updated);
    return { ok: true, capsule: updated };
  }

  // Naming: prose chats → "Memory N: <first 5 words of last AI reply>";
  // Gemini topic → "Memory N (Topic)"; otherwise plain "Memory N".
  const seq = (await listCapsules()).length + 1;
  const codeArtifacts =
    sections.files.length +
    sections.variables.length +
    sections.functions.length +
    sections.classes.length +
    sections.imports.length;
  const isProse = codeArtifacts === 0;
  const assistantSummary = lastAssistantSummary(rawText);
  let finalName = `Memory ${seq}`;
  if (isProse && assistantSummary) {
    const five = assistantSummary.trim().split(/\s+/).slice(0, 5).join(' ');
    if (five) finalName = `Memory ${seq}: ${five}`.slice(0, 80);
  } else if (quality === 'gemini' && geminiTopic) {
    finalName = `Memory ${seq} (${geminiTopic.slice(0, 30)})`;
  }

  const id = await makeId(topic || name);
  const record: CapsuleInput = {
    id,
    name: finalName,
    capsule: capsuleText,
    quality,
    platform,
    token_estimate: tokenEstimate,
    raw_excerpt: rawText.slice(0, 1500),
    search_text: buildSearchText(finalName, capsuleText, platform),
    content_hash: contentHash,
    ...(screenshot ? { screenshot } : {}),
  };
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
          case 'GET_ACTIVE_TAB': {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            sendResponse({
              ok: true,
              tab: tab
                ? { id: tab.id ?? null, url: tab.url ?? '', title: tab.title ?? '' }
                : null,
            });
            break;
          }
          case 'CAPTURE_TAB': {
            const tabId = (msg.payload as { tabId: number }).tabId;
            try {
              const res = (await chrome.tabs.sendMessage(tabId, {
                type: 'TRIGGER_CAPTURE',
                silent: true,
              })) as { success?: boolean; error?: string } | undefined;
              sendResponse(
                res ?? { ok: false, success: false, error: 'No response from page content script' },
              );
            } catch (err) {
              sendResponse({
                ok: false,
                success: false,
                error: err instanceof Error ? err.message : String(err),
              });
            }
            break;
          }
          case 'PASTE_CAPSULE': {
            const p = msg.payload as { tabId: number; capsule: Capsule };
            const text = buildInjectionText(p.capsule.capsule);
            try {
              const res = (await chrome.tabs.sendMessage(p.tabId, {
                type: 'PASTE_TEXT',
                text,
              })) as { ok?: boolean; via?: string } | undefined;
              sendResponse(res ?? { ok: false, via: 'none', error: 'No response from page' });
            } catch (err) {
              sendResponse({
                ok: false,
                via: 'none',
                error: err instanceof Error ? err.message : String(err),
              });
            }
            break;
          }
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
 * Retries once (content script may still be initializing) and logs failures
 * to the service-worker console instead of swallowing them silently.
 */
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'capture-chat') return;
  console.log('[MEEMORY] capture-chat command received');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) {
      console.warn('[MEEMORY] no active tab found for capture');
      return;
    }
    const send = () =>
      chrome.tabs.sendMessage(tab.id!, { type: 'TRIGGER_CAPTURE' }) as Promise<{
        success?: boolean;
        error?: string;
      }>;
    try {
      const res = await send();
      console.log('[MEEMORY] TRIGGER_CAPTURE result for tab', tab.id, res);
    } catch (firstErr) {
      // Content script may not be injected yet — retry once after a beat.
      console.warn('[MEEMORY] first sendMessage failed, retrying:', firstErr);
      await new Promise((r) => setTimeout(r, 400));
      const res = await send();
      console.log('[MEEMORY] TRIGGER_CAPTURE result (retry) for tab', tab.id, res);
    }
  } catch (err) {
    console.error('[MEEMORY] capture shortcut failed:', err);
  }
});
