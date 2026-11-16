# MEEMORY — Complete PowerPoint Build Specification (16:9 Widescreen)

## 1. Master Design System & Layout Grid

* **Slide Dimensions:** Widescreen 16:9 (`13.333 in` $\times$ `7.500 in` / `1920 px` $\times$ `1080 px`).
* **Margins & Safe Zone:** `0.75 in` left/right, `0.60 in` top/bottom.
* **Typography:**
  * **Headings & Hero Numerals:** `Inter` or `Manrope` (ExtraBold `800` / Bold `700`).
  * **Body & Technical Labels:** `IBM Plex Sans` (Regular `400` / Medium `500`).
  * **Code / Monospace Badges:** `IBM Plex Mono` (`11pt–13pt`).
* **Master Gradient (Title & Accents):** Linear gradient (`135deg`): Deep Indigo (`#1E1B4B`) $\rightarrow$ Royal Violet (`#5B21B6`) $\rightarrow$ Vibrant Coral (`#F43F5E`).
* **Canvas Surfaces:**
  * Content Slides: Deep Obsidian-Indigo (`#0F1020`) with Elevated Card Surface (`#191B33`, `1px` border at `12%` white opacity).
  * Section Dividers: Full-bleed section accent color containing **only** the section number and section title.
* **Section Accent Palette:**
  * `01` Introduction: **Electric Blue** (`#3B82F6`)
  * `02` Related Work: **Amber** (`#F59E0B`)
  * `03` Objectives: **Emerald** (`#10B981`)
  * `04` Proposed Solution: **Magenta** (`#EC4899`)
  * `05` System Design: **Cyan** (`#06B6D4`)
  * `06` Feasibility & Impact: **Orange** (`#F97316`)
  * `07` Conclusion & Future Work: **Violet** (`#8B5CF6`)
  * `08` References: **Slate** (`#334155`)

## 2. Recurring Visual Motif: The "Memory Capsule" Pill

* **Position (Every Content Slide):** Top-right header slot (`X: 10.18 in`, `Y: 0.45 in`, `W: 2.40 in`, `H: 0.36 in`).
* **Geometry:** Rounded stadium pill (`corner radius = 0.18 in`), `1.5pt` border in the active section accent color, dark fill (`#090A14`).
* **Inner Fill & Label:** Proportional progress bar inside the pill (`max = 800 tokens`) + right-aligned `IBM Plex Mono` label (`9.5pt`, `#E2E8F0`) showing target token budget state (`CAPSULE: ≤800 TOK`).

## 3. Deck Architecture & Slide-by-Slide Specifications

*(14 core content slides paired with full-bleed single-element chapter dividers for each of the 8 sections.)*

### SLIDE 1 — Title Slide

* **Background:** Full-bleed Master Gradient (`#1E1B4B` $\rightarrow$ `#5B21B6` $\rightarrow$ `#F43F5E`) with subtle geometric grid lines (`6%` white opacity).
* **Hero Visual (Right, `X: 8.20 in`, `Y: 1.85 in`, `W: 4.30 in`, `H: 3.80 in`):** Oversized stylized 3D-layered "Memory Capsule" pill vector (`corner radius = 1.90 in`) showing segmented code-state bands (`files`, `vars`, `funcs`, `classes`, `imports`, `tree`) glowing in Cyan, Magenta, and Emerald.
* **Text Elements (Left):**
  * **Title (`X: 0.85 in`, `Y: 1.95 in`):** `MEEMORY` (`Inter ExtraBold`, `76pt`, `#FFFFFF`, tracking `-2%`).
  * **Subtitle (`X: 0.85 in`, `Y: 3.15 in`, `W: 7.00 in`):** `Your AI conversations finally remember each other.` (`Manrope Medium`, `26pt`, `#F8FAFC`).
  * **Tagline Strip (`X: 0.85 in`, `Y: 4.45 in`, `W: 6.80 in`, `H: 0.52 in`):** Dark translucent pill (`rgba(15, 16, 32, 0.55)`) with text: `Logic-first code-state extraction · Offline · Any AI` (`IBM Plex Sans Medium`, `14pt`, `#E2E8F0`).

