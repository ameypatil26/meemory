# MEEMORY — Presentation Outline

> Slide-by-slide outline for a PowerPoint deck. Each section maps to one or more
> slides; `[DIAGRAM]` marks a placeholder for a figure.

---

## Slide 1 — Title

- **MEEMORY**
- Tagline: *"Your AI conversations finally remember each other."*
- Subtitle: A local-first Manifest V3 browser extension for cross-AI project memory.

---

## 2. Introduction

### Slide 2 — The Problem

- Every AI chat starts from zero. Context lives and dies inside one tab.
- Developers bounce between ChatGPT, Claude, Gemini, DeepSeek, Copilot,
  Perplexity, Grok — each with its own siloed memory.
- Copy-pasting summaries between tools is manual, lossy, and error-prone.

### Slide 3 — Context & Who Is Affected

- **Primary users:** developers using multiple AI assistants on one project.
- **Scenario:** build a portfolio in ChatGPT → switch to Claude for debugging →
  back to Gemini for deployment. Each switch restarts the conversation.
- Wasted effort: re-explaining files, re-pasting code, re-stating decisions.

---

## 3. Related Work

### Slide 4 — Current Methods & Their Limits

| Approach | How it works | Limitation |
|---|---|---|
| In-chat memory (ChatGPT memory, Claude projects) | Vendor-side, per-platform | Locked to one AI; cloud; no code-state structure |
| Manual copy-paste | User summarizes and pastes | Lossy, tedious, easy to omit critical state |
| claude-mem | Local memory for Claude Code | CLI/plugin/daemon; Claude-Code-specific, not a browser extension |
| Kairo | Cross-browser capture for several AIs | Capture-only; no structured code-state extraction or injection pipeline |
| ContextFlow / Capsule Hub | Summarize + inject capsules | Closed source; accounts/cloud required; summary ≠ code state |

**Gap:** no open, offline, cross-platform tool that extracts *structured code
state* (files, variables, functions, decisions) and injects it into any AI chat.

---

## 4. Objectives

### Slide 5 — Objectives (measurable)

1. **Capture:** extract a conversation from ≥7 AI platforms plus a generic
   fallback in under 2 seconds, offline.
2. **Structure:** produce a ≤800-token capsule containing ≥2 structural
   sections (files/variables/functions/classes/imports/structure) for typical
   coding chats — with a measurable quality score (`logic`/`gemini`/`low`).
3. **Continuity:** inject the capsule into a *different* AI's chat input in one
   click, with zero data leaving the device (IndexedDB only, no accounts,
   no telemetry).

---

## 5. Proposed Solution and Key Features

### Slide 6 — How MEEMORY Works

- **Detect:** universal platform detection — 7 AI platforms + qwen.ai,
  `.ai`/`.chat`/`chat.*` hostnames, any page with a chat input, user-defined
  custom domains, plus Gmail/WhatsApp Web as context sources.
- **Prune:** DOM is cloned and stripped of nav/login/signup/menu/sidebar UI
  chrome before scraping — clean text only.
- **Capture:** full conversation, highlighted selection (message-level), or
  Send-to-AI thread scrape; every save stores a screenshot thumbnail.
- **Extract:** logic-first pass (code + chapter headings + prose summary);
  optional Gemini fallback (`gemini-3.8-flash`); aggressive head+tail
  truncation as last resort.
- **Store:** `Memory N` naming, SHA-256 dedup, IndexedDB, newest-first.
- **Inject:** popup Paste, panel Paste, or drag-and-drop onto the chat input
  (paste-event path for ProseMirror editors) — never sends.

`[DIAGRAM: workflow — chat page → DOM pruning → extractor.ts → background.ts
→ codeState.ts (+gemini.ts) → screenshot → storage.ts (IndexedDB) →
injector.ts → new chat input]`

### Slide 7 — Key Features

- **Universal detection** — `.ai`/`.chat` domains, chat-input probing,
  custom AI domains in settings
- **Advanced capture** — message-level (highlight-to-save), Gmail/WhatsApp
  "Send to AI", automated screenshot thumbnails
