# MEEMORY — Project Report

**A local-first, cross-platform memory layer for AI chat conversations**

Manifest V3 browser extension · TypeScript · IndexedDB · no backend

---

## 1. INTRODUCTION

### 1.1 Need for Research

Large language model (LLM) chat interfaces have become primary tools for
software development, yet each conversation is an isolated context window.
When a developer switches between AI assistants — ChatGPT for scaffolding,
Claude for review, Gemini for deployment, DeepSeek or Grok for alternate
perspectives — the accumulated project state (files created, variables
declared, functions written, architectural decisions, pending tasks) is lost
or must be manually re-explained.

Existing vendor memory features are platform-locked and store prose summaries,
not structured code state. Manual copy-pasting is lossy and scales poorly.
There is a need for a **local-first, cross-platform mechanism that captures
the *code state* of a conversation and re-injects it into any other AI chat**,
without accounts, cloud services, or telemetry.

### 1.2 Major Challenges

1. **Universal detection** — AI chat DOMs differ per platform and change
   frequently; a robust extractor needs per-host selectors plus a generic
   fallback that works on unknown chat UIs.
2. **Logic-first extraction** — relying on an LLM for every capture is slow,
   costly, and privacy-invasive. Extracting *structured* state (not prose
   summaries) with deterministic heuristics is the core technical problem.
3. **Safe injection** — chat inputs are controlled components (React, Vue,
   ProseMirror/Lexical). Naive `el.value = …` is ignored by frameworks;
   `contenteditable` editors need `execCommand`-level insertion. Injection
   must never auto-send and must never break the host page.
4. **Privacy & offline operation** — all storage must be on-device
   (IndexedDB), with zero network calls except an explicitly user-enabled,
   user-keyed optional API fallback.
5. **UI isolation** — injected UI must not leak CSS or interfere with host
   pages → Shadow DOM encapsulation.

### 1.3 Objectives

1. Build a Manifest V3 extension that captures conversations from ≥7 named AI
   platforms plus a generic fallback, offline, in under 2 seconds.
2. Extract structured code state (files, variables, functions, classes,
   imports, structure, decisions, next steps) into a ≤800-token capsule,
   with quality tiers (`logic` / `gemini` / `low`) and measurable scores.
3. Inject capsules into any chat input with one click — never auto-sending —
   while keeping all data in IndexedDB with no accounts or telemetry.

---

## 2. LITERATURE SURVEY

### 2.1 Categorization and Description of Existing Work

**(a) Vendor-native memory.** ChatGPT memory, Claude Projects, and Gemini
conversation history persist context per-platform. Limitation: siloed per
vendor, cloud-dependent, stores conversational prose rather than structured
code artifacts, and cannot transfer state across providers.

**(b) Manual context transfer.** Users copy summaries, diffs, or code blocks
between tools. Limitation: lossy, manual, and error-prone; critical decisions
and variable states are routinely dropped.

**(c) Local-first agent memory — claude-mem.** A local memory system for
coding agents introducing: *progressive disclosure* (compact summaries in the
panel, full capsule only on demand), *atomic fields* (each fact self-contained:
what/why/outcome), *hash-based dedup* (SHA-256 of normalized content),
*schema-mirrored storage* (type, content, confidence, access_count,
timestamps + search index), and *decay with access boost* (confidence rises
on access; ranking by `confidence × (1 + 0.05 × access_count)`).
MEEMORY adapts these patterns but drops the Claude-Code-specific plugin, MCP
server, daemon, and CLI — none of which apply to a browser extension.

**(d) Cross-browser capture extensions — Kairo.** A Manifest V3 extension
capturing context from Claude, ChatGPT, Gemini, and DeepSeek. Contributes
reference patterns for content-script injection reliability, popup UI
structure, storage layout, one-click capture, search/filter, JSON
export/import, and keyboard shortcuts. MEEMORY extends this with structured
extraction and injection.

