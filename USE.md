# USE.md — MEEMORY User & Developer Guide

A comprehensive operational guide: what the extension does, how to install and
use it, how it works internally, and how to debug or extend it.

---

## 1. Overview

### 1.1 What MEEMORY does

MEEMORY is a Manifest V3 browser extension that gives AI chat assistants a
shared, persistent memory of your project. It:

1. **Captures** the conversation on any supported AI chat page (ChatGPT,
   Claude, Gemini, DeepSeek, Grok, Copilot, Perplexity, plus a generic
   fallback for unknown chat UIs).
2. **Extracts structured code state** — files, variables, functions, classes,
   imports, project structure, key decisions, next steps — using a
   logic-first regex pipeline (no AI call required for typical coding chats).
3. **Stores capsules offline** in IndexedDB with SHA-256 deduplication and
   confidence/access-based ranking.
4. **Injects** a capsule into any new chat's input with one click, so the next
   AI continues the project exactly where it left off — **never auto-sending**;
   you always press send.

Tagline: *"Your AI conversations finally remember each other."*

### 1.2 Install

```bash
cd meemory
npm install
npm run build
```

1. Open `chrome://extensions` (Chrome/Edge/Brave: `edge://extensions`).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** → select the `meemory/` folder.
4. Pin the MEEMORY icon from the puzzle-piece menu for quick popup access.

During development, `npm run watch` rebuilds `background.js`, `content.js`,
and `popup.js` on save; reload the extension at `chrome://extensions` after
each rebuild.

---

## 2. User Operations

### 2.1 Saving a chat

Two equivalent triggers:

- **Keyboard:** press `Ctrl+Shift+M` (Windows/Linux) or `Cmd+Shift+M` (macOS)
  while on the chat page.
- **Button:** click **＋ Save chat** in the floating widget (bottom-right of
  any detected chat page).

What happens:

1. The content script scrapes the visible messages (up to 200 elements,
   15,000 chars of flattened text).
2. The service worker extracts code state and stores a capsule.
3. A toast confirms: `Saved "<name>" (logic|gemini|low)`.

Re-saving the same conversation within 24h **updates the existing capsule**
in place rather than creating a duplicate (hash dedup).

### 2.2 Loading memory in a new chat

1. Open a *new* chat on any supported platform (it can be a different AI than
   the one you captured from — that is the point).
2. When capsules exist, the floating **🧠 Load Memory** button appears
   bottom-right. (**＋ Save chat** is always visible on detected chat pages.)
3. Click **Load Memory** → panel opens with capsules sorted by
   `confidence × (1 + 0.05 × access_count)` — your most useful memories rise.
4. Use the search box to filter by name, platform, or quality.
5. Click **Paste** on a capsule.

Each row shows: name, platform, quality badge (**⚡** logic · **🤖** gemini ·
**⚠️** low), estimated tokens, and a `⚠️ >800 tok` warning when the estimate
exceeds 800.

### 2.3 How Paste / auto-paste works

Paste always performs two things:

1. **UPDATE_ACCESS** — `access_count += 1`, `confidence += 0.05` (cap 1.0),
   which boosts the capsule's future ranking.
2. **Insert** the wrapped capsule text into the chat composer.

The `autoPaste` setting (popup → Settings, **default OFF**) changes *where*
the text lands:

- **OFF (default):** the full capsule text is copied to the clipboard and a
  toast says *"Capsule copied — paste with Ctrl+V."* You choose when and where
  to paste. Safest option.
- **ON:** MEEMORY writes directly into the detected chat input —
  `textarea` via the native value setter, `contenteditable` via
  `execCommand('insertText')`. If injection fails it falls back to clipboard.
  Toast: *"Memory loaded — review and press send."*

Either way, **MEEMORY never presses send**. You review the pre-filled input
and hit send yourself.

### 2.4 Managing capsules (popup)

Click the toolbar icon to open the popup:

