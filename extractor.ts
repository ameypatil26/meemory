/**
 * extractor.ts — per-host DOM extraction of raw chat conversations.
 *
 * Runs inside the content script (needs DOM access). Produces a platform tag,
 * a role-tagged message list, and a flat raw text blob that the background
 * service worker feeds into the code-state pipeline.
 */

/** A single chat message with a best-effort role. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

/** Result of scanning a page for a conversation. */
export interface Conversation {
  /** Platform id: chatgpt | claude | gemini | deepseek | grok | copilot | perplexity | generic. */
  platform: string;
  /** Ordered messages with roles. */
  messages: ChatMessage[];
  /** Flattened text, truncated to 15000 chars. */
  rawText: string;
}

/** Selector sets for one platform. */
interface PlatformSpec {
  id: string;
  /** host suffixes / path predicates. */
  hosts: string[];
  /** selectors that match message containers (any role). */
  messageSelectors: string[];
  /** selectors/predicates that mark an element as a user message. */
  userSelectors: string[];
  /** tag names that imply role (gemini). */
  userTags?: string[];
  assistantTags?: string[];
}

const MAX_RAW = 15000;
const MAX_MESSAGES = 200;

/** Per-platform extraction rules. */
const PLATFORMS: PlatformSpec[] = [
  {
    id: 'chatgpt',
    hosts: ['chatgpt.com', 'chat.openai.com'],
    messageSelectors: ['[data-message-author-role]'],
    userSelectors: ['[data-message-author-role="user"]'],
    assistantTags: [],
  },
  {
    id: 'claude',
    hosts: ['claude.ai', 'claude.com'],
    messageSelectors: ['[data-testid="chat-message"]', '.font-claude-message'],
    userSelectors: ['[data-testid="human-turn"]', '.human-turn', '[data-testid="user-message"]'],
  },
  {
    id: 'gemini',
    hosts: ['gemini.google.com', 'bard.google.com'],
    messageSelectors: ['user-query', 'model-response'],
    userSelectors: [],
    userTags: ['USER-QUERY'],
    assistantTags: ['MODEL-RESPONSE'],
  },
  {
    id: 'deepseek',
    hosts: ['chat.deepseek.com', 'deepseek.com'],
    messageSelectors: ['[class*="message"]'],
    userSelectors: ['[class*="user"]', '[class*="right"]'],
  },
  {
    id: 'grok',
    hosts: ['grok.com', 'x.com'],
    messageSelectors: ['[data-message]', '[class*="message"]'],
    userSelectors: ['[data-message-author-role="user"]', '[class*="user"]'],
  },
  {
    id: 'copilot',
    hosts: ['copilot.microsoft.com', 'bing.com'],
    messageSelectors: ['[data-testid="chat-message"]', '[class*="conversation"]'],
    userSelectors: ['[data-testid="user-message"]', '[class*="user"]'],
  },
  {
    id: 'perplexity',
    hosts: ['perplexity.ai', 'www.perplexity.ai'],
    messageSelectors: ['[class*="message"]', '[data-test="response"]'],
    userSelectors: ['[class*="user"]', '[class*="query"]'],
  },
];

const GENERIC_SELECTORS = ['[class*="message"]', '[role="log"]', '[role="article"]'];
const CHAT_INPUT_SELECTOR = 'textarea, [contenteditable="true"], div[contenteditable]';

/**
 * Non-AI web sources that can still be captured as memories ("Send to AI").
 * Each maps a hostname to the selector holding the visible conversation.
 */
const WEB_SOURCES: { id: string; hosts: string[]; selectors: string[] }[] = [
  {
    id: 'gmail',
    hosts: ['mail.google.com'],
    selectors: ['[role="main"]', 'div[role="main"]'],
  },
  {
    id: 'whatsapp',
    hosts: ['web.whatsapp.com'],
    selectors: ['#main', '[data-testid="conversation-panel"]'],
  },
];

/**
 * Elements stripped before text extraction — chrome UI, auth prompts,
 * navigation, and non-content nodes. Matched case-insensitively on
 * class/id substrings for login/signup/menu/sidebar noise.
 */
const NOISE_SELECTOR = [
  'nav',
  'header',
  'footer',
  'button',
  'script',
  'style',
  'noscript',
  'svg',
  'iframe',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[class*="login" i]',
  '[id*="login" i]',
  '[class*="signup" i]',
  '[id*="signup" i]',
  '[class*="sign-up" i]',
  '[id*="sign-up" i]',
  '[class*="menu" i]',
  '[id*="menu" i]',
  '[class*="sidebar" i]',
  '[id*="sidebar" i]',
].join(', ');

