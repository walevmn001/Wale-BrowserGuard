/**
 * Diagnostics (Phase 9 §7): a copy-pasteable report of version, engine state,
 * modules and permissions.
 *
 * The report is built from already-available facts only and contains no
 * browsing history or personal URLs; it is assembled locally and can be copied
 * or exported as a text file.
 */

import { buildDiagnostics, type ModuleStatus } from '../background/diagnostics';
import { createFilterUpdater } from '../background/filter-updater';
import { createRulesetManager } from '../background/ruleset-manager';
import { t } from '../shared/i18n';
import { logger } from '../shared/logger';
import { q } from './elements';
import { groupLabel } from './format';
import { download, type Ctx, type Section } from './ui';

export function createDiagnostics(ctx: Ctx): Section {
  const report = q('diag-report');
  let text = '';

  async function build(): Promise<string> {
    const rulesets = createRulesetManager();
    const disabled = await rulesets.disabledGroups();
    const enabled = await chrome.declarativeNetRequest.getEnabledRulesets();
    const status = await createFilterUpdater().status();
    const all = await chrome.storage.local.get(null);
    const bytes = new TextEncoder().encode(JSON.stringify(all)).length;
    const modules: ModuleStatus[] = rulesets.listGroups().map((id) => ({
      id,
      label: groupLabel(id, ctx.locale),
      on: !disabled.includes(id),
    }));
    const manifest = chrome.runtime.getManifest();
    return buildDiagnostics({
      version: manifest.version,
      browser: navigator.userAgent,
      enabledRuleSets: enabled,
      disabledRuleSets: disabled,
      lastUpdate: status.updatedAt ?? null,
      storageBytes: bytes,
      modules,
      permissions: manifest.permissions ?? [],
      errors: [],
    });
  }

  async function refresh(): Promise<void> {
    text = await build();
    report.textContent = text;
  }

  q('diag-copy').addEventListener('click', () => {
    void navigator.clipboard
      .writeText(text)
      .then(() => ctx.toast(t('gCopied', ctx.locale), 'ok'))
      .catch((error: unknown) => logger.error('copy diagnostics failed', error));
  });
  q('diag-export').addEventListener('click', () => {
    download('wale-guard-diagnostics.txt', text, 'text/plain');
  });

  return { refresh };
}