- **Search** — filters by name/platform/quality/`search_text` substring.
- **Platform & quality dropdowns** — narrow the list.
- **× button** — deletes a capsule after a confirmation dialog.
- **Export JSON** — downloads all capsules as
  `meemory-export-<timestamp>.json`.
- **Import JSON** — uploads a previously exported file; invalid entries are
  skipped and reported.

### 2.5 Settings

Popup → **Settings** (all stored in `chrome.storage.local`):

| Setting | Default | Effect |
|---|---|---|
| Gemini API key | empty | Enables the fallback extractor when logic finds <2 sections. Key stays on-device; never logged. |
| Auto-fill chat input on Paste | off | Clipboard-only vs. direct input injection (see 2.3). |
| Show floating button | on | Toggles the on-page widget entirely. |

---

## 3. How the Extension Works (Under the Hood)

### 3.1 Component map

```
manifest.json     MV3 wiring: content script on <all_urls>, service worker,
                  popup, Ctrl/Cmd+Shift+M command, icons.
background.ts     Service worker: message router + extraction pipeline +
                  keyboard-shortcut handler.
content.ts        Runs on every page: platform detection, Shadow DOM widget,
                  capture/paste/toast flows.
extractor.ts      DOM → {platform, messages[], rawText}.
codeState.ts      rawText → CodeSections → capsule markdown; hashing; dedup.
gemini.ts         Optional Gemini API fallback.
storage.ts        IndexedDB schema + CRUD + settings.
injector.ts       DOM insertion into chat composers.
popup.html/.ts    Management UI.
styles.css        Shared stylesheet (popup + shadow DOM via text import).
```

### 3.2 What triggers extraction

Two entry points converge on the same pipeline:

- `content.ts` button click → `captureChat()`.
- `chrome.commands.onCommand('capture-chat')` in `background.ts` →
  `chrome.tabs.sendMessage(tabId, {type:'TRIGGER_CAPTURE'})` → the content
  script's `onMessage` listener calls the same `captureChat()`.

`captureChat()` calls `extractConversation(document)` (`extractor.ts`), which:

1. `detectPlatform(url, doc)` — matches `location.hostname` against the host
   map (chatgpt.com, claude.ai/.com, gemini.google.com, chat.deepseek.com,
   grok.com/x.com/i/grok, copilot.microsoft.com/bing.com/chat,
   perplexity.ai). If no host matches, probes for ≥2 generic message
   containers (`[class*="message"]`, `[role="log"]`, `[role="article"]`) and
   returns `'generic'`; otherwise `null` (no widget injected).
2. `collectElements()` — `querySelectorAll` per platform selector set,
   deduplicated, nested-message-aware, capped at 200 elements.
3. `isUserMessage()` — role classification via `data-message-author-role`,
   tag names (`user-query`/`model-response`), `data-testid` hints, and
   user-ish class names; generic pages fall back to class/id heuristics.
4. Each element's `innerText` becomes a `ChatMessage {role, text}`; the list
   is flattened to `"role: text"` blocks joined by blank lines and truncated
   to **15,000 chars**. If zero messages are found, `body.innerText` is the
   fallback; if no user-role message exists, the first is promoted to `user`
   (needed for topic derivation).

### 3.3 From raw text to capsule (`codeState.ts`)

`handleSaveChat()` in `background.ts` receives `{platform, messages, rawText}`
and runs:

1. **`deriveTopic(messages)`** — first user-role message → strip code fences
   and markdown punctuation → collapse whitespace → ≤60 chars at a word
   boundary.
2. **`makeName(topic)`** — lowercase, non-alphanumerics → `-`, collapse/trim,
   ≤40 chars.
