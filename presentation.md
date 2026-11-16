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

- **Capture:** content script detects the chat platform, scrapes messages,
  sends raw text to the service worker.
- **Extract:** logic-first regex pass builds structured code state; optional
  Gemini fallback; low-quality excerpt as last resort.
- **Store:** SHA-256 dedup, IndexedDB, confidence/access decay-boost.
- **Inject:** floating Shadow-DOM panel on any chat page → Paste fills the
  input (never sends).

`[DIAGRAM: workflow — chat page → content.ts → background.ts → codeState.ts →
storage.ts (IndexedDB) → injector.ts → new chat input]`

### Slide 7 — Key Features

- Logic-first extraction (no AI call needed for code chats)
- Optional Gemini fallback with user-supplied key
- Capsule format ≤800 tokens, quality badges (⚡ 🤖 ⚠️)
- Hash dedup (24h window) + confidence/access scoring
- Shadow DOM UI — never breaks host pages
- Search, filter, delete, JSON export/import
- Ctrl/Cmd+Shift+M capture shortcut

### Slide 8 — Intended Users

- Developers who pair-program with multiple AI assistants.
- Students/hobbyists iterating on projects across chat tools.
- Anyone who wants offline, private cross-tool AI memory.

---

## 6. System Design and Implementation Timeline

### Slide 9 — Tech Stack

- **Manifest V3** extension, **TypeScript (ESM)**, vanilla DOM
- **esbuild** bundler, **IndexedDB** storage, `chrome.storage.local` settings
- Optional **Gemini 2.0 Flash** API (user key)
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

- Regex extraction is heuristic — misses state expressed only in prose.
- Gemini fallback requires a user API key (optional; offline by default).
- DOM selectors are per-platform and can break when sites redesign.
- Injection depends on the target chat exposing a textarea/contenteditable.

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