### DIVIDER 01 — Section 1 Chapter Divider

* **Background:** Full-bleed **Electric Blue** (`#3B82F6`).
* **Content (Centered, `X: 1.20 in`, `Y: 2.60 in`):**
  * Section Number: `01` (`Inter ExtraBold`, `96pt`, `rgba(255,255,255,0.35)`).
  * Section Title: `Introduction` (`Inter Bold`, `54pt`, `#FFFFFF`).

### SLIDE 2 — The Problem (Introduction)

* **Accent:** Electric Blue (`#3B82F6`) | **Capsule Motif:** `0 / 800 TOK` (Empty/Reset state).
* **Headline (`X: 0.75 in`, `Y: 0.45 in`):** `Context amnesia is expensive.` (`Inter Bold`, `32pt`, `#FFFFFF`).
* **Left Column — Bullets (`X: 0.75 in`, `Y: 1.45 in`, `W: 5.50 in`, `IBM Plex Sans`, `18pt`, `#E2E8F0`, `1.45` line spacing):**
  * Context amnesia forces project restarts at token limits.
  * Files, variables and decisions are lost between chats.
  * Generic summaries drop critical details (AISum4DCR, IEEE 2025).
  * Developers, students and other AI builders are affected.
* **Right Column — Two-Panel Visual Split (`X: 6.60 in`, `Y: 1.45 in`, `W: 5.98 in`, `H: 5.20 in`):**
  * **Left Sub-Panel (`W: 2.80 in`, Border `#EF4444`):** Header badge `OLD CHAT (FULL)` — stacked code blocks (`auth.ts`, `schema.sql`, `api.ts`) terminated by a red `TOKEN LIMIT EXCEEDED` warning bar.
  * **Center Connector:** Broken dashed arrow (`X`) in `#3B82F6`.
  * **Right Sub-Panel (`W: 2.80 in`, Border `#3B82F6`):** Header badge `NEW CHAT (EMPTY)` — blank prompt canvas displaying `State: NULL · Files: 0 · Context Lost`.

### DIVIDER 02 — Section 2 Chapter Divider

* **Background:** Full-bleed **Amber** (`#F59E0B`).
* **Content (Centered):**
  * Section Number: `02` (`Inter ExtraBold`, `96pt`, `rgba(15,16,32,0.28)`).
  * Section Title: `Related Work` (`Inter Bold`, `54pt`, `#0F1020`).

### SLIDE 3 — Related Work

* **Accent:** Amber (`#F59E0B`) | **Capsule Motif:** `180 / 800 TOK`.
* **Headline (`X: 0.75 in`, `Y: 0.45 in`):** `Existing tools copy. They don't preserve state.` (`Inter Bold`, `32pt`, `#FFFFFF`).
* **Top Summary Bullets (`X: 0.75 in`, `Y: 1.30 in`, `W: 11.80 in`, 2x2 compact grid, `16pt`):**
  * **Kairo:** captures capsules, no code-state extraction.
  * **ContextFlow / Capsule Hub:** summarize or require cloud accounts.
  * **claude-mem:** strong engine, but Claude Code–only.
  * **MEEMORY:** targets offline, universal, code-state continuity.
* **Bottom Visual — 3-Column Comparison Matrix (`X: 0.75 in`, `Y: 3.10 in`, `W: 11.83 in`, `H: 3.65 in`):**
  * **Columns:** `Capability` | `Kairo / Capsule Hub` | `claude-mem` | `MEEMORY (Target)` (highlighted with `#F59E0B` border).
  * **Rows:**
    1. Deterministic Code-State Extraction (`files/vars/funcs`): `✗` | `~` | `✓`
    2. 100% Offline Local Storage (No Cloud Account): `✗` | `✓` | `✓`
    3. Universal Multi-AI Browser Injection (7 Platforms): `~` | `✗` | `✓`
    4. Hard Token Cap ($\le 800$ Tokens) + Dedup: `✗` | `~` | `✓`