3. **`extractCodeState(rawText)`** — the pinned logic pass:

   | Section | Regex / rule |
   |---|---|
   | Files | `[\w\-/]+\.(html|css|js|ts|jsx|tsx|py|json|md|vue|svelte)` — each gets a `desc` from the first sentence mentioning it |
   | Variables | `(const|let|var)\s+(\w+)` — `initialized` detected by scanning the declaration line for `=` (excluding `==`/`=>`) |
   | Functions | three alternation arms covering `function f`, `f = () =>`/`f = function`, and `f(...) {` method syntax; purpose from first mention sentence |
   | Classes | `class\s+(\w+)` |
   | Imports | `import … from 'pkg'` and `require('pkg')` → `{module, pkg}` |
   | Structure | lines matching `[├└]──` or `|--` or ending in `/` (tree drawings) |
   | Decisions | sentences containing decided/chose/will use/approach/architecture/instead of/switched to |
   | Next | sentences containing next/todo/should |

   All sections capped at 12 items; sentences at 220 chars.
4. **Gate:** `countStructuralSections()` counts non-empty sections among
   files/variables/functions/classes/imports/structure. **≥2 → `buildCapsule()`
   with `quality="logic"`.**
5. **`buildCapsule(topic, sections)`** renders the markdown template
   (`## Project:` / `## Files` / `## Variables` / … / `## Next Steps`). If the
   result exceeds **3200 chars**, it re-renders without Structure + Next Steps;
   still over → hard-truncate at a word boundary. `token_estimate =
   ceil(len/4)`; the UI warns when >800.

### 3.4 Gemini fallback

Reached **only** when `countStructuralSections < 2` AND `settings.geminiKey`
is non-empty:

- `extractWithGemini(apiKey, rawText)` POSTs to
  `generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
  with `responseMimeType: "application/json"`, a prompt demanding exhaustive
  JSON code state, and a 20-second `AbortController` timeout.
- Any failure (HTTP error, timeout, bad JSON) returns `null` → pipeline
  continues to the low fallback. The key is never logged.
- Success → `normalizeGemini()` coerces fields → `geminiToCapsule()` maps the
  JSON into the same `CodeSections` shape → `buildCapsule()` →
  `quality="gemini"`.

### 3.5 Ultimate fallback

No structural sections and no Gemini (or Gemini failed): `lowQualityFallback()`
wraps the first 1500 chars of raw text in a `## Raw excerpt (platform)`
header, names it `Untitled chat [YYYY-MM-DD HH:MM]`, `quality="low"`.

### 3.6 SHA-256 dedup

Before storing:

1. `hashContent(capsuleText)` — `crypto.subtle.digest('SHA-256')` over
   `normalizeForHash()` output (lowercase → trim → collapse all whitespace to
   single spaces). Works in both the service worker and window contexts.
2. `findDuplicate(content_hash)` — scans all capsules, returns the first with
   the same hash **and** `created_at ≥ now − 24h`.
3. **Duplicate found** → the record is updated *in place*: `capsule`,
   `raw_excerpt`, `token_estimate`, `quality`, `platform`, `search_text`,
   `content_hash` refresh; `id`, `name`, `created_at`, `confidence`,
   `access_count` are preserved. The capsule "learns" without fragmenting.
4. **No duplicate** → `makeId(topic)` = `hashContent(topic|Date.now())[:24]`,
   then `saveCapsule()` inserts.

### 3.7 IndexedDB storage

`storage.ts` opens database **`meemory` v1**, object store **`capsules`**
(keyPath `id`) with indexes on `name`, `created_at`, `platform`, `quality`,
`search_text`, `content_hash`. All access goes through a promisified
transaction helper. `listCapsules()` returns everything sorted by
`confidence * (1 + 0.05 * access_count)` desc, then `created_at` desc — the
same ordering the popup and panel display. Settings live separately in
`chrome.storage.local` under `meemory_settings`
(`{geminiKey, autoPaste, showFloatingButton}`).

### 3.8 Message router

`background.ts` registers one `chrome.runtime.onMessage` listener that
`switch`es on `msg.type` and always returns `true` to keep the
`sendResponse` channel open for the async handler:

