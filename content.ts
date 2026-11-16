/**
 * content.ts — runs on every page.
 *
 * - Detects AI chat pages (per-host + generic).
 * - Injects a Shadow-DOM "Load Memory" floating button + capsule panel.
 * - Handles Paste → UPDATE_ACCESS → injector.insertIntoChat (never sends).
 * - Handles TRIGGER_CAPTURE (Ctrl/Cmd+Shift+M) → extractor → SAVE_CHAT.
 */
import { detectPlatform, extractConversation } from './extractor';
import { insertIntoChat } from './injector';
import type { Capsule, MeemorySettings } from './storage';
import cssText from './styles.css';

const HOST_ID = 'meemory-root';
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
let panelOpen = false;
let capsulesCache: Capsule[] = [];

/** Sends a runtime message and awaits the response. */
function send<T = unknown>(msg: { type: string; payload?: unknown }): Promise<T> {
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}

/** Builds the text injected into the chat input on Paste. */
function buildPrefix(capsule: Capsule): string {
  return (
    '[MEEMORY CAPSULE — Project State]\n' +
    'Continue this project from where it left off. Do NOT restart. The state below is current.\n\n' +
    '---\n' +
    `${capsule.capsule}\n` +
    '---\n' +
    'Continue. Do not repeat what is already done. Build on this state.'
  );
}

/** Creates the shadow host + UI skeleton once. */
function ensureUI(): void {
  if (host) return;
  platform = detectPlatform(location.href, document);
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
  ensureUI();
  if (!host || !shadow) return;
  const s = await send<SettingsResponse>({ type: 'GET_SETTINGS' });
  settings = s.settings ?? null;
  if (!settings?.showFloatingButton || !platform) {
    host.style.display = 'none';
    return;
  }
  const list = await send<ListResponse>({ type: 'LIST_CAPSULES' });
  capsulesCache = list.capsules ?? [];
  // "Load Memory" appears only when capsules exist; "Save chat" always shows.
  const loadBtn = shadow.querySelector('.mm-btn') as HTMLElement | null;
  if (loadBtn) loadBtn.style.display = capsulesCache.length > 0 || panelOpen ? '' : 'none';
  host.style.display = 'block';
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
      const list = await send<ListResponse>({ type: 'LIST_CAPSULES' });
      capsulesCache = list.capsules ?? [];
      renderList('');
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
      void send({ type: 'DELETE_CAPSULE', payload: { id: c.id } }).then(() => {
        capsulesCache = capsulesCache.filter((x) => x.id !== c.id);
        renderList((shadow!.querySelector('.mm-search') as HTMLInputElement).value);
        void refreshVisibility();
      });
    });
    row.appendChild(del);

    listEl.appendChild(row);
  }
}

/** Paste flow: bump access stats, inject into chat input (never sends). */
async function pasteCapsule(c: Capsule): Promise<void> {
  await send({ type: 'UPDATE_ACCESS', payload: { id: c.id } });
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

/** Capture flow: extract conversation → SAVE_CHAT → toast result. */
async function captureChat(): Promise<void> {
  const convo = extractConversation(document);
  if (!convo) {
    toast('No conversation detected on this page.');
    return;
  }
  const res = await send<{ ok: boolean; reason?: string; capsule?: Capsule }>({
    type: 'SAVE_CHAT',
    payload: { platform: convo.platform, messages: convo.messages, rawText: convo.rawText },
  });
  if (res.ok && res.capsule) {
    toast(`Saved "${res.capsule.name}" (${res.capsule.quality})`);
    await refreshVisibility();
  } else {
    toast(res.reason ?? 'Save failed.');
  }
}

// Boot
void (async () => {
  ensureUI();
  if (!host) return; // not a chat page
  await refreshVisibility();
})();

// Re-check when returning to the tab (capsules may have been added elsewhere).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refreshVisibility();
});

// Keyboard-shortcut trigger from the service worker.
chrome.runtime.onMessage.addListener((msg: { type?: string }) => {
  if (msg?.type === 'TRIGGER_CAPTURE') void captureChat();
});

// Settings changes (e.g. from popup) update visibility live.
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') void refreshVisibility();
});
