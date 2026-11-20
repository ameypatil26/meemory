# MEEMORY

> Your AI conversations finally remember each other.

MEEMORY is a Manifest V3 browser extension that captures AI chat conversations,
extracts structured project state — files, variables, functions, classes,
imports, chapters, summaries, decisions, next steps — stores it offline in
IndexedDB, and injects it into any new AI chat so the next assistant continues
the exact project without restarting.

No backend. No accounts. No telemetry. IndexedDB only.

## Features

### Capture

- **Universal detection** — floating MEEMORY controls appear on any page with
  a chat interface: hardcoded selectors for ChatGPT, Claude, Gemini, DeepSeek,
  Grok, Copilot, and Perplexity; generic message-container probing; any
  hostname ending in `.ai`/`.chat` or starting with `chat.` (covers Qwen and
  future AI sites); and any page containing a chat-sized textarea or
  contenteditable input.
- **Custom AI domains** — add your own domains (comma-separated) in Settings;
  matching hosts/subdomains get the floating widget and generic extraction.
- **Message-level capture** — highlight any text on the page, then click
  **Save chat** or press the shortcut: only the selection is captured instead
  of the whole conversation.
- **Send to AI (Gmail / WhatsApp)** — on `mail.google.com` and
  `web.whatsapp.com`, a dedicated floating button scrapes the visible
  email/thread (`[role="main"]` for Gmail) into a capsule you can paste into
  any AI chat to summarize or draft replies.
- **Clean extraction** — before scraping, the page DOM is cloned and pruned:
  `nav`, `header`, `footer`, `button`, `script`, `style`, `svg`, `iframe`, and
  any element whose class/id contains `login`, `signup`, `sign-up`, `menu`, or
  `sidebar` is removed. Text is pulled only from `main`, `article`,
  `[role="main"]`, or detected message containers — no more "Log in" /
  "Sign up for free" pollution.
- **Keyboard shortcut** — `Ctrl+Shift+M` (Win/Linux) / `Cmd+Shift+M` (macOS),
  or the popup's **⚡ Capture Current Chat** button with a live status log.
- **Automated screenshots** — every save captures a `chrome.tabs.
  captureVisibleTab` JPEG thumbnail stored with the capsule and shown on
  popup cards and the detail view.

### Memory capsules

- **Logic-first extraction** — regex/heuristic extraction runs locally: files,
  variables, functions, classes, imports, project structure, **chapter
  headings** (markdown headings and `Chapter`/`Part`/`Prologue`/`Epilogue`/
  `Act` markers), a **prose summary** (first 2–3 sentences of the last
  assistant message), key decisions, and next steps.
- **Prose-aware naming** — chats with no code artifacts are named
  `Memory N: <first 5 words of the last AI reply>`; Gemini-topic captures use
  `Memory N (Topic)`; everything else is plain `Memory N`.
- **Optional Gemini fallback** (`gemini-3.8-flash`, your own API key stored in
  `chrome.storage.local`, `AIza`/`AQ.` prefixes accepted) when the logic pass
  finds fewer than 2 structural sections.
- **Aggressive token reduction** — the low-quality fallback keeps only the
  first 1000 and last 2000 characters (project setup + most recent state),
  never the full 15k transcript.
- **Capsules** — compact markdown state blocks capped at ~800 tokens.
- **SHA-256 dedup** — identical normalized content within 24h updates the
  existing capsule in place.
- **Access boost** — confidence rises on each use; `access_count` tracked.
- **Quality badges** — ⚡ logic · 🤖 gemini · ⚠️ low, with a >800-token warning.
- **Sequential naming** — `Memory 1`, `Memory 2`, … based on capsule count.

### UI

- **Dark glassmorphism popup** — 400px-wide app-style UI: deep purple/neon
  gradient accents, glass panels, custom dropdowns, animated empty states,
  spinners, and toast notifications.
- **Status / Error log** — the popup's capture and paste flows show a live,
  timestamped, icon-coded log (`ℹ️`/`⚠️`/`❌`/`✅`) for every step.
- **Capsule detail view** — click a card to preview the full capsule text and
  screenshot, then **Paste to Current Chat**.
