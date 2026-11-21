/**
 * Non-injected configuration for the element picker (Phase 9 §4).
 *
 * The picker itself runs via `chrome.scripting.executeScript`, which serialises
 * only the function with `Function.prototype.toString()` — so it cannot import
 * anything at runtime. Everything it needs therefore arrives as an argument:
 * the labels, the selector limit, and this stylesheet (`PickerOptions.styles`).
 *
 * Colours are literal on purpose: inside a page the design-token custom
 * properties can be redefined by the host, so the injected UI pins its own
 * palette. These are the same values as `shared/ui/design-tokens.css`.
 */

/** Localised strings the worker fills in; the picker hardcodes no language. */
export interface PickerLabels {
  readonly title: string;
  readonly hint: string;
  readonly confirm: string;
  readonly undo: string;
  readonly cancel: string;
  readonly hidden: string;
  /** Reason code (`empty`/`tooLong`/`invalid`/`tooBroad`/`noHost`/`failed`→text). */
  readonly reasons: Readonly<Record<string, string>>;
}

export interface PickerOptions {
  readonly labels: PickerLabels;
  /** Mirrors the worker's limit so an over-long selector is rejected up front. */
  readonly maxLength: number;
  /** The picker's stylesheet; passed in because an import would not survive. */
  readonly styles: string;
}

export const PICKER_STYLES = [
  ':host{all:initial}',
  '[data-role="overlay"]{position:fixed;box-sizing:border-box;border:2px solid #2DD4BF;',
  'background:rgba(45,212,191,.14);border-radius:8px;pointer-events:none}',
  '[data-role="overlay"][data-reject="true"]{border-color:#EF4444;background:rgba(239,68,68,.14)}',
  '[data-role="label"]{position:fixed;max-width:236px;overflow:hidden;text-overflow:ellipsis;',
  'white-space:nowrap;padding:3px 8px;border-radius:6px;pointer-events:none;',
  'background:#0F172A;color:#fff;font:600 11px/1.4 ui-monospace,Menlo,Consolas,monospace}',
  '[data-role="label"][data-reject="true"]{background:#EF4444}',
  '[data-role="bar"]{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);',
  'display:flex;align-items:center;gap:8px;max-width:92vw;pointer-events:auto;',
  'padding:8px 10px;border-radius:14px;background:#fff;border:1px solid #E2E8F0;',
  'box-shadow:0 12px 40px rgba(15,23,42,.16);color:#0F172A;',
  'font:500 13px/1.4 "Inter","Geist",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
  '[data-role="bar"][hidden]{display:none}',
  '[data-role="status"]{color:#64748B;max-width:38vw;overflow:hidden;text-overflow:ellipsis;',
  'white-space:nowrap;margin:0 2px}',
  '[data-role="bar"] button{font:inherit;font-weight:650;cursor:pointer;border-radius:10px;',
  'padding:7px 12px;border:1px solid #E2E8F0;background:#fff;color:#0F172A}',
  '[data-role="bar"] button[data-variant="primary"]{background:#2DD4BF;',
  'border-color:#14B8A6;color:#06231C}',
  '[data-role="bar"] button:disabled{opacity:.55;cursor:default}',
  '[data-role="bar"] button:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(45,212,191,.35)}',
].join('');
