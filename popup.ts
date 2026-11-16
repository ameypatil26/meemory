/**
 * popup.ts — extension popup: capsule list, search/filter, delete,
 * import/export, settings. Dark glass UI with custom dropdowns,
 * spinners, and toast notifications.
 */
import type { Capsule, MeemorySettings } from './storage';

const QUALITY_BADGE: Record<Capsule['quality'], string> = {
  logic: '⚡',
  gemini: '🤖',
  low: '⚠️',
};

interface ListResponse {
  ok: boolean;
  capsules?: Capsule[];
}
interface SettingsResponse {
  ok: boolean;
  settings?: MeemorySettings;
}
interface ImportResponse {
  ok: boolean;
  imported?: number;
  skipped?: number;
  reason?: string;
}
interface ActiveTabResponse {
  ok: boolean;
  tab?: { id: number | null; url: string; title: string } | null;
}
interface CaptureTabResponse {
  ok: boolean;
  success?: boolean;
  error?: string;
  reason?: string;
}
interface PasteResponse {
  ok?: boolean;
  via?: string;
  error?: string;
}

interface SelectOption {
  value: string;
  label: string;
}

let capsules: Capsule[] = [];
let settings: MeemorySettings | null = null;
let platformFilter = '';
let qualityFilter = '';
let selectedId: string | null = null;

/** Sends a runtime message and awaits the response. */
function send<T = unknown>(msg: { type: string; payload?: unknown }): Promise<T> {
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}

/** Escapes text for safe HTML insertion. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/** Shows a transient toast inside the popup. */
function toast(msg: string, kind: 'ok' | 'err' | 'info' = 'info'): void {
  const el = document.getElementById('toast')!;
  el.textContent = msg;
  el.className = `pp-toast show ${kind}`;
  clearTimeout((toast as unknown as { t?: number }).t);
  (toast as unknown as { t?: number }).t = window.setTimeout(() => {
    el.classList.remove('show');
  }, 2600);
}

/** Toggles a loading spinner inside a button. */
function setLoading(btn: HTMLButtonElement, on: boolean): void {
  btn.classList.toggle('loading', on);
  btn.disabled = on;
}

// ---------------- status log ----------------

const LOG_ICONS = { info: 'ℹ️', ok: '✅', warn: '⚠️', err: '❌' } as const;
type LogKind = keyof typeof LOG_ICONS;

