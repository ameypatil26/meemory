# USE.md — MEEMORY User & Developer Guide

A comprehensive operational guide: what the extension does, how to install and
use it, how it works internally, and how to debug or extend it.

---

## 1. Overview

### 1.1 What MEEMORY does

MEEMORY is a Manifest V3 browser extension that gives AI chat assistants a
shared, persistent memory of your projects and conversations. It:

1. **Detects** chat interfaces almost anywhere — the 7 major AI platforms
   (ChatGPT, Claude, Gemini, DeepSeek, Grok, Copilot, Perplexity), Gmail and
   WhatsApp Web as context sources, any `.ai`/`.chat`/`chat.*` hostname, any
   page with a chat-sized input, and user-defined **custom domains**.
2. **Captures** conversations three ways: full-page extraction, **message-level
   capture** (highlight text first), and **Send to AI** scraping for
   Gmail/WhatsApp threads. Every save also grabs a **screenshot thumbnail**.
3. **Extracts structured state** — files, variables, functions, classes,
   imports, project structure, chapter headings, a prose summary, key
   decisions, next steps — via a logic-first pipeline; Gemini
   (`gemini-3.8-flash`, optional) is only a fallback.
4. **Stores capsules offline** in IndexedDB — SHA-256 dedup, sequential
   `Memory N` naming, newest-first ordering, creation timestamps.
5. **Injects** capsules into any new chat — via the popup's **Paste to
   Current Chat**, the in-page panel's **Paste**, or **drag-and-drop** onto
   the chat input — **never auto-sending**; you always press send.

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

For development: `npm run watch` rebuilds on change — reload the extension
after each rebuild.

---

## 2. User Operations

### 2.1 Saving a chat (three ways)

**Keyboard shortcut** — press `Ctrl+Shift+M` (Win/Linux) or `Cmd+Shift+M`
(macOS) on any detected chat page.

**Popup capture** — click the MEEMORY icon → **⚡ Capture Current Chat**. The
**Status / Error Log** below the button narrates every step live:

```
ℹ️  Checking active tab...
ℹ️  Sending capture message to page...
✅ Success! Capsule saved.
```

Failures are explicit: `⚠️ Error: Cannot capture on this tab.` for
`chrome://`/`about:`/`edge://` pages, `❌ Error: [message]` when the content
script reports one (e.g. "No chat messages found on page").

**Floating widget** — on any detected page, bottom-right:

- **＋ Save chat** — captures the current conversation.
- **🧠 Load Memory** — appears once ≥1 capsule exists; opens the searchable
  in-page panel.
- **🤖 Send to AI** — appears *only* on Gmail and WhatsApp Web; scrapes the
  visible email/thread into a capsule.

**Message-level capture** — highlight any text on the page first, then use
any save path (shortcut, popup button, floating button). Only the selection
(≥20 chars) is captured; no selection → normal full extraction.

### 2.2 Where the floating buttons appear

The widget shows when `detectPlatform()` resolves a platform:

- Hardcoded hosts: chatgpt.com, claude.ai, gemini.google.com,
  chat.deepseek.com, grok.com/x.ai, Copilot/Bing chat, perplexity.ai, qwen.ai.
- Web sources: mail.google.com (Gmail), web.whatsapp.com (WhatsApp).
- Custom domains you add in Settings (exact host or subdomain match).
- Any `.ai`/`.chat` hostname or `chat.*` subdomain.
- **Any page** containing ≥2 generic message containers, or a chat-sized
  `textarea`/`contenteditable` — even `example.com` with a big text box.

Before scraping, the page DOM is cloned and pruned — `nav`, `header`,
`footer`, `button`, `script`, `style`, `svg`, `iframe`, and elements whose
class/id contains `login`, `signup`, `sign-up`, `menu`, or `sidebar` are
removed; text comes only from `main`/`article`/`[role="main"]` or detected
message containers. "Log in" / "Sign up for free" never reach the capsule.

### 2.3 Loading memory into a new chat

1. Open a **new** chat on any AI site (the widget appears there too).
2. Click **🧠 Load Memory** → the opaque dark panel lists capsules
   **newest first**, each with quality badge (⚡/🤖/⚠️), platform, ~token
   count, creation timestamp (e.g. `Nov 16, 12:22 AM`), and a >800-token
   warning when relevant. Search and per-item delete are built in.
