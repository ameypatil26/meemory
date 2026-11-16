# AGENT.md — MEEMORY maintainer notes

Guides for modifying the extension safely.

## Add a platform extractor

1. Add an entry to `PLATFORMS` in `extractor.ts`:
   - `id` — short platform slug (used as `platform` field + badge).
   - `hosts` — hostname suffixes to match.
   - `messageSelectors` — CSS selectors matching each message container.
   - `userSelectors` — selectors (or `el.matches`/`querySelector` targets)
     marking user-authored messages. Tag-based platforms (Gemini) use
     `userTags`/`assistantTags` instead.
2. If the platform needs path gating (e.g. bing.com only on `/chat`), add a
   condition in `detectPlatform` next to the existing `copilot`/`grok` checks.
3. Verify role classification: open the site, run
   `extractConversation(document)` in devtools — check `messages[].role`.
4. Rebuild (`npm run build`) and reload `chrome://extensions`.

If no per-host spec matches but the page has ≥2 generic message containers,
`detectPlatform` already returns `'generic'` — no work needed for most sites.

## Modify the capsule format

- Template + truncation logic: `buildCapsule()` in `codeState.ts`.
  Keep the 3200-char cap; the drop-order rule (lose Structure + Next Steps
  first) is spec — preserve it.
- Section extraction regexes are **pinned by spec — do not tune them**. If a
  new section type is needed, add a new regex + render block + include it in
  `countStructuralSections` (the ≥2 threshold decides logic-vs-Gemini).
- Gemini output normalization: `geminiToCapsule()` — keep field names aligned
  with the prompt JSON in `gemini.ts` (`PROMPT` const).
- Token estimate is `ceil(capsule.length / 4)` — the >800 warning keys off it.

## Debug injection failures

Injection lives in `injector.ts` + the Paste handler in `content.ts`.

1. **Nothing happens on Paste** — check the console on the chat page for
   content-script errors; verify `findChatInput()` returns an element
   (run it in devtools on the page).
2. **Text goes to clipboard instead of the input** — the input wasn't a
   `textarea`/`contenteditable`, or `execCommand` failed (some apps disable
   it). This is the designed fallback; the toast tells the user to `Ctrl+V`.
3. **Text appears but the app doesn't register it** — for React/Vue inputs the
   native setter + `input` event path in `setNativeTextareaValue` is required;
   if a framework still misses it, the element may be a custom widget — extend
   `INPUT_SELECTORS` or add a framework-specific setter.
4. **Floating UI missing** — check Settings → "Show floating button", that
   `detectPlatform` returns non-null on the page, and that capsules exist
   (the Load Memory button hides at zero capsules; Save chat stays visible).
5. **Shadow DOM inspection** — the widget is under `#meemory-root` →
   `shadowRoot`; inspect it in devtools to see panel/toast state.

## Pipeline debugging

- Extraction runs in `background.js` (service worker). View logs at
  `chrome://extensions` → MEEMORY → "service worker" inspect.
- `SAVE_CHAT` short-circuits when `rawText.trim().length < 20`.
- Gemini is only called when `countStructuralSections < 2` AND `geminiKey` is
  set; it silently returns `null` on any HTTP/parse error → low-quality
  fallback. Check `quality` badge (⚠️) to spot fallback captures.
- Dedup: capsules with identical normalized content within 24h update in
  place — same `id`/`created_at`, refreshed `capsule`/`raw_excerpt`.

## Build & verify

```bash
npm install
npm run build      # must exit clean — zero errors is the bar
npx tsc --noEmit   # optional stricter check
```

Outputs `background.js`, `content.js`, `popup.js` next to sources; load the
`meemory/` folder unpacked. `styles.css` is imported as text into the shadow
bundle AND linked normally by `popup.html` — keep selectors generic enough for
both contexts (`.mm-*` prefix is the convention).
