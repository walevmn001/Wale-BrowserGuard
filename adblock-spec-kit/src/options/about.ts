/**
 * About (Phase 10): version, packaged rule totals and the project links.
 *
 * `#version-ext` and `#version-data` keep the strings the options tests assert
 * on. Links open the public repository; the privacy note is shown in a dialog
 * so no external document is required.
 */

import { createFilterUpdater } from '../background/filter-updater';
import { t } from '../shared/i18n';
import { logger } from '../shared/logger';
import { q } from './elements';
import { summarizeGroups } from './format';
import type { Ctx, Section } from './ui';

const REPO_URL = 'https://github.com/walevmn001/Wale-BrowserGuard';

export function createAbout(ctx: Ctx): Section {
  const versionExt = q('version-ext');
  const versionData = q('version-data');

  async function refresh(): Promise<void> {
    versionExt.textContent = t('abtVersion', ctx.locale, {
      version: chrome.runtime.getManifest().version,
    });
    const { groups } = await createFilterUpdater().status();
    const totals = summarizeGroups(groups);
    versionData.textContent = t('optionsDataRules', ctx.locale, {
      rules: totals.rules,
      groups: totals.groups,
    });
  }

  q('abt-privacy').addEventListener('click', () => {
    void ctx
      .confirm(t('abtPrivacy', ctx.locale), t('abtPrivacyBody', ctx.locale), t('gClose', ctx.locale))
      .catch((error: unknown) => logger.error('privacy dialog failed', error));
  });
  q('abt-changelog').addEventListener('click', () => {
    void chrome.tabs.create({ url: `${REPO_URL}/releases` }).catch(() => undefined);
  });
  q('abt-support').addEventListener('click', () => {
    void chrome.tabs.create({ url: `${REPO_URL}/issues` }).catch(() => undefined);
  });

  return { refresh };
}