### DIVIDER 03 — Section 3 Chapter Divider

* **Background:** Full-bleed **Emerald** (`#10B981`).
* **Content (Centered):**
  * Section Number: `03` (`Inter ExtraBold`, `96pt`, `rgba(15,16,32,0.28)`).
  * Section Title: `Objectives` (`Inter Bold`, `54pt`, `#0F1020`).

### SLIDE 4 — Objectives (3 Measurable)

* **Accent:** Emerald (`#10B981`) | **Capsule Motif:** `320 / 800 TOK`.
* **Headline (`X: 0.75 in`, `Y: 0.45 in`):** `Three measurable goals.` (`Inter Bold`, `32pt`, `#FFFFFF`).
* **Visual Layout — Three Equal Columns (`Y: 1.55 in`, `W: 3.70 in` each, `0.36 in` gutter):**
  * **Circle 1 (`1.30 in` diameter, `#10B981` stroke + `#10B981` at `15%` fill):** Hero numeral `≥6` (`Inter ExtraBold`, `40pt`, `#10B981`).
    * Card Text (`16pt`): Extract $\ge 6$ code-state categories (files, variables, functions, classes, imports, structure) per chat with logic-only regex.
  * **Circle 2 (`1.30 in` diameter):** Hero numeral `≤800` (`Inter ExtraBold`, `36pt`, `#10B981`).
    * Card Text (`16pt`): Keep every capsule $\le 800$ tokens ($3,200$ chars) with $\ge 2$ populated sections; assess against cited $78\% / 4\%$ benchmark.
  * **Circle 3 (`1.30 in` diameter):** Hero numeral `5+` (`Inter ExtraBold`, `40pt`, `#10B981`).
    * Card Text (`16pt`): Build Manifest V3 extension with IndexedDB, injection on $5+$ platforms, and Gemini fallback only on failure.

### DIVIDER 04 — Section 4 Chapter Divider

* **Background:** Full-bleed **Magenta** (`#EC4899`).
* **Content (Centered):**
  * Section Number: `04` (`Inter ExtraBold`, `96pt`, `rgba(255,255,255,0.35)`).
  * Section Title: `Proposed Solution & Key Features` (`Inter Bold`, `50pt`, `#FFFFFF`).

### SLIDE 5 — Proposed Solution

* **Accent:** Magenta (`#EC4899`) | **Capsule Motif:** `480 / 800 TOK`.
* **Headline (`X: 0.75 in`, `Y: 0.45 in`):** `MEEMORY: extract the state, not the story.` (`Inter Bold`, `32pt`, `#FFFFFF`).
* **Top Bullets (`X: 0.75 in`, `Y: 1.35 in`, `W: 11.83 in`, `17pt`):**
  * Scan chat; extract structured code state in one click.
  * Logic-first regex pipeline; Gemini is optional fallback only.
  * Store capsule offline in IndexedDB — no server/account.
  * Inject into new chat; AI continues, not restarts.
* **Bottom Visual — 5-Node Horizontal Pipeline (`X: 0.75 in`, `Y: 4.10 in`, `W: 11.83 in`, `H: 2.30 in`):**
  * Five connected rounded rectangles (`W: 2.00 in`, `H: 1.50 in`, `#191B33` fill, `2pt` `#EC4899` top bar) linked by bold Magenta chevron arrows:
    1. **`CHAT`** — Full DOM thread scan
    2. **`EXTRACT`** — 6-category regex state
    3. **`CAPSULE`** — $\le 800$ tok SHA-256 packet
    4. **`INJECT`** — Target prompt insertion
    5. **`CONTINUE`** — Zero-reset coding session