- **Clean, token-efficient extraction** — DOM pruning kills UI junk;
  chapters + prose summaries; fallback keeps only first 1k + last 2k chars
- Logic-first extraction (no AI call needed for most chats)
- Optional Gemini fallback (`gemini-3.8-flash`, `AIza`/`AQ.` keys)
- Capsule format ≤800 tokens, quality badges (⚡ 🤖 ⚠️), `Memory N` naming
- Hash dedup (24h window) + confidence/access scoring
- **Drag-and-drop injection** — paste-event path for React/ProseMirror editors
- Dark-glass popup: live status log, detail view, thumbnails, timestamps
- Search, filter, delete, JSON export/import; Ctrl/Cmd+Shift+M shortcut

### Slide 8 — Intended Users

- Developers who pair-program with multiple AI assistants.
- Students/hobbyists iterating on projects across chat tools.
- Anyone who wants offline, private cross-tool AI memory.

---

## 6. System Design and Implementation Timeline

### Slide 9 — Tech Stack

- **Manifest V3** extension, **TypeScript (ESM)**, vanilla DOM
- **esbuild** bundler, **IndexedDB** storage, `chrome.storage.local` settings
- Optional **Gemini 3.8 Flash** API (user key, `AIza`/`AQ.` prefixes)
- No backend, no accounts, no telemetry

### Slide 10 — Proposed Timeline / Gantt

`[DIAGRAM: Gantt — Week 1: scaffolding + storage; Week 2: extractor + codeState;
Week 3: injector + content UI; Week 4: popup + settings + docs + testing]`

### Slide 11 — User Stories

`[LINK / placeholder: user stories doc — e.g. "As a developer, I can press
Ctrl+Shift+M to save the current chat so I can continue it in another AI."
See AGENT.md / README manual test checklist for acceptance criteria.]`

---

## 7. Applications, Limitations and Feasibility

### Slide 12 — Applications

- Cross-AI project continuity (code, decisions, next steps).
- Session handoff between tools/models for A/B comparison.
- Offline, private memory layer for privacy-sensitive codebases.

### Slide 13 — Limitations

- Regex/heuristic extraction is approximate — very unstructured prose may
  still fall back to the truncated excerpt path.
- Gemini fallback requires a user API key (optional; offline by default).
- DOM selectors are per-platform and can break when sites redesign.
- Injection depends on the target chat exposing a textarea/contenteditable
  (clipboard fallback covers the rest).

### Slide 14 — Feasibility

- **Deployment:** load-unpacked MV3 extension; no server, no cost.
- **Cost:** $0 infrastructure; optional Gemini usage billed to user's own key.
- **Privacy:** all data stays in IndexedDB on-device; nothing transmitted.
- **Impact:** eliminates re-explanation overhead; measurable via capsule
  quality score and access_count telemetry-free usage signals.

---

## 8. Conclusion and Future Work

### Slide 15 — Conclusion

- MEEMORY delivers offline, structured, cross-platform AI chat memory.
- Logic-first pipeline keeps it fast and private; Gemini fallback covers
  prose-heavy chats.
- Working end-to-end: capture → extract → dedup → store → inject.

### Slide 16 — Future Work

- Per-project namespaces/folders and versioning.
- Drag-and-drop capsule transfer between chat windows.
- More platforms + selector auto-healing.
- Optional local-LLM extraction (Ollama) as a Gemini alternative.
- Capsule templates per project type (frontend, ML, DevOps).

---

## Slide 17 — References

1. claude-mem — local-first memory for coding agents
   (github.com/thedotmack/claude-mem): progressive disclosure, atomic
   fields, hash dedup, confidence/access scoring.
2. Kairo — cross-browser extension capturing context from Claude, ChatGPT,
   Gemini, DeepSeek (github.com/satyakiabhijit/Kairo): injection reliability,
   popup UI, storage layout.
3. ContextFlow (Chrome Web Store): summary length, capsule format, injection UX.
4. Capsule Hub by Tilantra (Chrome/Firefox): drag-drop injection, folders,
   versioning UX patterns.
5. W3C WebExtensions / Chrome MV3 documentation — content scripts, service
   workers, storage APIs.