- **In-page floating panel** — opaque `#1a1a2e` panel (immune to host-site
  theming), searchable, platform/quality filters, per-item delete, token
  warnings, creation timestamps, quality badges.
- **Drag and drop** — capsule cards (popup) and panel rows are draggable;
  drop one onto an AI chat input to inject it directly — no clipboard. Rich
  editors (Gemini/ProseMirror) receive a synthetic `ClipboardEvent('paste')`
  with a `DataTransfer`, with `execCommand` and clipboard fallbacks.
- **Injection** — textarea native setter + bubbling `input` event;
  contenteditable `execCommand`; **never auto-sends**.
- **Export/import** — full JSON backup and restore from the popup.

## Install & build

```bash
cd meemory
npm install
npm run build
```

Then in Chrome/Edge/Brave:

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `meemory/` folder.

For development, `npm run watch` rebuilds on change (reload the extension after
rebuilds).

## Usage

1. Open any supported AI chat (or any `.ai`/`.chat` site, or add a custom
   domain) and have a conversation — code or prose.
2. Press `Ctrl/Cmd+Shift+M`, click **⚡ Capture Current Chat** in the popup
   (watch the live status log), or click **＋ Save chat** / **🤖 Send to AI**
   in the floating widget. Highlight text first for message-level capture.
3. Open a *new* chat — click **🧠 Load Memory**, pick a capsule, and either
   click **Paste**, or **drag the capsule card/panel row onto the chat input**.
4. The capsule is inserted as a prefixed context block. **You press send.**

### Settings (popup → Settings)

- **Gemini API key** — optional; enables the fallback extractor (`AIza…` or
  `AQ.…` keys both accepted).
- **Custom AI domains** — comma-separated hostnames that always get MEEMORY
  controls (exact host or subdomain match).
- **Auto-fill chat input on Paste** — off by default: Paste copies to the
  clipboard (`Ctrl+V` to place it). On: Paste writes directly into the
  detected input, still never sends.
- **Show floating button** — toggle the on-page widget.

## Manual test checklist

- [ ] Load unpacked → MEEMORY icon appears; no console errors.
- [ ] Open chatgpt.com, send a coding prompt, press `Ctrl+Shift+M` → popup
      status log shows ✅ and a `Memory N` capsule appears with a screenshot.
- [ ] Highlight a paragraph, press the shortcut → capsule contains only the
      selection.
- [ ] Open a new ChatGPT chat → floating buttons visible; open a `.ai` site
      (e.g. qwen.ai) → buttons appear; add a custom domain → same.
- [ ] Open the popup → cards show thumbnail, `Nov 16, 12:22 AM` timestamp,
      ~token count, newest first.
- [ ] Click a card → detail view with capsule preview + screenshot →
      **Paste to Current Chat** injects the `[MEEMORY CAPSULE]` prefix.
- [ ] Drag a panel row onto the composer → text lands in the input.
- [ ] On Gmail/WhatsApp → **🤖 Send to AI** appears and saves the thread.
- [ ] Search/filter by name, platform, quality; delete with confirmation.
- [ ] Export JSON → wipe → Import JSON → capsules restored.
- [ ] Gemini key (`AQ.` or `AIza`) + vague chat → 🤖 or ⚠️ badge.

## Project layout

```
manifest.json    MV3 manifest (permissions: storage, activeTab, tabs,
                 scripting, commands; host_permissions for screenshots)
background.ts    service worker: message router, capture pipeline,
                 screenshot, dedup, naming, settings
content.ts       content script: Shadow DOM UI, selection capture,
                 Send-to-AI, drag/drop injection
extractor.ts     platform detection (incl. universal/custom domains),
                 DOM pruning, message scraping
codeState.ts     logic extraction (code + chapters + prose summary),
                 capsule builder, dedup hash, fallbacks
gemini.ts        optional Gemini fallback (gemini-3.8-flash)
storage.ts       IndexedDB layer (capsules + settings)
injector.ts      chat-input detection + native/paste/execCommand/clipboard
popup.html/.ts   management UI (glass theme, capture log, detail view)
styles.css       shared styles (popup + shadow DOM)
icons/           16/48/128px PNG icons
```