### SLIDE 6 — Workflow Diagram (Placeholder)

* **Accent:** Magenta (`#EC4899`) | **Capsule Motif:** `540 / 800 TOK`.
* **Headline (`X: 0.75 in`, `Y: 0.45 in`):** `From chat to continuity in four steps.` (`Inter Bold`, `32pt`, `#FFFFFF`).
* **Center Diagram Frame (`X: 0.75 in`, `Y: 1.45 in`, `W: 11.83 in`, `H: 5.25 in`):**
  * Dashed architectural bounding box (`2pt` dashed `#EC4899`, fill `#141529`).
  * Top-left tag: `[WORKFLOW DIAGRAM PLACEHOLDER]` (`IBM Plex Mono Bold`, `13pt`, `#EC4899`).
  * Inside placeholder: 4 geometric stage blocks (`W: 2.40 in`, `H: 2.80 in`) connected by directional arrows:
    * **Step 1: `DETECT`** — Geometric browser-tab frame + DOM observer badge.
    * **Step 2: `EXTRACT`** — Geometric filter funnel + regex/fallback switch.
    * **Step 3: `STORE`** — Geometric cylinder/capsule icon + IndexedDB `≤800 tok` lock.
    * **Step 4: `INJECT`** — Geometric terminal cursor + cross-platform target box.

### SLIDE 7 — Key Features

* **Accent:** Magenta (`#EC4899`) | **Capsule Motif:** `600 / 800 TOK`.
* **Headline (`X: 0.75 in`, `Y: 0.45 in`):** `Built for efficiency and universality.` (`Inter Bold`, `32pt`, `#FFFFFF`).
* **Visual Layout — 2x3 Feature Grid (`X: 0.75 in`, `Y: 1.45 in`, `W: 11.83 in`, `H: 5.25 in`, card `W: 3.74 in`, `H: 2.45 in`):**
  * **Card 1 (`7 PLATFORMS`):** Targets ChatGPT, Claude, Gemini, DeepSeek, Grok, Copilot, Perplexity.
  * **Card 2 (`SHA-256 DEDUP`):** Deduplicate via SHA-256 within 24h; update-in-place.
  * **Card 3 (`SMART RANKING`):** Confidence $\times (1 + 0.05 \times \text{access\_count})$ ranking (adapted from `claude-mem`).
  * **Card 4 (`PORTABLE JSON`):** Export/import JSON; keyboard shortcut `Ctrl+Shift+M`.
  * **Card 5 (`TOKEN BUDGET`):** Hard cap at $\le 800$ tokens ($3,200$ chars) per capsule.
  * **Card 6 (`LOGIC-FIRST`):** Local regex primary; Gemini triggered only on failure.

### DIVIDER 05 — Section 5 Chapter Divider

* **Background:** Full-bleed **Cyan** (`#06B6D4`).
* **Content (Centered):**
  * Section Number: `05` (`Inter ExtraBold`, `96pt`, `rgba(15,16,32,0.28)`).
  * Section Title: `System Design & Timeline` (`Inter Bold`, `52pt`, `#0F1020`).

### SLIDE 8 — System Design

* **Accent:** Cyan (`#06B6D4`) | **Capsule Motif:** `640 / 800 TOK`.
* **Headline (`X: 0.75 in`, `Y: 0.45 in`):** `A lean, local-first architecture.` (`Inter Bold`, `32pt`, `#FFFFFF`).
* **Left Column — Bullets (`X: 0.75 in`, `Y: 1.45 in`, `W: 5.20 in`, `17pt`):**
  * Manifest V3 + TypeScript + esbuild; Shadow DOM UI.
  * IndexedDB schema mirroring SQLite/FTS5 field names.
  * Modules: extractor, codeState, gemini, injector, storage, background.
  * Zero backend. Zero telemetry. Local-first by design.
