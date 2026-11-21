/**
 * Element-picker selector validation (Phase 9 §4).
 *
 * Pure and DOM-free, so the exact same gate can run in two places: inside the
 * injected picker (before it lets the user confirm) and in the service worker
 * (before it persists anything) — a selector arriving from a page is untrusted
 * input. A selector is only ever embedded in a `{selector}{display:none
 * !important}` rule that goes to `chrome.scripting.insertCSS`, so anything that
 * could break out of that rule context must never survive the check.
 */

/** Longest selector we accept, to avoid absurd CSS chains. */
export const MAX_SELECTOR_LENGTH = 200;

export type SelectorRejectReason = 'empty' | 'tooLong' | 'invalid' | 'tooBroad';

export type SelectorCheck =
  | { readonly ok: true; readonly selector: string }
  | { readonly ok: false; readonly reason: SelectorRejectReason };

/** Characters with no place in a plain element selector; `{};<>@` and comments
 * would let a value escape the rule context it is embedded in. */
const FORBIDDEN_CHARS = /[{};<>@\\]/;

/** Selectors so broad they would blank the whole page. */
const TOO_BROAD = new Set(['*', 'html', 'body', 'html *', 'body *', '* *', ':root']);

/**
 * Validates a candidate selector. Returns the trimmed selector on success, or a
 * stable reason code the UI maps to a localised explanation.
 */
export function validateSelector(raw: string): SelectorCheck {
  const selector = raw.trim();
  if (selector === '') {
    return { ok: false, reason: 'empty' };
  }
  if (selector.length > MAX_SELECTOR_LENGTH) {
    return { ok: false, reason: 'tooLong' };
  }
  if (FORBIDDEN_CHARS.test(selector) || selector.includes('/*') || selector.includes('*/')) {
    return { ok: false, reason: 'invalid' };
  }
  if (TOO_BROAD.has(selector.toLowerCase())) {
    return { ok: false, reason: 'tooBroad' };
  }
  // Must anchor on a real element/class/id token, not a bare combinator or a
  // dangling list separator.
  if (/^[>+~,\s]/.test(selector) || /[>+~,\s]$/.test(selector)) {
    return { ok: false, reason: 'tooBroad' };
  }
  if (!/[a-z#.[]/i.test(selector)) {
    return { ok: false, reason: 'tooBroad' };
  }
  return { ok: true, selector };
}

/** True when `raw` contains a selector rule we would reject. */
export function selectorRejects(raw: string): boolean {
  return !validateSelector(raw).ok;
}
