# MEEMORY

> Your AI conversations finally remember each other.

MEEMORY is a Manifest V3 browser extension that captures AI chat conversations
(ChatGPT, Claude, Gemini, DeepSeek, Grok, Copilot, Perplexity, and generic
chat UIs), extracts structured **code state** — files, variables, functions,
classes, imports, project structure, decisions, next steps — stores it offline
in IndexedDB, and injects it into any new AI chat so the next assistant
continues the exact project without restarting.

No backend. No accounts. No telemetry. IndexedDB only.

## Features

- **Logic-first extraction** — regex/heuristic code-state extraction runs
  locally; no AI call needed for typical coding chats.
- **Optional Gemini fallback** (`gemini-2.0-flash`, your own API key, stored in
  `chrome.storage.local`) when the logic pass finds fewer than 2 structural
  sections.
- **Capsules** — compact markdown project-state blocks capped at ~800 tokens.
- **Progressive disclosure** — the floating panel shows compact summaries; the
  full capsule is only inserted when you click **Paste**.
- **Hash dedup** — SHA-256 of normalized capsule content; identical captures
  within 24h update the existing capsule in place.
- **Decay + access boost** — confidence rises on each paste; lists sort by
  `confidence * (1 + 0.05 * access_count)`.
- **Shadow DOM UI** — injected button/panel/toast never leaks styles or breaks
  host pages.
- **Universal detection** — per-host selectors for 7 platforms plus generic
  message-container probing.
- **Popup** — search by name/platform/quality, per-capsule delete with
  confirmation, JSON export/import, settings (Gemini key, auto-paste,
  floating-button visibility).
- **Keyboard shortcut** — `Ctrl+Shift+M` (Win/Linux) / `Cmd+Shift+M` (macOS)
  captures the current chat.
- **Quality badges** — ⚡ logic · 🤖 gemini · ⚠️ low, with a >800-token warning.

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

1. Open any supported AI chat and have a coding conversation.
2. Press `Ctrl/Cmd+Shift+M` or click **＋ Save chat** in the floating widget.
3. Open a *new* chat (on any platform) — the **🧠 Load Memory** button appears.
4. Click it, search/select a capsule, click **Paste**.
5. The capsule is inserted into the chat input as a prefix. **You press send.**

### Settings (popup → Settings)

- **Gemini API key** — optional; enables the fallback extractor.
- **Auto-fill chat input on Paste** — off by default: Paste copies the capsule
  to the clipboard (`Ctrl+V` to place it). On: Paste writes directly into the
  detected input (textarea setter or `contenteditable`), still never sends.
- **Show floating button** — toggle the on-page widget.

## Manual test checklist

- [ ] Load unpacked → MEEMORY icon appears in toolbar; no console errors.
- [ ] Open chatgpt.com, send a coding prompt ("create index.html with a nav
      toggle"), press `Ctrl+Shift+M` → toast "Saved …".
- [ ] Open the extension popup → capsule listed with ⚡ badge, platform
      `chatgpt`, token estimate.
- [ ] Search/filter by name, platform, quality all work.
- [ ] Open a *new* ChatGPT chat → floating **🧠 Load Memory** visible bottom-right.
- [ ] Click it → panel lists capsule; click **Paste** → text appears in the
      composer input (or clipboard toast if injection fails). **Nothing sends.**
- [ ] Send the message → the AI continues from the capsule state.
- [ ] Repeat Paste on the same capsule → access_count/confidence bump (score
      ordering may change).
- [ ] Delete a capsule from popup → confirmation → removed.
- [ ] Export JSON → file downloads; wipe storage → Import JSON → capsules back.
- [ ] Toggle "Show floating button" off → widget disappears on chat pages.
- [ ] On a non-AI page (e.g. example.com) → no floating widget.
- [ ] Gemini key set + capture a vague chat (no code) → 🤖 or ⚠️ quality badge.


popup.html/.ts  management UI
styles.css      shared styles (popup + shadow DOM)
```
