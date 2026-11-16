/**
 * content.ts — runs on every page.
 *
 * - Detects AI chat pages (per-host + generic).
 * - Injects a Shadow-DOM "Load Memory" floating button + capsule panel.
 * - Handles Paste → UPDATE_ACCESS → injector.insertIntoChat (never sends).
 * - Handles TRIGGER_CAPTURE (Ctrl/Cmd+Shift+M) → extractor → SAVE_CHAT.
 */
import { detectPlatform, extractConversation, type Conversation } from './extractor';
import { insertIntoChat } from './injector';
import { buildInjectionText } from './codeState';
import type { Capsule, MeemorySettings } from './storage';
import cssText from './styles.css';

const HOST_ID = 'meemory-root';
const CAPSULE_MIME = 'application/x-meemory-capsule';
const QUALITY_BADGE: Record<Capsule['quality'], string> = {
  logic: '⚡',
  gemini: '🤖',
  low: '⚠️',
};
const QUALITY_LABEL: Record<Capsule['quality'], string> = {
  logic: 'logic',
  gemini: 'gemini',
  low: 'low',
};

interface ListResponse {
  ok: boolean;
  capsules?: Capsule[];
}
interface SettingsResponse {
  ok: boolean;
  settings?: MeemorySettings;
}

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let platform: string | null = null;
let settings: MeemorySettings | null = null;
let customDomains: string[] = [];
let panelOpen = false;
let capsulesCache: Capsule[] = [];

/** Sends a runtime message and awaits the response; logs + rethrows on failure. */
async function send<T = unknown>(msg: { type: string; payload?: unknown }): Promise<T> {
  try {
    return (await chrome.runtime.sendMessage(msg)) as T;
  } catch (err) {
    console.error('[MEEMORY] sendMessage failed for', msg.type, err);
    throw err;
  }
}

/** Builds the text injected into the chat input on Paste. */
function buildPrefix(capsule: Capsule): string {
  return buildInjectionText(capsule.capsule);
}