/**
 * Clones the page body and strips UI noise. Always operates on a clone —
 * the live DOM is never mutated.
 * @param doc - source document.
 * @returns {HTMLElement} pruned body clone.
 */
function cleanedScope(doc: Document): HTMLElement {
  const clone = doc.body.cloneNode(true) as HTMLElement;
  for (const el of Array.from(clone.querySelectorAll(NOISE_SELECTOR))) {
    el.remove();
  }
  return clone;
}

/**
 * Picks extraction roots inside the cleaned scope: semantic content
 * containers when present, otherwise the whole scope.
 * @param scope - pruned body clone.
 * @returns {ParentNode[]} roots to search for messages/content.
 */
function contentRoots(scope: HTMLElement): ParentNode[] {
  const mains = Array.from(scope.querySelectorAll('main, article, [role="main"]'));
  return mains.length > 0 ? mains : [scope];
}

/**
 * Detects a substantial chat-style input: a textarea with ≥2 rows or ≥40px
 * height, or a contenteditable of similar size. Filters out tiny inputs.
 * @param doc - document to probe.
 * @returns {boolean} true when a chat-sized input exists.
 */
function hasChatInput(doc: Document): boolean {
  let nodes: NodeListOf<Element>;
  try {
    nodes = doc.querySelectorAll(CHAT_INPUT_SELECTOR);
  } catch {
    return false;
  }
  for (const n of Array.from(nodes)) {
    const el = n as HTMLElement;
    if (el.offsetParent === null && el.getClientRects().length === 0) continue;
    const h = el.offsetHeight || el.getBoundingClientRect().height;
    if (el.tagName === 'TEXTAREA') {
      const rows = Number((el as HTMLTextAreaElement).rows) || 1;
      if (h >= 40 || rows >= 2) return true;
    } else if (h >= 40) {
      return true;
    }
  }
  return false;
}

/**
 * Detects which AI chat platform the current page belongs to.
 * Falls back to generic message-container detection on unknown hosts.
 * @param url - page URL.
 * @param doc - document to probe.
 * @returns {string | null} platform id, or null when nothing chat-like is found.
 */
export function detectPlatform(
  url: string,
  doc: Document = document,
  customDomains: string[] = [],
): string | null {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return '';
    }
  })();

  for (const p of PLATFORMS) {
    const hostMatch = p.hosts.some((h) => host === h || host.endsWith('.' + h));
    if (!hostMatch) continue;
    // bing.com only counts on chat paths; x.com only on /i/grok.
    if (p.id === 'copilot' && host.includes('bing.com') && !path.includes('chat')) continue;
    if (p.id === 'grok' && host === 'x.com' && !path.includes('/grok')) continue;
    return p.id;
  }

  // User-configured custom AI domains.
  for (const raw of customDomains) {
    const d = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!d) continue;
    if (host === d || host.endsWith('.' + d) || d.endsWith('.' + host)) return 'custom';
  }

  // Non-AI web sources with a "Send to AI" capture flow (Gmail, WhatsApp…).
  for (const src of WEB_SOURCES) {
    if (src.hosts.some((h) => host === h || host.endsWith('.' + h))) return src.id;
  }

  // Generic detection: any page exposing message-like containers.
  const found = GENERIC_SELECTORS.some((sel) => {
    try {
      return doc.querySelectorAll(sel).length >= 2;
    } catch {
      return false;
    }
  });
  if (found) return 'generic';

  // Universal fallback: AI-ish hostnames (.ai / .chat TLDs, chat.* subdomains)
  // or any page exposing a chat-sized input (textarea / contenteditable).
  if (/\.(ai|chat)$/.test(host) || host.startsWith('chat.')) return 'generic';
  if (hasChatInput(doc)) return 'generic';

  return null;
}

/**
 * Collects message elements for a platform spec across the given roots,
 * deduped and capped.
 * @param roots - parent nodes to search (cleaned content roots).
 * @param spec - platform rules (generic spec when platform is "generic").
 * @returns {HTMLElement[]} message elements in DOM order.
 */
function collectElements(roots: ParentNode[], spec: PlatformSpec | null): HTMLElement[] {
  const selectors = spec ? spec.messageSelectors : GENERIC_SELECTORS;
  const seen = new Set<Element>();
  const out: HTMLElement[] = [];
  for (const root of roots) {
    for (const sel of selectors) {
      let nodes: NodeListOf<Element>;
      try {
        nodes = root.querySelectorAll(sel);
      } catch {
        continue;
      }
      for (const n of Array.from(nodes)) {
        if (seen.has(n) || out.length >= MAX_MESSAGES) continue;
        // Skip elements nested inside an already-collected message.
        let nested = false;
        let cur: Element | null = n.parentElement;
        while (cur) {
          if (seen.has(cur)) {
            nested = true;
            break;
          }
          cur = cur.parentElement;
        }
        if (nested) continue;
        seen.add(n);
        out.push(n as HTMLElement);
      }
    }
  }
  return out;
}

