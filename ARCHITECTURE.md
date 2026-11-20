# MEEMORY — Architecture

## Data flow

```
┌──────────────────────┐   chrome.runtime.sendMessage    ┌───────────────────────────┐
│  content.ts (page)   │ ───── SAVE_CHAT ──────────────► │  background.ts (SW)       │
│  extractor.ts        │   {platform, messages, rawText} │                           │
│  injector.ts         │                                 │  codeState.extractCodeState│
│  Shadow DOM widget   │ ◄──── LIST/DELETE/UPDATE ────── │  (regex logic pass)        │
└──────────────────────┘                                 │        │ <2 sections?     │
        ▲                                                │        ▼                  │
        │ TRIGGER_CAPTURE (Ctrl/Cmd+Shift+M)             │  gemini.ts (optional)      │
        │  or popup CAPTURE_TAB / PASTE_CAPSULE          │  gemini-3.8-flash          │
        │                                                │        │ fail?             │
        │                                                │        ▼                  │
        │                                                │  lowQualityFallback       │
        │                                                │  (first 1k + last 2k)     │
        │                                                │        │                  │
        │                                                │  chrome.tabs.captureVisible│
        │                                                │  Tab → screenshot thumb   │
        │                                                │  hashContent (SHA-256)    │
        │                                                │  findDuplicate (24h)      │
        │                                                │        │                  │
        │                                                │  storage.ts → IndexedDB   │
        │                                                └───────────────────────────┘
        │ Paste click / drag-drop:
        │   UPDATE_ACCESS → access_count+1, confidence+0.05 (cap 1.0)
        │   buildInjectionText(capsule) → injector.insertIntoChat(text, target?)
        ▼
   chat input filled — user presses send. NEVER auto-sends.
```

The popup (`popup.html`/`popup.ts`) talks to the same router for
LIST/DELETE/EXPORT/IMPORT/GET_SETTINGS/SET_SETTINGS/GET_ACTIVE_TAB/
CAPTURE_TAB/PASTE_CAPSULE.

## IndexedDB schema

Database `meemory`, version 1, object store `capsules` (keyPath `id`).

| Field            | Type     | Notes                                        |
|------------------|----------|----------------------------------------------|
| id               | string   | random id                                    |
| name             | string   | `Memory N`, `Memory N (Topic)`, or `Memory N: <5 words>` |
| capsule          | string   | markdown, ≤3200 chars (~800 tokens)           |
| quality          | string   | `logic` \| `gemini` \| `low`                   |
| platform         | string   | chatgpt/claude/gemini/deepseek/grok/copilot/perplexity/generic/custom/gmail/whatsapp/selection |
| token_estimate   | number   | ceil(capsule.length / 4)                      |
| created_at       | number   | epoch ms — list sort key (newest first)       |
| raw_excerpt      | string   | first 1500 chars of conversation              |
| confidence       | number   | default 1.0, +0.05 per access, cap 1.0        |
| access_count     | number   | default 0                                     |
| search_text      | string   | `(name + " " + capsule + " " + platform).toLowerCase()` |
| content_hash     | string   | SHA-256 of normalized capsule (dedup key)     |
| screenshot       | string?  | JPEG data-URL thumbnail from captureVisibleTab |

Indexes: `name`, `created_at`, `platform`, `quality`, `search_text`,
`content_hash`.

Settings live in `chrome.storage.local` under `meemory_settings`:
`{ geminiKey, autoPaste, showFloatingButton, customDomains }`.

**Dedup rule:** if a capsule with the same `content_hash` exists within 24h,
the record is updated in place — `id`, `name`, `created_at`, `confidence`,
`access_count` are preserved; `capsule`, `raw_excerpt`, `token_estimate`,
`quality`, `platform`, `search_text`, `screenshot` are refreshed.

**Sort order** (popup + panel): `created_at` descending — newest first.

## Platform detection (extractor.ts)