/** Appends a timestamped line to the status log and reveals the box. */
function log(kind: LogKind, text: string): void {
  const box = document.getElementById('statusLog')!;
  const body = document.getElementById('statusLogBody')!;
  box.hidden = false;
  const line = document.createElement('div');
  line.className = `pp-log-line ${kind}`;
  const ts = document.createElement('span');
  ts.className = 'pp-log-ts';
  ts.textContent = new Date().toLocaleTimeString([], { hour12: false });
  const msg = document.createElement('span');
  msg.textContent = `${LOG_ICONS[kind]} ${text}`;
  line.appendChild(ts);
  line.appendChild(msg);
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

/** Clears the status log (called at the start of each capture). */
function clearLog(): void {
  document.getElementById('statusLogBody')!.innerHTML = '';
}

/** URL schemes where content scripts cannot run. */
const BLOCKED_PROTOCOLS = [
  'chrome://', 'chrome-extension://', 'edge://', 'about:', 'opera://',
  'brave://', 'devtools://', 'chrome-search://', 'moz-extension://',
  'safari-web-extension://',
];

/**
 * Popup "Capture Current Chat" flow:
 * query active tab → validate URL → forward TRIGGER_CAPTURE to the page's
 * content script → report the structured result in the status log.
 */
async function captureCurrentChat(): Promise<void> {
  const btn = document.getElementById('captureBtn') as HTMLButtonElement;
  setLoading(btn, true);
  clearLog();
  try {
    log('info', 'Checking active tab...');
    const tabRes = await send<ActiveTabResponse>({ type: 'GET_ACTIVE_TAB' });
    const tab = tabRes.tab;
    if (!tabRes.ok || !tab || tab.id == null) {
      log('warn', 'Error: Cannot capture on this tab.');
      return;
    }
    const url = tab.url || '';
    if (!url || BLOCKED_PROTOCOLS.some((p) => url.startsWith(p))) {
      log('warn', 'Error: Cannot capture on this tab.');
      return;
    }

    log('info', `Sending capture message to page... (${url})`);
    const res = await send<CaptureTabResponse>({
      type: 'CAPTURE_TAB',
      payload: { tabId: tab.id },
    });

    if (res.success) {
      log('ok', 'Success! Capsule saved.');
      await refresh();
    } else {
      log('err', `Error: ${res.error ?? res.reason ?? 'Unknown error'}`);
    }
  } catch (err) {
    log('err', `Error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setLoading(btn, false);
  }
}

/** Relative-ish date label for a capsule. */
function dateLabel(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diffH = (now - ts) / 36e5;
  if (diffH < 24) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffH < 24 * 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString();
}

// ---------------- custom select ----------------

/**
 * Wires a `.cx-select` wrapper (button + menu) to a value + onChange callback.
 * @param wrap - the .cx-select element.
 * @param getOptions - returns the current option list.
 * @param getValue - returns the currently selected value.
 * @param onChange - called with the new value.
 */
function initSelect(
  wrap: HTMLElement,
  getOptions: () => SelectOption[],
  getValue: () => string,
  onChange: (v: string) => void,
): void {
  const btn = wrap.querySelector('.cx-btn') as HTMLButtonElement;
  const menu = wrap.querySelector('.cx-menu') as HTMLElement;
  const label = wrap.querySelector('.cx-label') as HTMLElement;

  const closeAll = () => {
    document.querySelectorAll('.cx-menu.show').forEach((m) => m.classList.remove('show'));
    document.querySelectorAll('.cx-btn.open').forEach((b) => b.classList.remove('open'));
  };

  const renderMenu = () => {
    const opts = getOptions();
    const cur = getValue();
    menu.innerHTML = '';
    for (const o of opts) {
      const div = document.createElement('div');
      div.className = 'cx-opt' + (o.value === cur ? ' selected' : '');
      div.textContent = o.label;
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        onChange(o.value);
        sync();
        closeAll();
      });
      menu.appendChild(div);
    }
  };

  const sync = () => {
    const cur = getValue();
    const opt = getOptions().find((o) => o.value === cur);
    label.textContent = opt?.label ?? cur;
    btn.classList.toggle('open', menu.classList.contains('show'));
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = !menu.classList.contains('show');
    closeAll();
    if (willOpen) {
      renderMenu();
      menu.classList.add('show');
      btn.classList.add('open');
    }
  });

  document.addEventListener('click', closeAll);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });

  (wrap as unknown as { resync: () => void }).resync = sync;
}

function resyncSelect(id: string): void {
  const el = document.getElementById(id) as unknown as { resync?: () => void } | null;
  el?.resync?.();
}

// ---------------- data ----------------

/** Loads capsules + settings and renders. */
async function refresh(): Promise<void> {
  const [list, s] = await Promise.all([
    send<ListResponse>({ type: 'LIST_CAPSULES' }),
    send<SettingsResponse>({ type: 'GET_SETTINGS' }),
  ]);
  capsules = list.capsules ?? [];
  settings = s.settings ?? null;
  document.getElementById('count')!.textContent = String(capsules.length);
  render();
  fillSettings();
  resyncSelect('platformSelect');
}

/** Platform options derived from stored capsules. */
function platformOptions(): SelectOption[] {
  const platforms = [...new Set(capsules.map((c) => c.platform))].sort();
  return [
    { value: '', label: 'All platforms' },
    ...platforms.map((p) => ({ value: p, label: p })),
  ];
}

const QUALITY_OPTIONS: SelectOption[] = [
  { value: '', label: 'All quality' },
  { value: 'logic', label: '⚡ Logic' },
  { value: 'gemini', label: '🤖 Gemini' },
  { value: 'low', label: '⚠️ Low' },
];

/** Returns the currently selected capsule, if any. */
function selectedCapsule(): Capsule | undefined {
  return capsules.find((c) => c.id === selectedId);
}

/** Renders (or hides) the capsule detail panel. */
function renderDetail(): void {
  const el = document.getElementById('detail')!;
  const c = selectedCapsule();
  if (!c) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  document.getElementById('detailName')!.textContent = c.name;
  const warn = c.token_estimate > 800 ? ' ⚠️ >800 tok' : '';
  document.getElementById('detailMeta')!.innerHTML =
    `<span class="pp-badge ${c.quality}">${QUALITY_BADGE[c.quality]} ${c.quality}</span>` +
    `<span>${esc(c.platform)}</span><span>·</span><span>~${c.token_estimate} tok${warn}</span>` +
    `<span>·</span><span>${dateLabel(c.created_at)}</span>`;
  const preview = document.getElementById('detailPreview')!;
  preview.textContent = c.capsule.length > 1200 ? c.capsule.slice(0, 1200) + '\n…' : c.capsule;
}

/** Renders the filtered capsule list. */
function render(): void {
  renderDetail();
  const listEl = document.getElementById('list')!;
  const q = (document.getElementById('search') as HTMLInputElement).value.trim().toLowerCase();

  const items = capsules.filter((c) => {
    if (platformFilter && c.platform !== platformFilter) return false;
    if (qualityFilter && c.quality !== qualityFilter) return false;
    if (q && !c.search_text.includes(q)) return false;
    return true;
  });

  if (items.length === 0) {
    listEl.innerHTML = capsules.length === 0
      ? `<div class="pp-empty">
           <div class="pp-empty-icon">🧠</div>
           <div class="pp-empty-title">No memories yet</div>
           <div class="pp-empty-sub">Open an AI chat and press <b>Ctrl/Cmd+Shift+M</b> to capture it.</div>
         </div>`
      : `<div class="pp-empty">
           <div class="pp-empty-icon">🔍</div>
           <div class="pp-empty-title">No matches</div>
           <div class="pp-empty-sub">Try a different search or filter.</div>
         </div>`;
    return;
  }

  listEl.innerHTML = '';
  for (const c of items) {
    const row = document.createElement('div');
    row.className = 'pp-item' + (c.id === selectedId ? ' selected' : '');
    row.style.cursor = 'pointer';
    row.title = 'Click to preview & paste';
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.mm-del')) return;
      selectedId = c.id === selectedId ? null : c.id;
      render();
    });
    const warn = c.token_estimate > 800 ? ' <span class="pp-warn">⚠ &gt;800 tok</span>' : '';
    row.innerHTML = `
      <div class="pp-item-info">
        <div class="pp-item-name">${esc(c.name)}</div>
        <div class="pp-item-meta">
          <span class="pp-badge ${c.quality}">${QUALITY_BADGE[c.quality]} ${c.quality}</span>
          <span>${esc(c.platform)}</span>
          <span>·</span>
          <span>~${c.token_estimate} tok${warn}</span>
          <span>·</span>
          <span>${dateLabel(c.created_at)}</span>
        </div>
      </div>`;
    const del = document.createElement('button');
    del.className = 'mm-del';
    del.textContent = '×';
    del.title = 'Delete capsule';
    del.addEventListener('click', () => {
      if (!confirm(`Delete capsule "${c.name}"?`)) return;
      void send({ type: 'DELETE_CAPSULE', payload: { id: c.id } })
        .then(() => {
          toast('Capsule deleted', 'ok');
          refresh();
        })
        .catch(() => toast('Delete failed', 'err'));
    });
    row.appendChild(del);
    listEl.appendChild(row);
  }
}

/** Fills the settings form from stored values. */
function fillSettings(): void {
  if (!settings) return;
  (document.getElementById('geminiKey') as HTMLInputElement).value = settings.geminiKey;
  (document.getElementById('autoPaste') as HTMLInputElement).checked = settings.autoPaste;
  (document.getElementById('showFloating') as HTMLInputElement).checked = settings.showFloatingButton;
}

/**
 * "Paste to Current Chat" flow for the selected capsule:
 * bump access stats → resolve active tab → PASTE_CAPSULE → content script
 * injects the wrapped capsule text into the chat input (never sends).
 */
async function pasteSelectedCapsule(): Promise<void> {
  const c = selectedCapsule();
  if (!c) return;
  const btn = document.getElementById('pasteBtn') as HTMLButtonElement;
  setLoading(btn, true);
  clearLog();
  try {
    log('info', 'Checking active tab...');
    const tabRes = await send<ActiveTabResponse>({ type: 'GET_ACTIVE_TAB' });
    const tab = tabRes.tab;
    if (!tabRes.ok || !tab || tab.id == null) {
      log('warn', 'Error: Cannot paste on this tab.');
      return;
    }
    const url = tab.url || '';
    if (!url || BLOCKED_PROTOCOLS.some((p) => url.startsWith(p))) {
      log('warn', 'Error: Cannot paste on this tab.');
      return;
    }

    log('info', `Sending "${c.name}" to page... (${url})`);
    await send({ type: 'UPDATE_ACCESS', payload: { id: c.id } }).catch(() => {});
    const res = await send<PasteResponse & { ok?: boolean }>({
      type: 'PASTE_CAPSULE',
      payload: { tabId: tab.id, capsule: c },
    });

    if (res.ok && res.via === 'input') {
      log('ok', 'Capsule injected into chat input — review and press send!');
      toast('Memory loaded — press send to continue.', 'ok');
    } else if (res.via === 'clipboard') {
      log('ok', 'Capsule copied to clipboard — paste with Ctrl+V.');
      toast('Capsule copied — Ctrl+V to place it.', 'ok');
    } else {
      log('err', `Error: ${res.error ?? 'Injection failed'}`);
    }
  } catch (err) {
    log('err', `Error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setLoading(btn, false);
  }
}

// ---------------- export / import ----------------

/** Downloads capsules as JSON with a spinner + toast. */
async function doExport(): Promise<void> {
  const btn = document.getElementById('exportBtn') as HTMLButtonElement;
  setLoading(btn, true);
  try {
    const res = await send<ListResponse>({ type: 'EXPORT_CAPSULES' });
    const blob = new Blob([JSON.stringify(res.capsules ?? [], null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meemory-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${res.capsules?.length ?? 0} capsule(s)`, 'ok');
  } catch {
    toast('Export failed', 'err');
  } finally {
    setLoading(btn, false);
  }
}

/** Reads the picked JSON file and imports it. */
function doImportFile(file: File): void {
  const btn = document.getElementById('importBtn') as HTMLButtonElement;
  setLoading(btn, true);
  void file
    .text()
    .then((text) => {
      const parsed = JSON.parse(text) as unknown;
      const list = Array.isArray(parsed)
        ? parsed
        : ((parsed as { capsules?: unknown[] }).capsules ?? []);
      return send<ImportResponse>({ type: 'IMPORT_CAPSULES', payload: { capsules: list } });
    })
    .then((res) => {
      if (res.ok) {
        toast(`Imported ${res.imported ?? 0} capsule(s)${res.skipped ? `, skipped ${res.skipped}` : ''}`, 'ok');
        refresh();
      } else {
        toast(`Import failed: ${res.reason ?? 'unknown error'}`, 'err');
      }
    })
    .catch(() => toast('Invalid JSON file', 'err'))
    .finally(() => {
      setLoading(btn, false);
      (document.getElementById('importFile') as HTMLInputElement).value = '';
    });
}

// ---------------- wiring ----------------

function bind(): void {
  document.getElementById('search')!.addEventListener('input', render);

  document.getElementById('captureBtn')!.addEventListener('click', () => {
    void captureCurrentChat();
  });

  document.getElementById('pasteBtn')!.addEventListener('click', () => {
    void pasteSelectedCapsule();
  });
  document.getElementById('detailClose')!.addEventListener('click', () => {
    selectedId = null;
    render();
  });

  initSelect(
    document.getElementById('platformSelect')!,
    platformOptions,
    () => platformFilter,
    (v) => { platformFilter = v; render(); },
  );
  initSelect(
    document.getElementById('qualitySelect')!,
    () => QUALITY_OPTIONS,
    () => qualityFilter,
    (v) => { qualityFilter = v; render(); },
  );

  document.getElementById('exportBtn')!.addEventListener('click', () => void doExport());

  const importBtn = document.getElementById('importBtn')!;
  const importFile = document.getElementById('importFile') as HTMLInputElement;
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', () => {
    const file = importFile.files?.[0];
    if (file) doImportFile(file);
  });

  document.getElementById('saveSettings')!.addEventListener('click', () => {
    const btn = document.getElementById('saveSettings') as HTMLButtonElement;
    setLoading(btn, true);
    const patch: Partial<MeemorySettings> = {
      geminiKey: (document.getElementById('geminiKey') as HTMLInputElement).value.trim(),
      autoPaste: (document.getElementById('autoPaste') as HTMLInputElement).checked,
      showFloatingButton: (document.getElementById('showFloating') as HTMLInputElement).checked,
    };
    void send<SettingsResponse>({ type: 'SET_SETTINGS', payload: patch })
      .then((res) => {
        settings = res.settings ?? settings;
        const msg = document.getElementById('settingsMsg')!;
        msg.textContent = 'Saved ✓';
        setTimeout(() => (msg.textContent = ''), 2000);
        toast('Settings saved', 'ok');
      })
      .catch(() => toast('Failed to save settings', 'err'))
      .finally(() => setLoading(btn, false));
  });
}

bind();
void refresh();