**(e) Commercial summarizers — ContextFlow, Capsule Hub.** ContextFlow
summarizes chats and injects them into other AIs (reference for summary
length, capsule format, injection UX). Capsule Hub adds drag-and-drop
injection, folders, attachments, and versioning — but requires an account and
cloud sync, which MEEMORY deliberately rejects.

### 2.2 Research Gaps and Issues Identified

1. **No structured code-state extraction.** Existing tools summarize prose;
   none deterministically extract files/variables/functions/imports/decisions
   as first-class, atomic fields.
2. **Platform lock-in or account dependence.** Vendor memory is siloed;
   cross-tool tools (ContextFlow, Capsule Hub) require accounts/cloud.
3. **Offline/privacy gap.** No open solution keeps conversation memory fully
   on-device with an optional, user-keyed model fallback.
4. **Injection fragility.** Framework-controlled inputs break naive DOM
   writes; no published reference implementation covers textarea, Lexical/
   ProseMirror contenteditable, and clipboard fallback uniformly.

#### 2.2.1 Integration Gap

The specific gap MEEMORY addresses: **an offline, account-free, cross-platform
pipeline that turns an AI chat into a structured, deduplicated, confidence-
scored code-state capsule and injects it into a different AI's composer —
end to end, inside a single Manifest V3 extension.**

---

## 3. METHODOLOGY USED

### 3.1 Problem Statement

*Given a live AI chat page, produce a compact, structured representation of
the project's code state, persist it locally with dedup and access-based
ranking, and re-inject it into an arbitrary chat composer on any supported
platform — without sending data off-device by default.*

### 3.3 Workflow / System Architecture

```
Chat page (any AI)
   │  content.ts: detectPlatform() → extractConversation()
   ▼
chrome.runtime.sendMessage(SAVE_CHAT {platform, messages, rawText})
   │
   ▼
background.ts service worker — extraction pipeline:
   1. deriveTopic() + extractCodeState()   (logic pass, regex)
   2. countStructuralSections() ≥ 2 ? buildCapsule() : quality="logic"
   3. else if geminiKey: extractWithGemini() → geminiToCapsule() : "gemini"
   4. else lowQualityFallback()            : "low" (1500-char excerpt)
   5. hashContent() (SHA-256 normalized) → findDuplicate() (24h window)
   6. saveCapsule() → IndexedDB "meemory"/"capsules"
   │
   ▼
New chat page → floating Shadow-DOM panel (LIST_CAPSULES, sorted by
confidence*(1+0.05*access_count)) → Paste → UPDATE_ACCESS →
injector.insertIntoChat() → composer filled → user presses send.
```

Message router types: `SAVE_CHAT`, `LIST_CAPSULES`, `DELETE_CAPSULE`,
`GET_CAPSULE`, `GET_SETTINGS`, `SET_SETTINGS`, `EXPORT_CAPSULES`,
`IMPORT_CAPSULES`, `UPDATE_ACCESS`, `TRIGGER_CAPTURE`.

### 3.4 Model Description (System Design)

**Capsule schema** (IndexedDB record):

| Field | Purpose |
|---|---|
| `id` | SHA-256(topic+timestamp)[:24] |
| `name` | topic slug ≤40 chars |
| `capsule` | markdown, ≤3200 chars (~800 tokens) |
| `quality` | `logic` / `gemini` / `low` |
| `platform`, `token_estimate`, `created_at`, `raw_excerpt` | provenance |
| `confidence`, `access_count` | decay/boost scoring |
| `search_text` | lowercase haystack for search |
| `content_hash` | SHA-256 of normalized capsule (dedup) |

**Extraction regexes (pinned):**

```
FILES:      /[\w\-/]+\.(html|css|js|ts|jsx|tsx|py|json|md|vue|svelte)/g
VARIABLES:  /(const|let|var)\s+(\w+)/g
FUNCTIONS:  /(function\s+(\w+)|(\w+)\s*=\s*(\([^)]*\)\s*=>|function)|(\w+)\s*\([^)]*\)\s*\{)/g
CLASSES:    /class\s+(\w+)/g
IMPORTS:    /(import\s+.*from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g
STRUCTURE:  /[├└]──|^\s*\|--|\/$/m  (per line)
DECISIONS:  sentences containing decided|chose|will use|approach|architecture|instead of|switched to
NEXT:       sentences containing next|todo|should
```

