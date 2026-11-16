/**
 * popup.ts — extension popup: capsule list, search/filter, delete,
 * import/export, and settings.
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

let capsules: Capsule[] = [];
let settings: MeemorySettings | null = null;

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

/** Loads capsules + settings and renders. */
async function refresh(): Promise<void> {
  const [list, s] = await Promise.all([
    send<ListResponse>({ type: 'LIST_CAPSULES' }),
    send<SettingsResponse>({ type: 'GET_SETTINGS' }),
  ]);
  capsules = list.capsules ?? [];
  settings = s.settings ?? null;
  populatePlatformFilter();
  render();
  fillSettings();
}

/** Fills the platform dropdown from observed platforms. */
function populatePlatformFilter(): void {
  const sel = document.getElementById('platformFilter') as HTMLSelectElement;
  const current = sel.value;
  const platforms = [...new Set(capsules.map((c) => c.platform))].sort();
  sel.innerHTML = '<option value="">All platforms</option>';
  for (const p of platforms) {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    sel.appendChild(opt);
  }
  sel.value = current;
}

/** Renders the filtered capsule list. */
function render(): void {
  const listEl = document.getElementById('list')!;
  const q = (document.getElementById('search') as HTMLInputElement).value.trim().toLowerCase();
  const pf = (document.getElementById('platformFilter') as HTMLSelectElement).value;
  const qf = (document.getElementById('qualityFilter') as HTMLSelectElement).value;

  const items = capsules.filter((c) => {
    if (pf && c.platform !== pf) return false;
    if (qf && c.quality !== qf) return false;
    if (q && !c.search_text.includes(q)) return false;
    return true;
  });

  if (items.length === 0) {
    listEl.innerHTML = '<div class="pp-empty">No capsules yet. Capture a chat with Ctrl/Cmd+Shift+M.</div>';
    return;
  }

  listEl.innerHTML = '';
  for (const c of items) {
    const row = document.createElement('div');
    row.className = 'mm-item pp-item';
    const warn = c.token_estimate > 800 ? ' <span class="pp-warn">⚠️ &gt;800 tok</span>' : '';
    row.innerHTML = `
      <div class="mm-item-info">
        <div class="mm-item-name">${esc(c.name)}</div>
        <div class="mm-item-meta">${esc(c.platform)} · ${QUALITY_BADGE[c.quality]} ${c.quality} · ~${c.token_estimate} tok${warn} · ${new Date(c.created_at).toLocaleDateString()}</div>
      </div>`;
    const del = document.createElement('button');
    del.className = 'mm-del';
    del.textContent = '×';
    del.title = 'Delete capsule';
    del.addEventListener('click', () => {
      if (!confirm(`Delete capsule "${c.name}"?`)) return;
      void send({ type: 'DELETE_CAPSULE', payload: { id: c.id } }).then(refresh);
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

/** Wires up controls. */
function bind(): void {
  document.getElementById('search')!.addEventListener('input', render);
  document.getElementById('platformFilter')!.addEventListener('change', render);
  document.getElementById('qualityFilter')!.addEventListener('change', render);

  document.getElementById('exportBtn')!.addEventListener('click', () => {
    void send<ListResponse>({ type: 'EXPORT_CAPSULES' }).then((res) => {
      const blob = new Blob([JSON.stringify(res.capsules ?? [], null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meemory-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  const importBtn = document.getElementById('importBtn')!;
  const importFile = document.getElementById('importFile') as HTMLInputElement;
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', () => {
    const file = importFile.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as unknown;
        const list = Array.isArray(parsed) ? parsed : ((parsed as { capsules?: unknown[] }).capsules ?? []);
        void send<ImportResponse>({
          type: 'IMPORT_CAPSULES',
          payload: { capsules: list },
        }).then((res) => {
          alert(
            res.ok
              ? `Imported ${res.imported ?? 0} capsule(s)${res.skipped ? `, skipped ${res.skipped}` : ''}.`
              : `Import failed: ${res.reason ?? 'unknown error'}`,
          );
          refresh();
        });
      } catch {
        alert('Invalid JSON file.');
      }
      importFile.value = '';
    });
  });

  document.getElementById('saveSettings')!.addEventListener('click', () => {
    const patch: Partial<MeemorySettings> = {
      geminiKey: (document.getElementById('geminiKey') as HTMLInputElement).value.trim(),
      autoPaste: (document.getElementById('autoPaste') as HTMLInputElement).checked,
      showFloatingButton: (document.getElementById('showFloating') as HTMLInputElement).checked,
    };
    void send<SettingsResponse>({ type: 'SET_SETTINGS', payload: patch }).then((res) => {
      settings = res.settings ?? settings;
      const msg = document.getElementById('settingsMsg')!;
      msg.textContent = 'Saved.';
      setTimeout(() => (msg.textContent = ''), 2000);
    });
  });
}

bind();
void refresh();