3. Choose a capsule and either:
   - click **Paste** in the panel, or
   - **drag the capsule row onto the chat input** — direct injection, no
     clipboard (works on ProseMirror editors like Gemini via a synthetic
     paste event).
4. The injected block looks like:

   ```
   [MEEMORY CAPSULE — Project State]
   Continue this project from where it left off. Do NOT restart. ...
   ---
   {capsule}
   ---
   Continue. Do not repeat what is already done. Build on this state.
   ```

5. **You press send.** MEEMORY never submits messages.

### 2.4 Popup capsule management

- **Search** across name/capsule/platform; filter by **platform** and
  **quality** via the custom dropdowns.
- **Click a card** → detail view: screenshot, full capsule preview, quality
  badge, token estimate, timestamp, and **⬆ Paste to Current Chat** (runs the
  same logged `ℹ️ → ✅/❌` flow as capture).
- **Drag a card** from the popup onto a chat input also injects (popup drag
  works where the browser keeps the popup alive; the in-page panel drag is
  the most reliable path).
- **✕** deletes with confirmation; confidence/access_count update on every
  paste or drag-inject.
- **Export / Import** — JSON backup/restore with spinner + toast feedback.
- Cards show the **screenshot thumbnail**, `Memory N` name, platform,
  `~N tok`, quality badge, and creation timestamp.

### 2.5 Settings (popup → Settings)

| Setting | Effect |
|---|---|
| **Gemini API key** | Enables the fallback extractor. Accepts `AIza…` and `AQ.…` keys. Stored in `chrome.storage.local`; never transmitted anywhere except Google's API when a fallback runs. |
| **Custom AI domains** | Comma-separated hostnames (e.g. `myai.internal, chat.example.com`). Matching hosts/subdomains get the floating widget + generic extraction. |
| **Auto-fill chat input on Paste** | Off (default): Paste copies to clipboard — `Ctrl+V` to place. On: Paste writes directly into the detected input (textarea setter / paste event / `execCommand`). Never sends either way. |
| **Show floating button** | Master toggle for the in-page widget. |

---

## 3. How the Extension Works (Under the Hood)

### 3.1 The capture round-trip

**Via shortcut** (`Ctrl/Cmd+Shift+M`):

1. `manifest.json` `commands` maps the shortcut; `background.ts` listens on
   `chrome.commands.onCommand`.
2. It queries the active tab, rejects `chrome://`/`about:`/`edge://` URLs,
   and sends `TRIGGER_CAPTURE` via `chrome.tabs.sendMessage` (with one retry
   for slowly-initializing content scripts).
3. `content.ts`'s listener calls `captureChat()`:
   - **Selection check** — `window.getSelection()`; ≥20 chars → payload is
     the selection alone.
   - Otherwise `extractor.extractConversation(document, customDomains)`.
   - Returns `{success:true}` or `{success:false, error}` via `sendResponse`
     (the listener returns `true` to hold the channel — this was the fix for
     the "message channel closed" bug).
4. `content.ts` sends `SAVE_CHAT` to the background service worker.

**Via popup**: **⚡ Capture Current Chat** → popup sends `GET_ACTIVE_TAB`
(returns `{id, url, title}`), validates the protocol, then `CAPTURE_TAB`
which forwards `TRIGGER_CAPTURE` to that tab and awaits the structured
result. Every step is written to the on-screen status log.

**Via floating button / Send to AI**: same `captureChat()` path, minus the
popup log (page toast instead).

### 3.2 Extraction internals (`extractor.ts`)

- `detectPlatform(url, doc, customDomains)` — host map → web sources
  (`gmail`, `whatsapp`) → custom domains → generic message-container probe
  → `.ai`/`.chat`/`chat.` hostname → chat-input probe.
- `cleanedScope(doc)` — clones `document.body`, removes all UI chrome
  (selector list in ARCHITECTURE.md), returns the clone. The live page is
  never mutated.
- `contentRoots(scope)` — `main`/`article`/`[role="main"]` if present, else
  the whole scope.
- `collectElements(roots, spec)` — per-platform `messageSelectors`,
  deduped, nested-message-aware, capped at 500.