/**
 * Guesses whether an element is a user message.
 * @param el - message element.
 * @param spec - platform rules.
 * @returns {boolean} true when the element looks user-authored.
 */
function isUserMessage(el: Element, spec: PlatformSpec | null): boolean {
  const tag = el.tagName.toLowerCase();
  if (spec?.userTags?.includes(tag.toUpperCase())) return true;
  if (spec?.assistantTags?.includes(tag.toUpperCase())) return false;

  const roleAttr = el.getAttribute('data-message-author-role');
  if (roleAttr) return roleAttr.toLowerCase() === 'user';

  const testId = (el.getAttribute('data-testid') ?? '').toLowerCase();
  if (/user|human/.test(testId)) return true;
  if (/assistant|model|bot|response|answer/.test(testId)) return false;

  if (spec) {
    for (const sel of spec.userSelectors) {
      try {
        if (el.matches(sel) || el.querySelector(sel)) return true;
      } catch {
        /* invalid selector — ignore */
      }
    }
    const cls = (el.className && typeof el.className === 'string' ? el.className : '').toLowerCase();
    if (/\buser\b|\bhuman\b/.test(cls)) return true;
    return false;
  }

  // Generic: class/id hints, else assume assistant.
  const sig = `${el.className} ${el.id}`.toLowerCase();
  return /\buser\b|\bhuman\b|\bprompt\b/.test(sig);
}

/**
 * Extracts the full conversation from the current document.
 * @param doc - document to scan (defaults to the live document).
 * @param customDomains - user-configured extra AI hostnames.
 * @returns {Conversation | null} conversation or null when nothing is found.
 */
export function extractConversation(
  doc: Document = document,
  customDomains: string[] = [],
): Conversation | null {
  const url = doc.location?.href ?? '';
  const platform = detectPlatform(url, doc, customDomains);
  if (!platform) return null;

  // Prune UI chrome (nav/login/signup/menu/sidebar) on a clone — the live
  // page is never touched. All text extraction happens inside this scope.
  const scope = cleanedScope(doc);
  const roots = contentRoots(scope);

  // Web sources (Gmail, WhatsApp): scrape the visible thread/email directly.
  const source = WEB_SOURCES.find((s) => s.id === platform);
  if (source) {
    for (const sel of source.selectors) {
      const el = scope.querySelector(sel) as HTMLElement | null;
      const text = (el?.innerText || el?.textContent || '').trim();
      if (text.length >= 20) {
        const clipped = text.slice(0, MAX_RAW);
        return {
          platform,
          messages: [{ role: 'user', text: clipped }],
          rawText: `Captured from ${platform}:\n\n${clipped}`,
        };
      }
    }
    // No thread open — still capture page text so *something* is stored.
    const body = (scope.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (body.length >= 20) {
      const clipped = body.slice(0, MAX_RAW);
      return {
        platform,
        messages: [{ role: 'user', text: clipped }],
        rawText: `Captured from ${platform}:\n\n${clipped}`,
      };
    }
    return null;
  }

  const spec = PLATFORMS.find((p) => p.id === platform) ?? null;
  let elements = collectElements(roots, spec);
  // Message containers may live outside <main> — retry on the full scope.
  if (elements.length === 0 && roots.length > 1) {
    elements = collectElements([scope], spec);
  }
  // On generic pages, a couple of stray "message"-classed nodes are usually
  // noise — prefer the full-page text fallback unless we found a real thread.
  if (!spec && elements.length < 2) elements = [];

  const messages: ChatMessage[] = [];
  for (const el of elements) {
    const text = (el.innerText || el.textContent || '').trim();
    if (text.length < 2) continue;
    messages.push({ role: isUserMessage(el, spec) ? 'user' : 'assistant', text });
  }

  if (messages.length === 0) {
    // Fallback: cleaned whole-page text (UI chrome already pruned).
    const body = (scope.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!body) return null;
    messages.push({ role: 'user', text: body.slice(0, MAX_RAW) });
  } else if (!messages.some((m) => m.role === 'user')) {
    messages[0]!.role = 'user';
  }

  const rawText = messages.map((m) => `${m.role}: ${m.text}`).join('\n\n').slice(0, MAX_RAW);
  return { platform, messages, rawText };
}
