/**
 * In-page security banner — Phase 7 (UI/UX spec §4.4).
 *
 * A thin, non-blocking strip the worker drops at the very top of a page that
 * looks risky: an insecure `http:` page with a password field, or a host whose
 * name shows impersonation signs. It is rendered **inside a Shadow DOM** so the
 * page's CSS cannot restyle it and it cannot restyle the page (AC-UI-7); the
 * host element's own layout uses `!important` against hostile `div`/`*` rules.
 *
 * `installWarningBanner` runs via `chrome.scripting.executeScript`, which
 * serialises the function with `Function.prototype.toString()`, so every helper
 * is declared inside it and it uses only its parameters plus page globals. It
 * speaks the worker protocol with the literal `'wg:trust-site'` (kept in sync by
 * `tests/unit/messages.test.ts`).
 */

import type { BannerReason } from '../shared/messages';

/** Localised strings the worker fills in; the banner hardcodes no language. */
export interface BannerLabels {
  readonly heading: string;
  readonly body: string;
  readonly trust: string;
  readonly close: string;
}

export interface BannerOptions {
  readonly reason: BannerReason;
  readonly labels: BannerLabels;
  /** For `'insecure'`: only show when the page actually has a password field. */
  readonly requirePasswordField: boolean;
}

export function installWarningBanner(options: BannerOptions): void {
  // NOTE: serialised via `Function.prototype.toString()` — params + page globals only.
  const TRUST_SITE = 'wg:trust-site';
  const scope = window as unknown as Record<string, unknown>;
  if (scope['__waleGuardBanner'] === true) {
    return;
  }
  // The plain-http warning should only bother the user when a password field is
  // genuinely at risk; otherwise every http page would nag.
  if (options.requirePasswordField && document.querySelector('input[type="password"]') === null) {
    return;
  }
  scope['__waleGuardBanner'] = true;

  const host = document.createElement('div');
  host.id = 'wale-guard-banner';
  host.style.setProperty('all', 'initial', 'important');
  host.style.setProperty('position', 'fixed', 'important');
  host.style.setProperty('top', '0', 'important');
  host.style.setProperty('left', '0', 'important');
  host.style.setProperty('right', '0', 'important');
  host.style.setProperty('z-index', '2147483647', 'important');
  host.style.setProperty('pointer-events', 'auto', 'important');
  host.style.setProperty('display', 'block', 'important');

  const style = document.createElement('style');
  style.textContent = [
    ':host{all:initial}',
    '[data-role="bar"]{box-sizing:border-box;display:flex;align-items:center;gap:10px;',
    'padding:9px 14px;background:#FFFBEB;color:#B45309;border-bottom:2px solid #F59E0B;',
    'font:500 13px/1.45 "Inter","Geist",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
    'flex-wrap:wrap}',
    '[data-role="ic"]{flex:none;display:grid;place-items:center;width:20px;height:20px}',
    '[data-role="text"]{flex:1 1 220px;min-width:0}',
    '[data-role="text"] b{display:block;font-weight:700;color:#92400E}',
    '[data-role="act"]{display:flex;gap:6px;margin-left:auto}',
    '[data-role="bar"] button{font:inherit;font-weight:650;cursor:pointer;border-radius:10px;',
    'padding:6px 11px;border:1px solid #FCD34D;background:#FFFFFF;color:#92400E}',
    '[data-role="bar"] button[data-act="trust"]{background:#2DD4BF;border-color:#14B8A6;color:#06231C}',
    '[data-role="bar"] button[data-act="close"]{border-color:transparent;background:transparent;',
    'font-size:16px;line-height:1;padding:4px 8px;color:#B45309}',
    '[data-role="bar"] button:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(45,212,191,.35)}',
  ].join('');

  const bar = document.createElement('div');
  bar.setAttribute('data-role', 'bar');
  bar.setAttribute('role', 'alert');
  bar.setAttribute('data-reason', options.reason);

  const icon = document.createElement('span');
  icon.setAttribute('data-role', 'ic');
  icon.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z');
  svg.append(path);
  icon.append(svg);

  const text = document.createElement('div');
  text.setAttribute('data-role', 'text');
  const heading = document.createElement('b');
  heading.textContent = options.labels.heading;
  const body = document.createElement('span');
  body.textContent = options.labels.body;
  text.append(heading, body);

  const act = document.createElement('div');
  act.setAttribute('data-role', 'act');
  const trust = document.createElement('button');
  trust.type = 'button';
  trust.setAttribute('data-act', 'trust');
  trust.textContent = options.labels.trust;
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.setAttribute('data-act', 'close');
  closeButton.setAttribute('aria-label', options.labels.close);
  closeButton.textContent = '×';
  act.append(trust, closeButton);

  bar.append(icon, text, act);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(style, bar);
  document.documentElement.append(host);

  function remove(): void {
    host.remove();
    scope['__waleGuardBanner'] = undefined;
  }

  trust.addEventListener('click', () => {
    const runtime = (globalThis as unknown as { chrome?: { runtime?: unknown } }).chrome?.runtime as
      | { sendMessage?: (message: unknown) => Promise<unknown> }
      | undefined;
    const send = runtime?.sendMessage?.bind(runtime);
    remove();
    if (send !== undefined) {
      void send({ type: TRUST_SITE }).catch(() => undefined);
    }
  });

  closeButton.addEventListener('click', remove);
}
