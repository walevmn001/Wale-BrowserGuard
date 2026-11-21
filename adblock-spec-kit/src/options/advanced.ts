/**
 * Advanced options (P6, optional — US-16): today the installed-extension scan
 * (AC-16.1); settings sync (AC-16.2) is added on the same page in T081.
 *
 * Nothing runs on its own: the scan needs the optional `management` permission,
 * which is requested only when the user presses "Scan" (a real user gesture, so
 * `chrome.permissions.request` is valid). The result is a read-only list — the
 * page never disables or removes another extension.
 */

import { scanExtensions, type ExtensionRisk, type ManagementApi, type RiskReason } from '../background/ext-scan';
import { t, type Locale } from '../shared/i18n';
import { logger } from '../shared/logger';
import { q } from './elements';
import type { Ctx, Section } from './ui';

/** The optional permission the scan needs, requested on demand. */
const MANAGEMENT: chrome.permissions.Permissions = { permissions: ['management'] };

/** Human label for one scoring reason (permission names stay as-is). */
function reasonLabel(reason: RiskReason, locale: Locale): string {
  switch (reason.kind) {
    case 'permission':
      return t('extReasonPermission', locale, { name: reason.permission });
    case 'broadHosts':
      return t('extReasonBroadHosts', locale);
    case 'unpacked':
      return t('extReasonUnpacked', locale);
    case 'noUpdate':
      return t('extReasonNoUpdate', locale);
  }
}

/** Tone of the score chip: 0 = none, <60 = attention, else high risk. */
function tone(score: number): string {
  if (score <= 0) {
    return 'off';
  }
  return score >= 60 ? 'danger' : 'warn';
}

/** Renders the scan result into `#ext-scan-out` without any `innerHTML`. */
function renderScan(out: HTMLElement, risks: readonly ExtensionRisk[], locale: Locale): void {
  out.replaceChildren();
  out.hidden = false;

  if (risks.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'small muted';
    empty.textContent = t('extScanEmpty', locale);
    out.append(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'list';
  for (const risk of risks) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'grow truncate';
    name.textContent = risk.name === '' ? risk.id : risk.name;
    const chip = document.createElement('span');
    chip.className = `chip ${tone(risk.score)}`;
    chip.textContent = String(risk.score);
    item.append(name, chip);
    list.append(item);

    if (risk.reasons.length > 0) {
      const detail = document.createElement('div');
      detail.className = 'small muted';
      detail.textContent = risk.reasons.map((reason) => reasonLabel(reason, locale)).join(' · ');
      list.append(detail);
    }
  }
  out.append(list);
}

export function createAdvanced(ctx: Ctx): Section {
  const button = q<HTMLButtonElement>('ext-scan-btn');
  const output = q('ext-scan-out');

  async function scan(): Promise<void> {
    // Requested first (still inside the click gesture) — a stale `contains`
    // await could drop the user-gesture Chrome requires for the prompt.
    const granted = await chrome.permissions.request(MANAGEMENT);
    if (!granted) {
      ctx.toast(t('extScanDenied', ctx.locale), 'warn');
      return;
    }
    const risks = await scanExtensions(chrome.management as ManagementApi, chrome.runtime.id);
    renderScan(output, risks, ctx.locale);
  }

  button.addEventListener('click', () => {
    button.disabled = true;
    void scan()
      .catch((error: unknown) => {
        logger.error('extension scan failed', error);
        ctx.toast(t('gError', ctx.locale), 'err');
      })
      .finally(() => {
        button.disabled = false;
      });
  });

  /** The panel is filled on demand, so a re-paint has nothing to refresh. */
  function refresh(): Promise<void> {
    return Promise.resolve();
  }

  return { refresh };
}
