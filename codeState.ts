/**
 * codeState.ts — logic-first extraction of structured CODE STATE from raw chat
 * text, capsule formatting, topic/name derivation, and SHA-256 dedup hashing.
 *
 * All regexes below are pinned per spec — do not "tune" them.
 */
import type { ChatMessage } from './extractor';

/** Structured sections extracted from a conversation. */
export interface CodeSections {
  files: { name: string; desc: string }[];
  variables: { name: string; initialized: boolean }[];
  functions: { name: string; purpose: string }[];
  classes: string[];
  imports: { module: string; pkg: string }[];
  structure: string[];
  chapters: string[];
  summary: string;
  decisions: string[];
  next: string[];
}

/** Normalized shape accepted from the Gemini fallback. */
export interface GeminiData {
  topic?: string;
  files?: { name?: string; desc?: string }[] | string[];
  variables?: (string | { name?: string })[];
  functions?: (string | { name?: string })[];
  classes?: string[];
  imports?: string[];
  structure?: string;
  chapters?: string[];
  summary?: string;
  decisions?: string[];
  next?: string[];
}

const MAX_CAPSULE_CHARS = 3200;

const RE_FILE = /[\w\-/]+\.(html|css|js|ts|jsx|tsx|py|json|md|vue|svelte)/g;
const RE_VAR = /(const|let|var)\s+(\w+)/g;
const RE_FUNC =
  /(function\s+(\w+)|(\w+)\s*=\s*(\([^)]*\)\s*=>|function)|(\w+)\s*\([^)]*\)\s*\{)/g;
const RE_CLASS = /class\s+(\w+)/g;
const RE_IMPORT =
  /(import\s+.*from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g;
const RE_STRUCTURE_LINE = /[├└]──|^\s*\|--|\/$/m;
// Prose structure: markdown headings and explicit chapter/part markers.
const RE_CHAPTER_LINE = /^\s*(?:#{1,6}\s+|(?:chapter|part|prologue|epilogue|act)\s+)[^\n]{2,90}$/gim;

const DECISION_WORDS = [
  'decided',
  'chose',
  'will use',
  'approach',
  'architecture',
  'instead of',
  'switched to',
];
const NEXT_WORDS = ['next', 'todo', 'should'];

const MAX_SECTION_ITEMS = 12;
const MAX_SENTENCE_LEN = 220;

/**
 * Counts how many of the six structural sections are non-empty.
 * @param s - extracted sections.
 * @returns {number} count in range 0..6.
 */
export function countStructuralSections(s: CodeSections): number {
  let n = 0;
  if (s.files.length) n++;
  if (s.variables.length) n++;
  if (s.functions.length) n++;
  if (s.classes.length) n++;
  if (s.imports.length) n++;
  if (s.structure.length) n++;
  if (s.chapters.length) n++;
  if (s.summary) n++;
  return n;
}

/**
 * Returns the first sentence in `text` that mentions `token`, trimmed.
 * @param text - haystack.
 * @param token - literal to look for (case-insensitive).
 * @returns {string} sentence or empty string.
 */
function firstMentionSentence(text: string, token: string): string {
  const sentences = text.match(/[^.!?\n]+[.!?]?/g) ?? [];
  const lower = token.toLowerCase();
  for (const s of sentences) {
    if (s.toLowerCase().includes(lower)) {
      return s.trim().replace(/\s+/g, ' ').slice(0, MAX_SENTENCE_LEN);
    }
  }
  return '';
}

/**
 * Extracts sentences whose text contains any of the given keywords.
 * @param text - haystack.
 * @param keywords - lowercase substrings to match.
 * @param cap - max items returned.
 * @returns {string[]} matching sentences, deduped.
 */
function keywordSentences(text: string, keywords: string[], cap: number): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?]?/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of sentences) {
    const s = raw.trim().replace(/\s+/g, ' ');
    if (s.length < 8 || s.length > MAX_SENTENCE_LEN) continue;
    const lower = s.toLowerCase();
    if (!keywords.some((k) => lower.includes(k))) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Extracts the first 2–3 sentences of the LAST assistant-role message in
 * flattened "role: text" raw conversation. Powers prose summaries + naming.
 * @param rawText - flattened conversation.
 * @returns {string} summary sentences ('' when none found).
 */
export function lastAssistantSummary(rawText: string): string {
  const blocks = rawText.split(/\n\n(?=(?:user|assistant):)/);
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]!;
    if (!b.startsWith('assistant:')) continue;
    const body = b.slice('assistant:'.length).trim();
    const sentences = body.match(/[^.!?\n]+[.!?]+/g) ?? [body];
    return sentences
      .slice(0, 3)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 400);
  }
  return '';
}

