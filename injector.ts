/**
 * injector.ts — inserts capsule text into chat inputs.
 *
 * Strategy per editor type:
 *  - <textarea>: native HTMLTextAreaElement value setter + bubbling 'input'
 *    event so framework-controlled inputs (React/Vue) pick it up.
 *  - [contenteditable]: focus → execCommand selectAll → insertText.
 *  - Fallback: navigator.clipboard.writeText + caller shows a toast.
 *
 * Never auto-sends; the user always presses send.
 */

/** Result of an insertion attempt. */
export interface InsertResult {
  ok: boolean;
  /** 'input' when text was placed into the field, 'clipboard' when copied. */
  via: 'input' | 'clipboard' | 'none';
}

const INPUT_SELECTORS = [
  'textarea',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  'div[contenteditable]',
  '[role="textbox"][contenteditable]',
];

/**
 * Finds the most likely chat input element on the page.
 * Prefers visible elements near the bottom of the viewport.
 * @param root - document or subtree to search.
 * @returns {{ el: HTMLElement; kind: 'textarea' | 'contenteditable' } | null}
 */
export function findChatInput(
  root: Document | HTMLElement = document,
): { el: HTMLElement; kind: 'textarea' | 'contenteditable' } | null {
  const candidates: { el: HTMLElement; kind: 'textarea' | 'contenteditable' }[] = [];
  for (const sel of INPUT_SELECTORS) {
    let nodes: NodeListOf<Element>;
    try {
      nodes = root.querySelectorAll(sel);
    } catch {
      continue;
    }
    for (const n of Array.from(nodes)) {
      const el = n as HTMLElement;
      if (el.offsetParent === null && el.getClientRects().length === 0) continue;
      const kind = el.tagName === 'TEXTAREA' ? 'textarea' : 'contenteditable';
      candidates.push({ el, kind });
    }
  }
  if (candidates.length === 0) return null;
  // Prefer the lowest on the page (chat inputs sit at the bottom).
  candidates.sort(
    (a, b) => b.el.getBoundingClientRect().top - a.el.getBoundingClientRect().top,
  );
  return candidates[0]!;
}

/**
 * Writes text into a textarea using the native setter so React-style
 * controlled components observe the change.
 * @param el - textarea element.
 * @param text - text to set.
 */
function setNativeTextareaValue(el: HTMLTextAreaElement, text: string): void {
  const proto = HTMLTextAreaElement.prototype as unknown as Record<string, unknown>;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  const setter = desc?.set as ((this: HTMLTextAreaElement, v: string) => void) | undefined;
  if (setter) setter.call(el, text);
  else el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Dispatches a synthetic ClipboardEvent('paste') carrying the text.
 * Rich editors (ProseMirror/Lexical/React) handle real paste events through
 * their own input pipeline — this is the most compatible insertion path.
 * @param el - focused editable element.
 * @param text - text to "paste".
 * @returns {boolean} true when the event was dispatched.
 */
function dispatchPasteEvent(el: HTMLElement, text: string): boolean {
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    dt.setData('text/html', `<pre>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`);
    const evt = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    el.focus();
    el.dispatchEvent(evt);
    return true;
  } catch {
    return false;
  }
}

/**
 * Inserts text into a contenteditable element.
 * Order: synthetic paste event (editor-native path) → execCommand fallback.
 * @param el - contenteditable element.
 * @param text - text to insert.
 * @returns {boolean} true on success.
 */
function insertContentEditable(el: HTMLElement, text: string): boolean {
  try {
    // 1) Paste event — ProseMirror/React editors treat this as a real paste.
    const before = el.textContent?.length ?? 0;
    if (dispatchPasteEvent(el, text)) {
      const after = el.textContent?.length ?? 0;
      if (after > before + text.length * 0.5) return true; // editor consumed it
    }
    // 2) execCommand fallback.
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel?.removeAllRanges();
    sel?.addRange(range);
    const ok = document.execCommand('insertText', false, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return ok;
  } catch {
    return false;
  }
}

/**
 * Copies text to the clipboard; resolves false when unavailable.
 * @param text - text to copy.
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Inserts the capsule prefix into the page's chat input.
 * Never sends. Falls back to clipboard when injection fails.
 * @param text - full text to insert (prefix + capsule + suffix).
 * @param preferred - optional element to inject into (e.g. the drop target).
 * @returns {Promise<InsertResult>} what happened.
 */
export async function insertIntoChat(
  text: string,
  preferred?: HTMLElement | null,
): Promise<InsertResult> {
  let input = preferred ?? null;
  if (input && !isEditable(input)) input = null;
  const found = input ? null : findChatInput();
  const target = input ?? found?.el ?? null;
  if (!target) {
    const copied = await copyToClipboard(text);
    return { ok: copied, via: copied ? 'clipboard' : 'none' };
  }
  const kind = target.tagName === 'TEXTAREA' ? 'textarea' : 'contenteditable';

  if (kind === 'textarea') {
    try {
      setNativeTextareaValue(target as HTMLTextAreaElement, text);
      return { ok: true, via: 'input' };
    } catch {
      /* fall through */
    }
  } else {
    if (insertContentEditable(target, text)) {
      return { ok: true, via: 'input' };
    }
  }

  const copied = await copyToClipboard(text);
  return { ok: copied, via: copied ? 'clipboard' : 'none' };
}

/**
 * Checks whether an element is one of the recognized chat-input types.
 * @param el - candidate element.
 * @returns {boolean}
 */
function isEditable(el: HTMLElement): boolean {
  if (el.tagName === 'TEXTAREA') return true;
  const ce = el.getAttribute('contenteditable');
  if (ce === 'true' || ce === '') return true;
  return el.getAttribute('role') === 'textbox' && ce !== 'false';
}