/** Creates the shadow host + UI skeleton once (replaces any stale host). */
function ensureUI(): void {
  if (host) return;
  // Remove a stale host left by a previous (possibly orphaned) injection.
  document.getElementById(HOST_ID)?.remove();
  platform = detectPlatform(location.href, document, customDomains);
  if (!platform) return;

  host = document.createElement('div');
  host.id = HOST_ID;
  shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = cssText;
  shadow.appendChild(style);

  const wrap = document.createElement('div');
  wrap.className = 'mm-wrap';

  // Floating button
  const btn = document.createElement('button');
  btn.className = 'mm-btn';
  btn.textContent = '🧠 Load Memory';
  btn.title = 'Load a MEEMORY capsule into this chat';
  btn.addEventListener('click', () => togglePanel());
  wrap.appendChild(btn);

  // Capture button
  const cap = document.createElement('button');
  cap.className = 'mm-btn mm-btn-ghost';
  cap.textContent = '＋ Save chat';
  cap.title = 'Capture this conversation (Ctrl/Cmd+Shift+M)';
  cap.addEventListener('click', () => void captureChat());
  wrap.appendChild(cap);

  // "Send to AI" — only meaningful on web sources (Gmail, WhatsApp).
  const sendBtn = document.createElement('button');
  sendBtn.className = 'mm-btn mm-btn-send';
  sendBtn.textContent = '🤖 Send to AI';
  sendBtn.title = 'Capture this page as a memory capsule for an AI chat';
  sendBtn.addEventListener('click', () => void captureChat());
  wrap.appendChild(sendBtn);

  // Panel
  const panel = document.createElement('div');
  panel.className = 'mm-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="mm-panel-head">
      <span class="mm-title">MEEMORY</span>
      <input class="mm-search" type="search" placeholder="Search name / platform / quality…" />
      <button class="mm-close" title="Close">×</button>
    </div>
    <div class="mm-list"></div>
    <div class="mm-foot">Paste fills the chat input — you press send.</div>`;
  wrap.appendChild(panel);
  shadow.appendChild(wrap);

  panel.querySelector('.mm-close')!.addEventListener('click', () => togglePanel(false));
  panel.querySelector('.mm-search')!.addEventListener('input', (e) => {
    renderList((e.target as HTMLInputElement).value);
  });

  document.documentElement.appendChild(host);
}

/** Shows/hides the floating button based on settings + capsule count. */
async function refreshVisibility(): Promise<void> {
  try {
    ensureUI();
    if (!host || !shadow) return;
    const s = await send<SettingsResponse>({ type: 'GET_SETTINGS' });
    settings = s.settings ?? null;
    customDomains = settings?.customDomains ?? [];
    // Retry detection — a custom domain may have been added since load.
    if (!platform) {
      platform = detectPlatform(location.href, document, customDomains);
      if (platform) ensureUI();
    }
    if (!settings?.showFloatingButton || !platform) {
      host.style.display = 'none';
      return;
    }
    const list = await send<ListResponse>({ type: 'LIST_CAPSULES' });
    capsulesCache = list.capsules ?? [];
    // "Load Memory" appears only when capsules exist; "Save chat" always shows.
    const loadBtn = shadow.querySelector('.mm-btn') as HTMLElement | null;
    if (loadBtn) loadBtn.style.display = capsulesCache.length > 0 || panelOpen ? '' : 'none';
    // "Send to AI" only on web sources (Gmail, WhatsApp, …).
    const sendBtn = shadow.querySelector('.mm-btn-send') as HTMLElement | null;
    if (sendBtn) {
      sendBtn.style.display =
        platform === 'gmail' || platform === 'whatsapp' ? '' : 'none';
    }
    host.style.display = 'block';
  } catch (err) {
    console.error('[MEEMORY] refreshVisibility failed:', err);
  }
}

/** Toggles the capsule panel. */
function togglePanel(force?: boolean): void {
  if (!shadow) return;
  const panel = shadow.querySelector('.mm-panel') as HTMLElement | null;
  if (!panel) return;
  panelOpen = force ?? panel.style.display === 'none';
  panel.style.display = panelOpen ? 'flex' : 'none';
  if (panelOpen) {
    void (async () => {
      try {
        const list = await send<ListResponse>({ type: 'LIST_CAPSULES' });
        capsulesCache = list.capsules ?? [];
        renderList('');
      } catch (err) {
        console.error('[MEEMORY] panel refresh failed:', err);
      }
    })();
  }
}

/** Renders capsule rows into the panel list. */
function renderList(filter: string): void {
  if (!shadow) return;
  const listEl = shadow.querySelector('.mm-list') as HTMLElement | null;
  if (!listEl) return;
  const q = filter.trim().toLowerCase();
  const items = capsulesCache.filter((c) => {
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.platform.toLowerCase().includes(q) ||
      QUALITY_LABEL[c.quality].includes(q) ||
      c.search_text.includes(q)
    );
  });

  listEl.innerHTML = '';
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'mm-empty';
    empty.textContent = capsulesCache.length === 0 ? 'No capsules yet — save a chat first.' : 'No matches.';
    listEl.appendChild(empty);
    return;
  }

  for (const c of items) {
    const row = document.createElement('div');
    row.className = 'mm-item';
    // Draggable capsule → drop onto the chat input to inject.
    row.draggable = true;
    row.title = 'Drag onto the chat input, or click Paste';
    row.addEventListener('dragstart', (e) => {
      const dt = (e as DragEvent).dataTransfer;
      if (!dt) return;
      dt.setData(CAPSULE_MIME, JSON.stringify(c));
      dt.setData('text/plain', c.capsule);
      dt.effectAllowed = 'copy';
    });

    const info = document.createElement('div');
    info.className = 'mm-item-info';
    const title = document.createElement('div');
    title.className = 'mm-item-name';
    title.textContent = c.name;
    const meta = document.createElement('div');
    meta.className = 'mm-item-meta';
    const warn = c.token_estimate > 800 ? ' ⚠️' : '';
    meta.textContent = `${c.platform} · ${QUALITY_BADGE[c.quality]} ${QUALITY_LABEL[c.quality]} · ~${c.token_estimate} tok${warn}`;
    info.appendChild(title);
    info.appendChild(meta);
    row.appendChild(info);

    const paste = document.createElement('button');
    paste.className = 'mm-paste';
    paste.textContent = 'Paste';
    paste.addEventListener('click', () => void pasteCapsule(c));
    row.appendChild(paste);

    const del = document.createElement('button');
    del.className = 'mm-del';
    del.textContent = '×';
    del.title = 'Delete capsule';
    del.addEventListener('click', () => {
      if (!confirm(`Delete capsule "${c.name}"?`)) return;
      void send({ type: 'DELETE_CAPSULE', payload: { id: c.id } })
        .then(() => {
          capsulesCache = capsulesCache.filter((x) => x.id !== c.id);
          renderList((shadow!.querySelector('.mm-search') as HTMLInputElement).value);
          void refreshVisibility();
        })
        .catch((err) => {
          console.error('[MEEMORY] delete failed:', err);
          toast('Delete failed.');
        });
    });
    row.appendChild(del);

    listEl.appendChild(row);
  }
}

/** Paste flow: bump access stats, inject into chat input (never sends). */
async function pasteCapsule(c: Capsule): Promise<void> {
  try {
    await send({ type: 'UPDATE_ACCESS', payload: { id: c.id } });
  } catch (err) {
    console.warn('[MEEMORY] UPDATE_ACCESS failed:', err);
  }
  const text = buildPrefix(c);

  if (settings?.autoPaste) {
    const res = await insertIntoChat(text);
    if (res.via === 'input') {
      toast('Memory loaded — review and press send.');
    } else if (res.via === 'clipboard') {
      toast('Capsule copied — paste with Ctrl+V.');
    } else {
      toast('Could not inject — copy failed.');
    }
  } else {
    // autoPaste off: copy to clipboard only.
    const { copyToClipboard } = await import('./injector');
    const ok = await copyToClipboard(text);
    toast(ok ? 'Capsule copied — paste with Ctrl+V.' : 'Copy failed.');
  }
}

/** Shows a transient toast inside the shadow root. */
function toast(msg: string): void {
  if (!shadow) return;
  const t = document.createElement('div');
  t.className = 'mm-toast';
  t.textContent = msg;
  shadow.appendChild(t);
  setTimeout(() => t.classList.add('mm-toast-out'), 2400);
  setTimeout(() => t.remove(), 2900);
}

/** Result shape returned to whoever triggered a capture. */
export interface CaptureResult {
  success: boolean;
  error?: string;
}

/**
 * Capture flow: extract conversation → SAVE_CHAT → result.
 * @param silent - when true, skip the toast (popup shows its own log).
 * @returns {Promise<CaptureResult>} outcome for the caller.
 */
async function captureChat(silent = false): Promise<CaptureResult> {
  console.log('[MEEMORY] captureChat triggered');
  const say = (m: string) => { if (!silent) toast(m); };
  try {
    // Message-level capture: a user text selection wins over full extraction.
    const selText = window.getSelection()?.toString().trim() ?? '';
    let convo: Conversation | null;
    if (selText.length >= 20) {
      convo = {
        platform: platform ?? 'selection',
        messages: [{ role: 'user', text: selText.slice(0, 15000) }],
        rawText: `user: ${selText}`.slice(0, 15000),
      };
      console.log('[MEEMORY] capturing highlighted selection');
    } else {
      convo = extractConversation(document, customDomains);
    }
    if (!convo) {
      console.warn('[MEEMORY] no conversation detected on this page');
      say('No conversation detected on this page.');
      return { success: false, error: 'No chat messages found on page' };
    }
    console.log(
      `[MEEMORY] extracted ${convo.messages.length} messages from ${convo.platform} (${convo.rawText.length} chars)`,
    );
    const res = await send<{ ok: boolean; reason?: string; capsule?: Capsule }>({
      type: 'SAVE_CHAT',
      payload: { platform: convo.platform, messages: convo.messages, rawText: convo.rawText },
    });
    if (res.ok && res.capsule) {
      say(`Saved "${res.capsule.name}" (${res.capsule.quality})`);
      await refreshVisibility();
      return { success: true };
    }
    console.warn('[MEEMORY] SAVE_CHAT rejected:', res.reason);
    say(res.reason ?? 'Save failed.');
    return { success: false, error: res.reason ?? 'Save failed.' };
  } catch (err) {
    console.error('[MEEMORY] captureChat failed:', err);
    say('Capture failed — see console for details.');
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Listeners are always registered: if this script was re-executed after an
// extension reload, the old context's listeners are dead anyway.
{
  // Keyboard-shortcut / popup trigger from the service worker.
  // MUST call sendResponse (and return true) — otherwise the sender's
  // sendMessage promise rejects with "message channel closed".
  chrome.runtime.onMessage.addListener(
    (msg: { type?: string; silent?: boolean }, _sender, sendResponse) => {
      console.log('[MEEMORY] content script message:', msg?.type);
      if (msg?.type === 'TRIGGER_CAPTURE') {
        void (async () => {
          const result = await captureChat(Boolean(msg.silent));
          sendResponse(result);
        })();
        return true; // keep the message channel open for the async response
      }
      if ((msg as { type?: string })?.type === 'PASTE_TEXT') {
        const text = (msg as { text?: string }).text ?? '';
        void (async () => {
          try {
            const res = await insertIntoChat(text);
            sendResponse(res);
          } catch (err) {
            console.error('[MEEMORY] PASTE_TEXT failed:', err);
            sendResponse({ ok: false, via: 'none' });
          }
        })();
        return true;
      }
      return false;
    },
  );

  // Settings changes (e.g. from popup) update visibility live.
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') void refreshVisibility();
  });

  // Boot — load settings first so custom domains are known at detection time.
  void (async () => {
    try {
      const s = await send<SettingsResponse>({ type: 'GET_SETTINGS' });
      settings = s.settings ?? null;
      customDomains = settings?.customDomains ?? [];
    } catch (err) {
      console.warn('[MEEMORY] settings preload failed:', err);
    }
    try {
      ensureUI();
      if (!host) {
        console.log('[MEEMORY] no chat platform detected on', location.hostname);
        return;
      }
      console.log('[MEEMORY] initialized on', platform, location.hostname);
      await refreshVisibility();
    } catch (err) {
      console.error('[MEEMORY] init failed:', err);
    }
  })();

  // Re-check when returning to the tab (capsules may have been added elsewhere).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshVisibility();
  });

  // ---- Drag & drop injection: capsule dragged onto the chat input ----
  document.addEventListener(
    'dragover',
    (e) => {
      const dt = (e as DragEvent).dataTransfer;
      if (dt?.types.includes(CAPSULE_MIME)) {
        e.preventDefault();
        dt.dropEffect = 'copy';
      }
    },
    true,
  );
  document.addEventListener(
    'drop',
    (e) => {
      const dt = (e as DragEvent).dataTransfer;
      const raw = dt?.getData(CAPSULE_MIME);
      if (!raw) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        const c = JSON.parse(raw) as Capsule;
        void send({ type: 'UPDATE_ACCESS', payload: { id: c.id } }).catch(() => {});
        void insertIntoChat(buildInjectionText(c.capsule)).then((res) => {
          if (res.via === 'input') toast('Memory dropped into chat — press send.');
          else if (res.via === 'clipboard') toast('Capsule copied — paste with Ctrl+V.');
          else toast('Drop failed — could not inject.');
        });
      } catch (err) {
        console.error('[MEEMORY] drop parse failed:', err);
      }
    },
    true,
  );
}