- Role classification via `userSelectors`/`userTags`/`assistantTags` per
  platform spec; generic elements default to assistant except the first.
- Web sources scrape `[role="main"]` (Gmail) or `#main`/conversation panel
  (WhatsApp) directly into a single-block conversation.
- Output: `{platform, messages[{role,text}], rawText}` where `rawText` is
  `role: text` blocks joined by `\n\n`, truncated to **15000 chars**.

### 3.3 The logic pass (`codeState.ts`)

`extractCodeState(rawText)` applies the **pinned regexes** (do not tune —
see AGENT.md):

```
FILES:      /[\w\-/]+\.(html|css|js|ts|jsx|tsx|py|json|md|vue|svelte)/g
VARIABLES:  /(const|let|var)\s+(\w+)/g
FUNCTIONS:  /(function\s+(\w+)|(\w+)\s*=\s*(\([^)]*\)\s*=>|function)|(\w+)\s*\([^)]*\)\s*\{)/g
CLASSES:    /class\s+(\w+)/g
IMPORTS:    /(import\s+.*from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g
STRUCTURE:  tree-drawing lines
CHAPTERS:   markdown headings + Chapter|Part|Prologue|Epilogue|Act lines
SUMMARY:    lastAssistantSummary() — first 2–3 sentences of last assistant msg
DECISIONS:  decided|chose|will use|approach|architecture|instead of|switched to
NEXT:       next|todo|should
```

`countStructuralSections` counts non-empty sections **including chapters and
summary** — a book/prose chat (chapters + summary = 2) now produces a real
`logic` capsule instead of raw fallback.

`buildCapsule(topic, sections)` renders markdown sections in order —
`## Project`, `## Summary`, `## Files`, `## Variables`, `## Functions`,
`## Classes`, `## Imports`, `## Chapters`, `## Project Structure`,
`## Key Decisions`, `## Next Steps` — capped at **3200 chars**; on overflow it
drops Structure + Next Steps first. `token_estimate = ceil(len/4)`; >800
displays a ⚠️.

### 3.4 Gemini fallback (`gemini.ts`)

Only when `countStructuralSections < 2` **and** a key is configured:

- Model: **`gemini-3.8-flash`** (Google's current recommended model;
  `gemini-2.0-flash` was shut down June 2026).
- Endpoint: `…/v1beta/models/gemini-3.8-flash:generateContent?key=…`
- `responseMimeType: application/json`, 20s `AbortController` timeout.
- Prompt demands exhaustive JSON state incl. `chapters` and `summary`;
  `normalizeGemini`/`geminiToCapsule` map it into the same capsule format.
- `isPlausibleApiKey` accepts `AIza*` and `AQ.*` prefixes plus any ≥30-char
  key — AI Studio's new `AQ.` format is not rejected.
- Any HTTP/parse failure → `null` → low fallback. **Silent by design.**

### 3.5 Ultimate fallback + naming (`codeState.ts` / `background.ts`)

`lowQualityFallback` no longer stores 15k chars: over 3000 chars it keeps
**first 1000 + last 2000** joined by `…[middle truncated to save tokens]…` —
project setup plus most recent state, ~750 tokens max.

Naming in `background.ts`:

- Prose chat (zero code artifacts) + assistant summary →
  `Memory N: <first 5 words of last AI reply>`
- Gemini success with topic → `Memory N (Topic)`
- Otherwise → `Memory N` (sequential by existing capsule count)

### 3.6 Dedup, screenshots, storage (`background.ts` / `storage.ts`)

- `hashContent` = SHA-256 of normalized capsule text.
- `findDuplicate` matches `content_hash` within **24h** → update in place
  (preserves `id`/`name`/`created_at`/`confidence`/`access_count`).
- `chrome.tabs.captureVisibleTab` (JPEG q50) runs on every save → stored as
  `screenshot` data-URL in IndexedDB; popup cards + detail view render it.
  Screenshot failure never blocks the save.
- `storage.ts` wraps IndexedDB (`meemory` v1, `capsules` store, indexes on
  name/created_at/platform/quality/search_text/content_hash).
- `listCapsules()` sorts **`created_at` descending** — newest first in popup
  and panel.
- `updateAccess(id)` → `access_count++`, `confidence = min(1, +0.05)`.
- Settings: `chrome.storage.local.meemory_settings` =
  `{geminiKey, autoPaste, showFloatingButton, customDomains}`.

