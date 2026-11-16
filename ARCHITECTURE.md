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
        │                                                │        │ fail?             │
        │                                                │        ▼                  │
        │                                                │  lowQualityFallback       │
        │                                                │        │                  │
        │                                                │  hashContent (SHA-256)    │
        │                                                │  findDuplicate (24h)      │
        │                                                │        │                  │
        │                                                │  storage.ts → IndexedDB   │
        │                                                └───────────────────────────┘
        │ Paste click:
        │   UPDATE_ACCESS → access_count+1, confidence+0.05 (cap 1.0)
        │   buildPrefix(capsule) → injector.insertIntoChat(text)
        ▼
   chat input filled — user presses send. NEVER auto-sends.
```

The popup (`popup.html`/`popup.ts`) talks to the same router for
LIST/DELETE/EXPORT/IMPORT/GET_SETTINGS/SET_SETTINGS.

## IndexedDB schema

Database `meemory`, version 1, object store `capsules` (keyPath `id`).

| Field            | Type     | Notes                                        |
|------------------|----------|----------------------------------------------|
| id               | string   | SHA-256(topic+timestamp)[:24]                |
| name             | string   | slug of topic, ≤40 chars                      |
| capsule          | string   | markdown, ≤3200 chars (~800 tokens)           |
| quality          | string   | `logic` \| `gemini` \| `low`                   |
| platform         | string   | chatgpt/claude/gemini/deepseek/grok/copilot/perplexity/generic |
| token_estimate   | number   | ceil(capsule.length / 4)                      |
| created_at       | number   | epoch ms                                      |
| raw_excerpt      | string   | first 1500 chars of conversation              |
| confidence       | number   | default 1.0, +0.05 per access, cap 1.0        |
| access_count     | number   | default 0                                     |
| search_text      | string   | `(name + " " + capsule + " " + platform).toLowerCase()` |
| content_hash     | string   | SHA-256 of normalized capsule (dedup key)     |

Indexes: `name`, `created_at`, `platform`, `quality`, `search_text`,
`content_hash`.

Settings live in `chrome.storage.local` under `meemory_settings`:
`{ geminiKey, autoPaste, showFloatingButton }`.

**Dedup rule:** if a capsule with the same `content_hash` exists within 24h,
the record is updated in place — `id`, `name`, `created_at`, `confidence`,
`access_count` are preserved; `capsule`, `raw_excerpt`, `token_estimate`,
`quality`, `platform`, `search_text` are refreshed.

**Sort order** (popup + panel): `confidence * (1 + 0.05 * access_count)` desc,
then `created_at` desc.

## Extraction pipeline

Runs in the service worker on `SAVE_CHAT`:

1. **Raw conversation** — `extractor.ts` (content script) resolves the platform
   via host map, scrapes message elements with per-host selectors, classifies
   user/assistant roles, flattens to `role: text` blocks, truncates to 15000
   chars. Fallback: `document.body.innerText`.
2. **Logic pass** — `codeState.extractCodeState` applies pinned regexes:

   ```
   FILES:      /[\w\-/]+\.(html|css|js|ts|jsx|tsx|py|json|md|vue|svelte)/g
   VARIABLES:  /(const|let|var)\s+(\w+)/g
   FUNCTIONS:  /(function\s+(\w+)|(\w+)\s*=\s*(\([^)]*\)\s*=>|function)|(\w+)\s*\([^)]*\)\s*\{)/g
   CLASSES:    /class\s+(\w+)/g
   IMPORTS:    /(import\s+.*from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g
   STRUCTURE:  lines matching /[├└]──|^\s*\|--|\/$/m
   DECISIONS:  sentences containing decided|chose|will use|approach|architecture|instead of|switched to
   NEXT:       sentences containing next|todo|should
   ```

   Topic = first ≤60 chars of first user message (word-boundary trim,
   markdown stripped). Name = topic slugified ≤40 chars.
   Search text = `(name + " " + capsule + " " + platform).toLowerCase()`.
3. **Capsule** — emitted only when ≥2 of {files, variables, functions,
   classes, imports, structure} are non-empty. Format:

   ```
   ## Project: [topic]
   ## Files / ## Variables / ## Functions / ## Classes / ## Imports /
   ## Project Structure / ## Key Decisions / ## Next Steps
   ```

   Cap 3200 chars; on overflow keep Files+Variables+Functions+Key Decisions,
   drop Structure+Next Steps. `quality = "logic"`.
4. **Gemini fallback** — only when <2 structural sections AND a key is
   configured. `gemini-2.0-flash`, `responseMimeType: application/json`,
   20s timeout, prompt demands exhaustive JSON code state. Parsed output is
   normalized into the same capsule format. `quality = "gemini"`.
5. **Ultimate fallback** — 1500-char raw excerpt, `quality = "low"`,
   name = `Untitled chat [timestamp]`.
6. **Store** — hash → dedup check → save (see schema above).

## Injection strategy

`injector.findChatInput` picks the lowest visible `textarea` /
`contenteditable` / `[role="textbox"]` on the page.

- **textarea**: native `HTMLTextAreaElement.prototype.value` setter +
  bubbling `input`/`change` events — works with React/Vue controlled inputs.
- **contenteditable**: `focus()` → `execCommand('selectAll')` equivalent via
  Range → `execCommand('insertText', false, text)`.
- **Fallback**: `navigator.clipboard.writeText` (+ `execCommand('copy')`
  backup) and a toast telling the user to `Ctrl+V`.

The inserted text is always:

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

All injected UI (floating buttons, panel, toast) lives in a Shadow DOM root
attached to a single host div — zero style leakage, zero DOM interference.