/**
 * Runs the full logic-first extraction pass over raw conversation text.
 * @param rawText - flattened conversation ("role: text" blocks).
 * @returns {CodeSections} populated sections (possibly all empty).
 */
export function extractCodeState(rawText: string): CodeSections {
  const sections: CodeSections = {
    files: [],
    variables: [],
    functions: [],
    classes: [],
    imports: [],
    structure: [],
    chapters: [],
    summary: lastAssistantSummary(rawText),
    decisions: [],
    next: [],
  };

  // FILES
  const files = new Set<string>();
  for (const m of rawText.matchAll(RE_FILE)) {
    const name = m[0];
    if (/^https?/.test(name)) continue;
    files.add(name);
    if (files.size >= MAX_SECTION_ITEMS) break;
  }
  for (const name of files) {
    sections.files.push({ name, desc: firstMentionSentence(rawText, name) });
  }

  // VARIABLES
  const vars = new Map<string, boolean>();
  for (const m of rawText.matchAll(RE_VAR)) {
    const name = m[2]!;
    if (vars.has(name)) continue;
    const tail = rawText.slice(m.index ?? 0, (m.index ?? 0) + 200);
    const lineEnd = tail.indexOf('\n');
    const window = lineEnd > 0 ? tail.slice(0, lineEnd) : tail;
    vars.set(name, /=/.test(window.replace(/==|=>/g, '')));
    if (vars.size >= MAX_SECTION_ITEMS) break;
  }
  for (const [name, initialized] of vars) {
    sections.variables.push({ name, initialized });
  }

  // FUNCTIONS
  const funcs = new Map<string, string>();
  for (const m of rawText.matchAll(RE_FUNC)) {
    const name = m[2] ?? m[4] ?? m[6];
    if (!name || funcs.has(name)) continue;
    funcs.set(name, firstMentionSentence(rawText, name));
    if (funcs.size >= MAX_SECTION_ITEMS) break;
  }
  for (const [name, purpose] of funcs) {
    sections.functions.push({ name, purpose });
  }

  // CLASSES
  const classes = new Set<string>();
  for (const m of rawText.matchAll(RE_CLASS)) {
    classes.add(m[1]!);
    if (classes.size >= MAX_SECTION_ITEMS) break;
  }
  sections.classes = [...classes];

  // IMPORTS
  const imports = new Map<string, string>();
  for (const m of rawText.matchAll(RE_IMPORT)) {
    if (m[2] !== undefined) {
      // import ... from 'pkg'
      const clause = (m[1] ?? '').replace(/^import\s+/, '').replace(/\s*from\s*$/, '').trim();
      const binding = clause.split(/\s+from\s+/)[0] ?? clause;
      imports.set(binding || clause || 'import', m[2]);
    } else if (m[3] !== undefined) {
      imports.set('require', m[3]);
    }
    if (imports.size >= MAX_SECTION_ITEMS) break;
  }
  for (const [module, pkg] of imports) {
    sections.imports.push({ module, pkg });
  }

  // STRUCTURE — lines matching the tree-drawing pattern.
  const structure: string[] = [];
  for (const line of rawText.split('\n')) {
    if (RE_STRUCTURE_LINE.test(line)) {
      const t = line.trim();
      if (t && !structure.includes(t)) structure.push(t);
      if (structure.length >= MAX_SECTION_ITEMS) break;
    }
  }
  sections.structure = structure;

  // CHAPTERS — markdown headings + explicit chapter/part markers.
  const chapters: string[] = [];
  const seenCh = new Set<string>();
  for (const m of rawText.matchAll(RE_CHAPTER_LINE)) {
    const t = m[0].trim().replace(/^#+\s*/, '').replace(/\s+/g, ' ');
    if (t.length < 3 || seenCh.has(t.toLowerCase())) continue;
    seenCh.add(t.toLowerCase());
    chapters.push(t);
    if (chapters.length >= MAX_SECTION_ITEMS) break;
  }
  sections.chapters = chapters;

  // DECISIONS / NEXT — keyword sentences.
  sections.decisions = keywordSentences(rawText, DECISION_WORDS, MAX_SECTION_ITEMS);
  sections.next = keywordSentences(rawText, NEXT_WORDS, MAX_SECTION_ITEMS);

  return sections;
}

/**
 * Derives the capsule topic: first ≤60 chars of the first user message,
 * trimmed at a word boundary, markdown stripped.
 * @param messages - role-tagged messages.
 * @returns {string} topic string (may be empty).
 */
export function deriveTopic(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user') ?? messages[0];
  if (!first) return '';
  let t = first.text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[`*_#>\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= 60) return t;
  const cut = t.slice(0, 60);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * Converts a topic into a capsule name slug.
 * @param topic - raw topic text.
 * @returns {string} slug ≤40 chars, e.g. "build-portfolio-site".
 */
export function makeName(topic: string): string {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'untitled-chat';
}

/**
 * Builds the search_text haystack.
 * @param name - capsule name.
 * @param capsule - capsule markdown.
 * @param platform - platform id.
 * @returns {string} lowercased search text.
 */
export function buildSearchText(name: string, capsule: string, platform: string): string {
  return `${name} ${capsule} ${platform}`.toLowerCase();
}

/**
 * Renders sections into the capsule markdown format.
 * Drops Structure + Next Steps first when over the 3200-char cap.
 * @param topic - project topic (≤60 chars).
 * @param s - extracted sections.
 * @returns {string} capsule markdown.
 */
export function buildCapsule(topic: string, s: CodeSections): string {
  const render = (includeTail: boolean): string => {
    const lines: string[] = [`## Project: ${topic || 'Untitled'}`];
    if (s.summary) lines.push('## Summary', s.summary);
    if (s.files.length) {
      lines.push('## Files');
      for (const f of s.files) lines.push(`- ${f.name}${f.desc ? `: ${f.desc}` : ''}`);
    }
    if (s.variables.length) {
      lines.push('## Variables');
      for (const v of s.variables) {
        lines.push(`- \`${v.name}\` (initialized: ${v.initialized ? 'yes' : 'no'})`);
      }
    }
    if (s.functions.length) {
      lines.push('## Functions');
      for (const f of s.functions) lines.push(`- \`${f.name}()\`${f.purpose ? `: ${f.purpose}` : ''}`);
    }
    if (s.classes.length) {
      lines.push('## Classes');
      for (const c of s.classes) lines.push(`- \`${c}\``);
    }
    if (s.imports.length) {
      lines.push('## Imports');
      for (const i of s.imports) lines.push(`- \`${i.module}\` from '${i.pkg}'`);
    }
    if (s.chapters.length) {
      lines.push('## Chapters');
      for (const c of s.chapters) lines.push(`- ${c}`);
    }
    if (includeTail && s.structure.length) {
      lines.push('## Project Structure');
      lines.push(...s.structure);
    }
    if (s.decisions.length) {
      lines.push('## Key Decisions');
      for (const d of s.decisions) lines.push(`- ${d}`);
    }
    if (includeTail && s.next.length) {
      lines.push('## Next Steps');
      for (const n of s.next) lines.push(`- ${n}`);
    }
    return lines.join('\n');
  };

  let capsule = render(true);
  if (capsule.length > MAX_CAPSULE_CHARS) capsule = render(false);
  if (capsule.length > MAX_CAPSULE_CHARS) {
    capsule = capsule.slice(0, MAX_CAPSULE_CHARS).replace(/\s+\S*$/, '') + '\n…';
  }
  return capsule;
}

/**
 * Converts a normalized Gemini extraction into capsule markdown.
 * @param topic - topic (Gemini-provided or derived).
 * @param data - parsed Gemini JSON.
 * @returns {string} capsule markdown.
 */
export function geminiToCapsule(topic: string, data: GeminiData): string {
  const sections: CodeSections = {
    files: (data.files ?? []).map((f) =>
      typeof f === 'string' ? { name: f, desc: '' } : { name: f.name ?? '', desc: f.desc ?? '' },
    ).filter((f) => f.name),
    variables: (data.variables ?? []).map((v) =>
      typeof v === 'string' ? { name: v, initialized: true } : { name: v.name ?? '', initialized: true },
    ).filter((v) => v.name),
    functions: (data.functions ?? []).map((f) =>
      typeof f === 'string' ? { name: f, purpose: '' } : { name: f.name ?? '', purpose: '' },
    ).filter((f) => f.name),
    classes: (data.classes ?? []).filter(Boolean),
    imports: (data.imports ?? []).map((m) => ({ module: m, pkg: m })),
    structure: data.structure ? data.structure.split('\n').map((l) => l.trim()).filter(Boolean) : [],
    chapters: data.chapters ?? [],
    summary: data.summary ?? '',
    decisions: data.decisions ?? [],
    next: data.next ?? [],
  };
  return buildCapsule(topic, sections);
}

/**
 * Normalizes capsule content for hashing: lowercase, trim, collapse whitespace.
 * @param text - capsule or excerpt text.
 * @returns {string} normalized string.
 */
export function normalizeForHash(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Computes a SHA-256 hex digest of normalized content.
 * @param text - content to hash.
 * @returns {Promise<string>} hex digest.
 */
export async function hashContent(text: string): Promise<string> {
  const data = new TextEncoder().encode(normalizeForHash(text));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Derives a stable-ish capsule id: sha256(topic + timestamp), first 24 hex chars.
 * @param topic - capsule topic.
 * @returns {Promise<string>} hex id.
 */
export async function makeId(topic: string): Promise<string> {
  return (await hashContent(`${topic}|${Date.now()}`)).slice(0, 24);
}

/**
 * Builds the exact text injected into a chat input on Paste.
 * @param capsule - capsule markdown body.
 * @returns {string} wrapped prefix + capsule + suffix.
 */
export function buildInjectionText(capsule: string): string {
  return (
    '[MEEMORY CAPSULE — Project State]\n' +
    'Continue this project from where it left off. Do NOT restart. The state below is current.\n\n' +
    '---\n' +
    `${capsule}\n` +
    '---\n' +
    'Continue. Do not repeat what is already done. Build on this state.'
  );
}

/**
 * Builds the low-quality fallback record body (1500-char excerpt).
 * @param rawText - raw conversation text.
 * @param platform - platform id.
 * @returns {{ capsule: string; name: string }} capsule field = excerpt.
 */
export function lowQualityFallback(rawText: string, platform: string): {
  capsule: string;
  name: string;
} {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 16);
  // Aggressive token reduction: keep the opening (project setup) and the
  // tail (most recent state); drop the middle entirely.
  let body: string;
  if (rawText.length <= 3000) {
    body = rawText;
  } else {
    body =
      rawText.slice(0, 1000) +
      '\n\n…[middle truncated to save tokens]…\n\n' +
      rawText.slice(-2000);
  }
  return {
    capsule: `## Raw excerpt (${platform})\n\n${body}`,
    name: `Untitled chat ${ts}`,
  };
}