`detectPlatform(url, doc, customDomains)` resolves in order:

1. **Hardcoded host map** — chatgpt.com, claude.ai, gemini.google.com,
   chat.deepseek.com, grok.com/x.ai, copilot/bing chat paths,
   perplexity.ai, qwen.ai.
2. **Web sources** — `mail.google.com` → `gmail`, `web.whatsapp.com` →
   `whatsapp`.
3. **Custom domains** — user-configured list from settings; exact host or
   subdomain match → `custom`.
4. **Generic probing** — ≥2 generic message containers
   (`[class*="message"]`, `[role="log"]`, `[role="article"]`) → `generic`.
5. **AI-ish hostnames** — host ending `.ai`/`.chat` or starting `chat.` →
   `generic`.
6. **Chat-input probe** — any page with a chat-sized `textarea` (≥2 rows or
   ≥40px) or `contenteditable` ≥40px → `generic`.

If nothing matches, no floating UI appears.

## DOM pruning

Before any text extraction, `cleanedScope()` clones `document.body` and
removes `nav`, `header`, `footer`, `button`, `script`, `style`, `noscript`,
`svg`, `iframe`, `[role=navigation|banner|contentinfo]`, and any element whose
class/id contains `login`, `signup`, `sign-up`, `menu`, or `sidebar`
(case-insensitive). The live page is never mutated. `contentRoots()` then
prefers `main`, `article`, `[role="main"]` as extraction roots, falling back
to the whole cleaned scope; message selectors are retried on the full scope
if roots yield nothing.

## Extraction pipeline

Runs in the service worker on `SAVE_CHAT`:

1. **Message-level capture** — `content.ts` checks `window.getSelection()`
   first; a selection ≥20 chars becomes the capsule payload (platform falls
   back to `selection`). No selection → normal extraction.
2. **Raw conversation** — `extractor.extractConversation` resolves the
   platform, scrapes message elements with per-host selectors, classifies
   user/assistant roles, flattens to `role: text` blocks, truncates to 15000
   chars. Generic fallback: cleaned `scope.textContent`. Web sources scrape
   the visible thread directly (Gmail `[role="main"]`, WhatsApp `#main` /
   conversation panel).
3. **Logic pass** — `codeState.extractCodeState` applies pinned regexes:

   ```
   FILES:      /[\w\-/]+\.(html|css|js|ts|jsx|tsx|py|json|md|vue|svelte)/g
   VARIABLES:  /(const|let|var)\s+(\w+)/g
   FUNCTIONS:  /(function\s+(\w+)|(\w+)\s*=\s*(\([^)]*\)\s*=>|function)|(\w+)\s*\([^)]*\)\s*\{)/g
   CLASSES:    /class\s+(\w+)/g
   IMPORTS:    /(import\s+.*from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g
   STRUCTURE:  lines matching /[├└]──|^\s*\|--|\/$/m
   CHAPTERS:   lines matching markdown headings or
               Chapter|Part|Prologue|Epilogue|Act markers (deduped, ≤12)
   SUMMARY:    lastAssistantSummary() — first 2–3 sentences of the last
               assistant message (≤400 chars)
   DECISIONS:  sentences containing decided|chose|will use|approach|architecture|instead of|switched to
   NEXT:       sentences containing next|todo|should
   ```

   `countStructuralSections` counts non-empty {files, variables, functions,
   classes, imports, structure, chapters} plus `summary` — so prose chats
   (chapters + summary) clear the ≥2 gate and get a real `logic` capsule.
4. **Capsule** — emitted when the gate passes. Format:

   ```
   ## Project: [topic]
   ## Summary            (when present)
   ## Files / ## Variables / ## Functions / ## Classes / ## Imports /
   ## Chapters           (when present) / ## Project Structure /
   ## Key Decisions / ## Next Steps
   ```

   Cap 3200 chars; on overflow keep Files+Variables+Functions+Key Decisions,
   drop Structure+Next Steps. `quality = "logic"`.