### 3.7 Injection mechanics (`injector.ts`)

`findChatInput()` picks the lowest visible `textarea`, `contenteditable`, or
`[role="textbox"]` on the page. `insertIntoChat(text, preferred?)` accepts an
optional target (the drag/drop element).

- **textarea** — native `HTMLTextAreaElement.prototype.value` setter +
  bubbling `input`/`change` events. This is what makes React/Vue controlled
  inputs register the text.
- **contenteditable** — first dispatches a synthetic
  `ClipboardEvent('paste')` with a real `DataTransfer` (`text/plain` +
  `text/html`) on the focused element — ProseMirror/Lexical/React editors
  (e.g. Gemini's) handle this through their native paste pipeline.
  Verified by `textContent` growth; falls back to
  `execCommand('insertText')`.
- **Clipboard fallback** — `navigator.clipboard.writeText` (+ `execCommand
  ('copy')` backup) and a toast: "copied — press Ctrl+V".

**Drag and drop:** popup cards and panel rows set
`dataTransfer.setData('application/x-meemory-capsule', JSON.stringify(c))` +
`text/plain`. `content.ts` listens for `dragover`/`drop` at capture phase,
parses the capsule, bumps access, resolves the drop target via
`closest('textarea, [contenteditable], [role="textbox"]')`, and calls
`insertIntoChat` — same code path as Paste, minus clipboard.

### 3.8 Function call trace — "Save chat"

```
User presses Ctrl+Shift+M
└─ background.ts: chrome.commands.onCommand('capture-chat')
   └─ chrome.tabs.query(active) → validate URL
      └─ chrome.tabs.sendMessage(tabId, {type:'TRIGGER_CAPTURE'})
         └─ content.ts: onMessage → captureChat(silent=true)
            ├─ window.getSelection() → selection payload? (message-level)
            ├─ extractor.extractConversation(document, customDomains)
            │  ├─ detectPlatform → gmail/whatsapp/custom/generic/…
            │  ├─ cleanedScope + contentRoots (DOM pruning)
            │  ├─ collectElements / web-source scrape
            │  └─ messages → rawText ("role: text", ≤15k chars)
            ├─ send({type:'SAVE_CHAT', payload:{platform,messages,rawText}})
            └─ sendResponse({success:true})          ← holds channel open
   └─ background router: case SAVE_CHAT
      ├─ rawText < 20 chars → {success:false}
      ├─ codeState.extractCodeState(rawText)
      ├─ countStructuralSections < 2 && geminiKey
      │   → gemini.extractWithGemini(key, rawText) → geminiToCapsule
      ├─ else buildCapsule / lowQualityFallback
      ├─ naming: Memory N[: words | (topic)]
      ├─ hashContent → findDuplicate(24h) → update or create
      ├─ chrome.tabs.captureVisibleTab → screenshot field
      └─ storage.saveCapsule(record)
```

**Popup list**: `popup.ts` → `LIST_CAPSULES` → `storage.listCapsules()`
(created_at desc) → render cards (thumbnail, badges, timestamp).

**Popup Paste**: card → detail → `PASTE_CAPSULE {id}` → background wraps
`buildInjectionText(capsule)` → `PASTE_TEXT` to active tab →
`injector.insertIntoChat` → `UPDATE_ACCESS` → status log `✅`/`❌`.

**Drag-drop inject**: row `dragstart` (capsule JSON) → page `drop` →
`UPDATE_ACCESS` + `insertIntoChat(text, dropTarget)` → toast.

---

## 4. Developer Notes

- Extraction regexes are **pinned by spec** — don't tune; add new sections
  via a new regex + render block + `countStructuralSections` entry.
- Capsule cap 3200 chars; drop order (Structure, Next Steps first) is spec.
- Token estimate `ceil(len/4)`; >800 warning keys off it.
- Debug extraction in the **service worker** console
  (`chrome://extensions` → MEEMORY → service worker).
- Debug injection via `#meemory-root` → `shadowRoot` in page devtools.
- Rebuild: `npm run build`; typecheck: `npx tsc --noEmit` — both must pass.
- See `AGENT.md` for maintainer rules and `ARCHITECTURE.md` for the full
  pipeline diagram.
