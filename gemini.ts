/**
 * gemini.ts — optional Gemini API fallback extractor.
 *
 * Only invoked when the logic pass finds <2 structural sections AND the user
 * has configured a key. Fully offline-capable: returns null on any failure.
 */
import type { GeminiData } from './codeState';

const MODEL = 'gemini-2.0-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 20000;

const PROMPT =
  'Extract the COMPLETE code state from this AI chat. Return ONLY valid JSON: ' +
  '{"topic":"...","files":[{"name":"...","desc":"..."}],"variables":["name"],' +
  '"functions":["name"],"classes":["name"],"imports":["module"],' +
  '"structure":"...","decisions":["..."],"next":["..."]}. Be exhaustive.';

/**
 * Coerces an unknown parsed value into a safe {@link GeminiData} shape.
 * @param raw - parsed JSON value.
 * @returns {GeminiData} normalized data.
 */
function normalizeGemini(raw: unknown): GeminiData {
  if (typeof raw !== 'object' || raw === null) return {};
  const o = raw as Record<string, unknown>;
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const strArr = (v: unknown): string[] =>
    arr(v).filter((x): x is string => typeof x === 'string');
  return {
    topic: typeof o.topic === 'string' ? o.topic : undefined,
    files: arr(o.files) as GeminiData['files'],
    variables: arr(o.variables) as GeminiData['variables'],
    functions: arr(o.functions) as GeminiData['functions'],
    classes: strArr(o.classes),
    imports: strArr(o.imports),
    structure: typeof o.structure === 'string' ? o.structure : undefined,
    decisions: strArr(o.decisions),
    next: strArr(o.next),
  };
}

/**
 * Calls Gemini to extract structured code state from a raw conversation.
 * @param apiKey - user's Gemini API key (never logged).
 * @param rawText - flattened conversation text (≤15000 chars).
 * @returns {Promise<GeminiData | null>} parsed extraction, or null on failure.
 */
export async function extractWithGemini(
  apiKey: string,
  rawText: string,
): Promise<GeminiData | null> {
  if (!apiKey) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${PROMPT}\n\n---\n\n${rawText}` }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) return null;

    // Strip markdown fences if the model ignored responseMimeType.
    const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    return normalizeGemini(JSON.parse(cleaned));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