5. **Gemini fallback** — only when <2 structural sections AND a key is
   configured. `gemini-3.8-flash`, `responseMimeType: application/json`,
   20s timeout, prompt demands exhaustive JSON state (incl. chapters +
   summary). `isPlausibleApiKey` accepts `AIza*` and `AQ.*` prefixes (and any
   ≥30-char key). `quality = "gemini"`.
6. **Ultimate fallback** — aggressive truncation: first 1000 chars + last
   2000 chars joined by `…[middle truncated to save tokens]…`,
   `quality = "low"`.
7. **Naming** — prose chats (zero code artifacts) with an assistant summary
   → `Memory N: <first 5 words>`; Gemini topic → `Memory N (Topic)`; else
   `Memory N` (sequential by capsule count).
8. **Screenshot** — `chrome.tabs.captureVisibleTab` (JPEG q50) on every save;
   stored as `screenshot` data-URL. Failure never blocks the save.
9. **Store** — hash → dedup check → save (see schema above).

## Injection strategy

`injector.findChatInput` picks the lowest visible `textarea` /
`contenteditable` / `[role="textbox"]` on the page; `insertIntoChat` accepts
an optional preferred element (used by drag-and-drop).

- **textarea**: native `HTMLTextAreaElement.prototype.value` setter +
  bubbling `input`/`change` events — works with React/Vue controlled inputs.
- **contenteditable**: synthetic `ClipboardEvent('paste')` carrying a
  `DataTransfer` (`text/plain` + `text/html`) — the editor-native path for
  ProseMirror/Lexical/React editors like Gemini's; verified by textContent
  growth, then `execCommand('insertText')` fallback.
- **Fallback**: `navigator.clipboard.writeText` (+ `execCommand('copy')`
  backup) and a toast telling the user to `Ctrl+V`.

**Drag and drop:** popup cards and panel rows are `draggable` and write
`application/x-meemory-capsule` (full capsule JSON) + `text/plain` to
`dataTransfer`. `content.ts` has capture-phase `dragover`/`drop` listeners;
on drop it parses the capsule, bumps `access_count`, resolves the drop target
via `closest('textarea, [contenteditable], [role="textbox"]')`, and calls
`insertIntoChat` — the same injection path, no clipboard round-trip.

The inserted text is always built by `buildInjectionText(capsule)`:

```
[MEEMORY CAPSULE — Project State]
Continue this project from where it left off. Do NOT restart. The state below is current.

---
{capsule}
---
Continue. Do not repeat what is already done. Build on this state.
```

`autoPaste` setting (default off): when off, Paste copies to clipboard only;
when on, Paste writes into the detected input. Neither path ever sends.

## UI architecture

- **Popup** (`popup.html`/`popup.ts`, 400px dark-glass theme): header +
  capsule count, animated **⚡ Capture Current Chat** button, hidden-by-default
  **status/error log** (timestamped `ℹ️`/`⚠️`/`❌`/`✅` lines) driven by the
  `GET_ACTIVE_TAB` → `CAPTURE_TAB`/`PASTE_CAPSULE` flow, searchable capsule
  cards (thumbnail, quality badge, platform, ~tokens, `Nov 16, 12:22 AM`
  timestamp), click → detail view (screenshot + capsule preview + Paste),
  custom dropdown filters, settings panel (Gemini key, custom domains,
  auto-paste, floating toggle), export/import, toast notifications.
- **Floating widget** (`content.ts`, Shadow DOM under `#meemory-root`):
  opaque `#1a1a2e` panel immune to host theming — **🧠 Load Memory** (when
  capsules exist), **＋ Save chat**, **🤖 Send to AI** (gmail/whatsapp only);
  panel lists capsules newest-first with search, badges, timestamps,
  per-item delete, and draggable rows.
- All injected UI lives in a Shadow DOM root — zero style leakage, zero DOM
  interference.
