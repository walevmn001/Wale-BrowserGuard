/**
 * Security Center (Phase 7): malware blocklist status, the temporary "continue
 * anyway" exceptions and the local URL scanner.
 *
 * Nothing here claims a site is "safe": the blocklist can only say a host is
 * listed, and the scanner only reports suspicious *patterns*. Both run locally
 * and never send the URL anywhere.
 */

import { createFilterUpdater } from '../background/filter-updater';
import { createRulesetManager } from '../background/ruleset-manager';
import { createTempException } from '../background/temp-exception';
import { scanUrl, type ScanResult, type ScanVerdict } from '../background/url-scan';
import { isMessageKey, t } from '../shared/i18n';
import { logger } from '../shared/logger';
import { q } from './elements';
import { formatTimestamp } from './format';
import type { Ctx, Section } from './ui';

const VERDICT_KEY: Record<ScanVerdict, string> = {
  safe: 'scanVerdictSafe',
  suspicious: 'scanVerdictSuspicious',
  dangerous: 'scanVerdictDangerous',
  unknown: 'scanVerdictUnknown',
};

const VERDICT_TONE: Record<ScanVerdict, string> = {
  safe: 'blue',
  suspicious: 'warn',
  dangerous: 'danger',
  unknown: 'off',
};

/** Renders the scanner result inside `#scan-output` without any innerHTML. */
function renderScan(output: HTMLElement, result: ScanResult, locale: Ctx['locale']): void {
  output.replaceChildren();
  output.hidden = false;

  const head = document.createElement('div');
  head.className = 'row';
  const verdict = document.createElement('span');
  verdict.className = 'strong';
  const key = VERDICT_KEY[result.verdict];
  verdict.textContent = isMessageKey(key) ? t(key, locale) : result.verdict;
  const chip = document.createElement('span');
  chip.className = `chip ${VERDICT_TONE[result.verdict]}`;
  chip.textContent = result.host === '' ? t('gUnknown', locale) : result.host;
  head.append(verdict, chip);
  output.append(head);

  if (result.findings.length === 0) {
    const none = document.createElement('p');
    none.className = 'small muted';
    none.textContent = t('scanNoFindings', locale);
    output.append(none);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'list';
  for (const finding of result.findings) {
    const item = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = `dot ${finding.severity === 'danger' ? 'danger' : 'warn'}`;
    const text = document.createElement('span');
    text.className = 'grow';
    const textKey = `scanF${finding.id}`;
    text.textContent = isMessageKey(textKey) ? t(textKey, locale) : finding.id;
    item.append(dot, text);
    list.append(item);
  }
  output.append(list);
}

export function createSecurity(ctx: Ctx): Section {
  const malware = q<HTMLInputElement>('sec-malware');
  const db = q('sec-db');
  const dbUpdate = q<HTMLButtonElement>('sec-db-update');
  const tempList = q('sec-temp-list');
  const tempEmpty = q('sec-temp-empty');
  const scanInput = q<HTMLInputElement>('scan-input');
  const scanOutput = q('scan-output');

  async function refreshDb(): Promise<void> {
    const status = await createFilterUpdater().status();
    const info = status.groups['malware'];
    db.textContent =
      info === undefined
        ? t('optionsNeverUpdated', ctx.locale)
        : `${t('secRules', ctx.locale, { count: info.rules })} · ${formatTimestamp(status.updatedAt, ctx.locale)}`;
  }

  async function refreshTemp(): Promise<void> {
    const stored = await createTempException().stored();
    const hosts = Object.keys(stored).sort();
    tempList.replaceChildren();
    tempEmpty.hidden = hosts.length > 0;
    for (const host of hosts) {
      const expiry = stored[host];
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'grow truncate';
      name.textContent = host;
      const chip = document.createElement('span');
      chip.className = 'chip off';
      chip.textContent = expiry === undefined ? '' : new Date(expiry).toLocaleTimeString(ctx.locale);
      item.append(name, chip);
      tempList.append(item);
    }
  }

  async function runDbUpdate(): Promise<void> {
    dbUpdate.disabled = true;
    try {
      await createFilterUpdater().updateNow();
      await refreshDb();
    } catch (error) {
      logger.error('security db update failed', error);
    } finally {
      dbUpdate.disabled = false;
    }
  }

  async function refresh(): Promise<void> {
    malware.checked = await createRulesetManager().isGroupEnabled('malware');
    await refreshDb();
    await refreshTemp();
  }

  malware.addEventListener('change', () => {
    void createRulesetManager()
      .setGroupEnabled('malware', malware.checked)
      .catch((error: unknown) => logger.error('malware toggle failed', error));
  });

  dbUpdate.addEventListener('click', () => {
    void runDbUpdate();
  });

  q('sec-temp-clear').addEventListener('click', () => {
    void ctx.storage
      .set('tempExceptions', {})
      .then(refreshTemp)
      .catch((error: unknown) => logger.error('clear temp exceptions failed', error));
  });

  q('scan-run').addEventListener('click', () => {
    const raw = scanInput.value.trim();
    if (raw === '') {
      ctx.toast(t('scanInvalid', ctx.locale), 'err');
      return;
    }
    renderScan(scanOutput, scanUrl(raw), ctx.locale);
  });

  return { refresh };
}
