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
 * Inserts text into a contenteditable element via execCommand.
 * @param el - contenteditable element.
 * @param text - text to insert.
 * @returns {boolean} true on success.
 */
function insertContentEditable(el: HTMLElement, text: string): boolean {
  try {
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
 * @returns {Promise<InsertResult>} what happened.
 */
export async function insertIntoChat(text: string): Promise<InsertResult> {
  const input = findChatInput();
  if (!input) {
    const copied = await copyToClipboard(text);
    return { ok: copied, via: copied ? 'clipboard' : 'none' };
  }

  if (input.kind === 'textarea') {
    try {
      setNativeTextareaValue(input.el as HTMLTextAreaElement, text);
      return { ok: true, via: 'input' };
    } catch {
      /* fall through */
    }
  } else {
    if (insertContentEditable(input.el, text)) {
      return { ok: true, via: 'input' };
    }
  }

  const copied = await copyToClipboard(text);
  return { ok: copied, via: copied ? 'clipboard' : 'none' };
}