* **Right Column — Module Block Diagram (`X: 6.25 in`, `Y: 1.45 in`, `W: 6.33 in`, `H: 5.25 in`):**
  * Layered architectural diagram with `#06B6D4` orthogonal connectors:
    * **Top Layer (UI & Host):** `Shadow DOM Overlay` $\leftrightarrow$ `background.ts` (Service Worker).
    * **Middle Layer (Extraction Engine):** `extractor.ts` $\rightarrow$ `codeState.ts` (Regex) $\dashrightarrow$ `gemini.ts` (Optional Fallback).
    * **Bottom Layer (Persistence & Output):** `storage.ts` (`IndexedDB / FTS5-Schema`) $\rightarrow$ `injector.ts` (`7 AI Targets`).

### SLIDE 9 — Implementation Timeline (Gantt)

* **Accent:** Cyan (`#06B6D4`) | **Capsule Motif:** `680 / 800 TOK`.
* **Headline (`X: 0.75 in`, `Y: 0.45 in`):** `Build order: one session, thirteen steps.` (`Inter Bold`, `32pt`, `#FFFFFF`).
* **Main Visual — Gantt Container (`X: 0.75 in`, `Y: 1.40 in`, `W: 11.83 in`, `H: 4.85 in`):**
  * Dashed Cyan border (`2pt`), label `[GANTT PLACEHOLDER]` at top-left (`IBM Plex Mono Bold`, `13pt`, `#06B6D4`).
  * 5 grouped horizontal swimlanes displaying 13 stepped bars across a single-session timeline (`Step 1` $\rightarrow$ `Step 13`):
    * **Phase 1 — Scaffold (`Step 1`):** Manifest V3, `tsconfig`, `esbuild` bundler.
    * **Phase 2 — Storage / Extraction (`Steps 2–4`):** IndexedDB schema, SHA-256 dedup, 6-category `codeState` regex.
    * **Phase 3 — Fallback / Injection (`Steps 5–6`):** Optional Gemini fallback, cross-platform DOM injector.
    * **Phase 4 — Router / UI (`Steps 7–10`):** Background message router, Shadow DOM popup, `Ctrl+Shift+M` shortcut, ranking.
    * **Phase 5 — Docs / Build / Test (`Steps 11–13`):** Documentation, production bundle, multi-platform E2E test.
* **Footer Note (`X: 0.75 in`, `Y: 6.45 in`, `IBM Plex Mono`, `14pt`, `#06B6D4`):**
  * `User Stories: [LINK PLACEHOLDER]`

### DIVIDER 06 — Section 6 Chapter Divider

* **Background:** Full-bleed **Orange** (`#F97316`).
* **Content (Centered):**
  * Section Number: `06` (`Inter ExtraBold`, `96pt`, `rgba(15,16,32,0.28)`).
  * Section Title: `Feasibility & Expected Impact` (`Inter Bold`, `52pt`, `#0F1020`).

### SLIDE 10 — Feasibility & Limitations

* **Accent:** Orange (`#F97316`) | **Capsule Motif:** `720 / 800 TOK`.
* **Headline (`X: 0.75 in`, `Y: 0.45 in`):** `Honest constraints.` (`Inter Bold`, `32pt`, `#FFFFFF`).
* **Two-Column Contrast Layout (`Y: 1.50 in`, `H: 5.15 in`):**
  * **Left Column — "Feasible" (`X: 0.75 in`, `W: 5.70 in`, `#10B981` Emerald Header & Border):**
    * **Deployment:** Load-unpacked Manifest V3, zero cost, MIT-style.
    * **Privacy:** Data stays local except optional Gemini call.
    * **Zero Infra:** No backend or telemetry planned.
  * **Right Column — "Limitations" (`X: 6.88 in`, `W: 5.70 in`, `#F97316` Orange Header & Border):**
    * **Regex Coverage:** Misses non-standard code; Gemini fallback needs key.
    * **DOM Injection:** May fail on exotic rich-text editors $\rightarrow$ clipboard.
    * **Context Window:** Capped at $\le 800$ tokens by design for portability.