**Capsule gate:** emitted only when ≥2 of {files, variables, functions,
classes, imports, structure} are non-empty; cap 3200 chars with ordered
demotion (drop Structure + Next Steps first).

**Dedup:** SHA-256 over lowercased, whitespace-collapsed capsule; identical
hash within 24h → in-place update preserving `id`/`created_at`/`name`/
`confidence`/`access_count`.

**Ranking:** `score = confidence * (1 + 0.05 * access_count)` descending.

**Injection:** lowest visible `textarea`/`contenteditable`/`[role="textbox"]`;
textarea → native setter + bubbling `input`/`change`; contenteditable →
`focus()` + Range select + `execCommand('insertText')`; failure → clipboard +
toast. Never sends.

**UI isolation:** all injected DOM lives under one host's ShadowRoot with an
adopted `<style>` block; popup uses the same stylesheet normally.

---

## 5. CONCLUSION AND FUTURE WORK

### 5.1 Conclusion

MEEMORY demonstrates that structured, cross-platform AI memory is achievable
entirely client-side. The logic-first pipeline produces useful code-state
capsules for typical coding chats without any model call; the optional Gemini
fallback extends coverage to prose-heavy conversations; the injection layer
handles React-style textareas and contenteditable editors without auto-sending.
All state resides in IndexedDB — no accounts, no backend, no telemetry — while
hash dedup, confidence scoring, and access boosting keep the capsule store
clean and self-improving. The extension builds cleanly (`npm run build`, zero
errors) and ships with a manual test checklist covering the full
capture → store → inject loop.

### 5.2 Future Work

1. **Namespaces & folders** — tag capsules by project (and platform) for
   filtered retrieval; optional versioning per project.
2. **Richer injection UX** — drag-and-drop capsule transfer between windows,
   multi-capsule merge, attachment/context bundling.
3. **Selector resilience** — auto-healing selectors, per-site override rules,
   MutationObserver-based re-detection on SPA navigation.
4. **Alternative extractors** — local LLM via Ollama as a Gemini substitute;
   fine-tuned small model for code-state extraction.
5. **Capsule templates** — per-domain templates (frontend, ML, DevOps,
   documentation) with domain-specific sections.
6. **Firefox/Safari ports** — `browser.*` namespace polyfill; iOS content
   blocker constraints noted.

---

## 6. REFERENCES

1. **claude-mem** — local-first memory for coding agents.
   https://github.com/thedotmack/claude-mem — patterns adapted: progressive
   disclosure, atomic fact fields, SHA-256 hash dedup, confidence/access_count
   schema with search index, decay + access boost, namespaces, graceful
   degradation. (Plugin/MCP/daemon components intentionally not ported.)
2. **Kairo** — cross-browser extension capturing context from Claude,
   ChatGPT, Gemini, DeepSeek. https://github.com/satyakiabhijit/Kairo —
   reference for content-script injection reliability, popup structure,
   storage layout, one-click capture, search/filter, JSON export/import,
   keyboard shortcuts.
3. **ContextFlow** — Chrome Web Store extension; summarizes chats and injects
   into other AIs. Closed source; reference for summary length, capsule
   format, and injection UX only.
4. **Capsule Hub by Tilantra** — Chrome/Firefox; closed source, requires
   account. Reference for drag-and-drop injection, folders, attachments,
   versioning UX patterns (accounts/cloud deliberately excluded).
5. **Chrome for Developers — Manifest V3 / Extension APIs**
   (developer.chrome.com/docs/extensions) — content scripts, service workers,
   `chrome.storage`, `chrome.commands`, `chrome.runtime` messaging.
6. **IndexedDB API** — W3C Recommendation; object stores, indexes, and
   transactions used for capsule persistence.