| Type | Handler |
|---|---|
| `SAVE_CHAT` | `handleSaveChat()` — full pipeline above |
| `LIST_CAPSULES` | `listCapsules()` |
| `GET_CAPSULE` / `DELETE_CAPSULE` | point ops |
| `UPDATE_ACCESS` | `access_count+1`, `confidence=min(1, +0.05)` |
| `GET_SETTINGS` / `SET_SETTINGS` | `chrome.storage.local` merge |
| `EXPORT_CAPSULES` | `exportAll()` → JSON |
| `IMPORT_CAPSULES` | validate (`capsule`+`platform` strings) → bulk put |
| `TRIGGER_CAPTURE` | ack (content script initiates capture) |

The popup calls the identical router — it never touches IndexedDB directly,
so all logic stays in one privileged context.

---

## 4. Injection Mechanics

### 4.1 Finding the input

`injector.findChatInput(root)` queries, in order:

```
textarea
[contenteditable="true"]
[contenteditable=""]
div[contenteditable]
[role="textbox"][contenteditable]
```

Candidates are filtered to *visible* elements (`offsetParent` or client rects)
and sorted by `getBoundingClientRect().top` **descending** — chat composers
sit at the bottom, so the lowest match wins.

### 4.2 Per-type insertion

**`<textarea>`** — `setNativeTextareaValue()`:

```ts
const desc = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype, 'value');
desc.set.call(el, text);                       // bypasses own-property shadowing
el.dispatchEvent(new Event('input',  {bubbles:true}));
el.dispatchEvent(new Event('change', {bubbles:true}));
```

Using the *prototype* setter matters: React/Vue controlled inputs track value
through the native setter and their synthetic `onChange`; assigning
`el.value = …` on the instance can be missed or instantly reverted. The
bubbling `input` event is what the framework actually listens for.

**`contenteditable`** — `insertContentEditable()`:

```ts
el.focus();
const range = document.createRange();
range.selectNodeContents(el);          // select existing content
sel.removeAllRanges(); sel.addRange(range);
document.execCommand('insertText', false, text);  // replaces selection
el.dispatchEvent(new Event('input', {bubbles:true}));
```

`execCommand('insertText')` is the legacy-but-universal path that rich-text
editors (ProseMirror, Lexical, Draft.js, contenteditable polyfills) observe
as a genuine user edit — it goes through `beforeinput`/mutation paths rather
than raw DOM writes, so editor state stays consistent. Selecting all contents
first means Paste *replaces* prior draft text with the capsule (intended:
the capsule is the message).

**Fallback** — if no input is found, `execCommand` returns false, or the
setter throws: `copyToClipboard()` tries `navigator.clipboard.writeText`,
then a hidden-textarea + `execCommand('copy')` backup. The UI toasts
*"Capsule copied — paste with Ctrl+V."*

### 4.3 Why host pages don't break

- All UI (buttons, panel, toast) lives in **one ShadowRoot** on a single host
  div — page CSS can't reach in, widget styles can't leak out.
- The host is appended to `documentElement`, `position: fixed`,
  `z-index: 2147483647`, pointer-events only on its own elements.
- No page globals are monkey-patched; the only prototype access is a
  *read* of the native setter (never overwritten).
- `run_at: document_idle`, `<all_urls>` — no injection into iframes, no
  blocking.
- Extraction is read-only (`innerText`, `querySelectorAll`); the sole
  mutation is the deliberate input write on explicit Paste.

---

## 5. Function Call Trace

### 5.1 User clicks "＋ Save chat" (or presses Ctrl+Shift+M)