### SLIDE 11 — Expected Impact

* **Accent:** Orange (`#F97316`) | **Capsule Motif:** `760 / 800 TOK`.
* **Headline (`X: 0.75 in`, `Y: 0.45 in`):** `Less repetition, more continuity.` (`Inter Bold`, `32pt`, `#FFFFFF`).
* **Top Visual — Three Oversized Context Stat Cards (`X: 0.75 in`, `Y: 1.45 in`, `W: 11.83 in`, `H: 2.35 in`):**
  * **Stat 1:** `78%` (`Inter ExtraBold`, `64pt`, `#F97316`) — Cited token reduction with $4\%$ coherence loss (IEEE 2026).
  * **Stat 2:** `90%+` (`Inter ExtraBold`, `64pt`, `#F97316`) — Cited token savings via memory-augmented QA (arXiv 2025).
  * **Stat 3:** `800` (`Inter ExtraBold`, `64pt`, `#F97316`) — Target token ceiling ($3,200$ chars) per MEEMORY capsule.
* **Bottom Bullets (`X: 0.75 in`, `Y: 4.15 in`, `W: 11.83 in`, `17pt`):**
  * Benchmark context: $78\%$ token reduction, $4\%$ coherence loss (IEEE 2026).
  * Benchmark context: $90\%+$ token savings in memory-augmented QA (arXiv 2025).
  * Multi-session state preservation remains open gap (MemoryArena, 2026).
  * MEEMORY targets gap with structured, portable code state.

### DIVIDER 07 — Section 7 Chapter Divider

* **Background:** Full-bleed **Violet** (`#8B5CF6`).
* **Content (Centered):**
  * Section Number: `07` (`Inter ExtraBold`, `96pt`, `rgba(255,255,255,0.35)`).
  * Section Title: `Conclusion & Future Work` (`Inter Bold`, `52pt`, `#FFFFFF`).

### SLIDE 12 — Conclusion

* **Accent:** Violet (`#8B5CF6`) | **Capsule Motif:** `800 / 800 TOK` (100% Full).
* **Headline (`X: 0.75 in`, `Y: 0.45 in`):** `Memory that travels with the project.` (`Inter Bold`, `32pt`, `#FFFFFF`).
* **Left Column — Bullets (`X: 0.75 in`, `Y: 1.75 in`, `W: 6.20 in`, `20pt`):**
  * Proposes portable code state rather than prose summaries.
  * Offline, universal, token-efficient by design.
  * Intended outcome: a working, buildable, local-first extension.
* **Right Column — Hero Visual (`X: 7.40 in`, `Y: 1.65 in`, `W: 5.18 in`, `H: 4.80 in`):**
  * Large horizontal "Memory Capsule" pill (`W: 4.80 in`, `H: 1.60 in`, `corner radius = 0.80 in`) filled `100%` with a luminous Violet gradient (`#7C3AED` $\rightarrow$ `#C084FC`), displaying `≤800 TOKENS · PORTABLE CODE STATE` and 6 glowing category dots beneath.

### SLIDE 13 — Future Work

* **Accent:** Violet (`#8B5CF6`) | **Capsule Motif:** `800 / 800 TOK`.
* **Headline (`X: 0.75 in`, `Y: 0.45 in`):** `What comes next.` (`Inter Bold`, `32pt`, `#FFFFFF`).
* **Visual — Directional 4-Milestone Roadmap Arrow (`X: 0.75 in`, `Y: 1.75 in`, `W: 11.83 in`, `H: 4.90 in`):**
  * Thick horizontal Violet progression spine (`Y: 2.35 in`) with four milestone nodes (`M1` $\rightarrow$ `M4`) and vertical cards below (`W: 2.75 in`, `H: 3.40 in`):
    * **Milestone 1 (`KNOWLEDGE GRAPH`):** Entity/relation knowledge graph across capsules.
    * **Milestone 2 (`LOCAL PEER SYNC`):** CRDT-based peer sync (local network only).
    * **Milestone 3 (`LOCAL LLM`):** Optional local-LLM summarizer to replace Gemini entirely.
    * **Milestone 4 (`MCP SERVER`):** MCP server so coding agents read capsules directly.

### DIVIDER 08 — Section 8 Chapter Divider

* **Background:** Full-bleed **Slate** (`#334155`).
* **Content (Centered):**
  * Section Number: `08` (`Inter ExtraBold`, `96pt`, `rgba(255,255,255,0.30)`).
  * Section Title: `References` (`Inter Bold`, `54pt`, `#FFFFFF`).

### SLIDE 14 — References

* **Background:** Deep Slate (`#1E293B`) — flat, zero decorative elements per specification.
* **Headline (`X: 0.75 in`, `Y: 0.40 in`):** `References (30 papers, 2024–2026).` (`Inter Bold`, `26pt`, `#F8FAFC`).
* **Two-Column Citation Block (`Y: 1.05 in`, `H: 6.00 in`, `IBM Plex Sans Regular`, `8pt`, `#CBD5E1`, `1.28` line spacing):**
  * **Left Column (`X: 0.75 in`, `W: 5.75 in` — `[1]` to `[15]`):**
    * `[1]` CogCanvas, arXiv:2601.00821, 2026.
    * `[2]` AESP, Scilit, 2026.
    * `[3]` WebCoach, arXiv:2511.12997, 2025.
    * `[4]` In Prospect and Retrospect, ACL 2025, arXiv:2503.08026.
    * `[5]` LUFY, Dialogue & Discourse, 2025, arXiv:2409.12524.
    * `[6]` Survey of Context Engineering, arXiv, 2025.
    * `[7]` Memory in the Age of AI Agents, Hugging Face, 2026.
    * `[8]` Evaluating Long-Term Memory for Long-Context QA, arXiv:2510.23730, 2025.
    * `[9]` PersonaAgent, NeurIPS 2025.
    * `[10]` Posterior Salience Attenuation, arXiv:2506.08371, 2025.
    * `[11]` DACP, EMNLP 2025 Workshop, arXiv:2510.05858.
    * `[12]` Systemic Failure in AI Moderation, GitHub, 2025.
    * `[13]` Human-inspired Long-Term Memory, IEEE, 2026, doc 11340339.
    * `[14]` Memoria, IEEE, 2026, doc 11330332.
    * `[15]` Incremental Context Distillation, IEEE, 2026, doc 11377630.
  * **Right Column (`X: 6.83 in`, `W: 5.75 in` — `[16]` to `[30]`):**
    * `[16]` Two-Stage Dialogue Summarization, IEEE, 2025, doc 11448447.
    * `[17]` AISum4DCR, IEEE, 2025, doc 11216442.
    * `[18]` Conversational Summarization and Response Generation, IEEE, 2025, doc 11337320.
    * `[19]` Assertion-Aware Test Code Summarization, IEEE, 2025, doc 11334458.
    * `[20]` PromptCS, IEEE, 2025, doc 11173455.
    * `[21]` Dual-Granularity Document Indexing, IEEE, 2025, doc 10969878.
    * `[22]` AI Compute Architecture and Evolution Trends, IEEE, 2026, doc 11466388.
    * `[23]` TEM, Google Scholar, 2026.
    * `[24]` Chronos, Google Scholar, 2026.
    * `[25]` Dependency-Tethered Memory, arXiv:2610.25123, 2026.
    * `[26]` SPECTRUM, arXiv:2401.17597, 2024.
    * `[27]` MemoryArena, ResearchGate, 2026.
    * `[28]` CADS, ResearchGate, 2025.
    * `[29]` Building AI Coding Agents for the Terminal, ResearchGate, 2025.
    * `[30]` Self-Growing Memory AI Agent, ResearchGate, 2025.