```
content.ts  captureChat()
  └─ extractor.ts  extractConversation(document)
       ├─ detectPlatform(location.href, document)        → "chatgpt"
       ├─ collectElements(doc, spec)                       → HTMLElement[]
       ├─ isUserMessage(el, spec) per element              → role tags
       └─ returns { platform, messages, rawText(≤15000) }
  └─ chrome.runtime.sendMessage({type:"SAVE_CHAT", payload})
        │
        ▼  background.ts  onMessage listener → handleSaveChat(payload)
             ├─ getSettings()                     (storage.ts → chrome.storage.local)
             ├─ deriveTopic(messages)             (codeState.ts)
             ├─ makeName(topic)                   (codeState.ts)
             ├─ extractCodeState(rawText)         (codeState.ts — pinned regexes)
             ├─ countStructuralSections(sections)
             │    ├─ ≥2 → buildCapsule()          quality="logic"
             │    └─ <2 → gemini.ts extractWithGemini(key, rawText)
             │              → geminiToCapsule()    quality="gemini"  (or null)
             │         → lowQualityFallback()     quality="low"
             ├─ hashContent(capsuleText)          SHA-256, normalized
             ├─ findDuplicate(hash)               24h window?
             │    ├─ yes → saveCapsule(updated)   in-place refresh
             │    └─ no  → makeId() → saveCapsule()  INSERT
             └─ sendResponse({ok, capsule})
  ◄──── content.ts toast(`Saved "name" (quality)`)
        refreshVisibility() → Load Memory button appears (capsules > 0)
```

### 5.2 User clicks "Paste" on a capsule

```
content.ts  pasteCapsule(capsule)
  ├─ sendMessage({type:"UPDATE_ACCESS", payload:{id}})
  │     background.ts → storage.ts updateAccess(id)
  │       access_count+1; confidence=min(1.0, +0.05); store.put()
  ├─ buildPrefix(capsule)  → "[MEEMORY CAPSULE …]---capsule---Continue…"
  ├─ settings.autoPaste?
  │    ├─ false → injector.copyToClipboard(text) → toast "paste with Ctrl+V"
  │    └─ true  → injector.insertIntoChat(text)
  │               ├─ findChatInput()              → {el, kind}
  │               ├─ kind=="textarea" → setNativeTextareaValue()
  │               │     prototype setter + input/change events
  │               ├─ kind=="contenteditable" → insertContentEditable()
  │               │     focus → Range select → execCommand insertText
  │               └─ failure → copyToClipboard() → toast fallback
  └─ (user presses send — MEEMORY never does)
```

### 5.3 Popup operations

Every popup action is a `chrome.runtime.sendMessage` to the same router —
the popup bundle contains **no** storage/extraction code:

| UI action | Message | Backend path |
|---|---|---|
| Open popup | `LIST_CAPSULES` + `GET_SETTINGS` (parallel) | `listCapsules()` sorted by score; settings merged over defaults |
| Search/filter | *(client-side only)* | filters `search_text`, `platform`, `quality` in `popup.ts` |
| × delete | `DELETE_CAPSULE {id}` | `deleteCapsule(id)` → `store.delete` |
| Export JSON | `EXPORT_CAPSULES` | `exportAll()` → Blob download |
| Import JSON | `IMPORT_CAPSULES {capsules}` | `isCapsuleLike` validation → `importCapsules()` bulk put |
| Save settings | `SET_SETTINGS {patch}` | merge into `meemory_settings` → `chrome.storage.local.set` |

The `chrome.storage.onChanged` listener in `content.ts` re-runs
`refreshVisibility()` so toggling "Show floating button" in the popup takes
effect on open chat tabs immediately.

### 5.4 End-to-end summary

```
page DOM ──extractor──▶ rawText ──codeState──▶ sections ──▶ capsule markdown
                                                              │
                                          hash(SHA-256) ──dedup──▶ IndexedDB
                                                                 │
new page ◀──Shadow DOM panel── LIST_CAPSULES ◀── score sort ◀───┘
     │ Paste → UPDATE_ACCESS → insertIntoChat → composer (never sent)
```

Everything runs on-device; the only network call in the entire system is the
optional, user-keyed Gemini request, and it degrades silently to the
low-quality excerpt when unavailable.
