/**
 * Manifest V3 background service worker entry point.
 *
 * T002: bootstrap. T013: wires the master switch (`ruleset-manager.ts`) so the
 * static rulesets follow the stored `enabled` flag — applied on install/startup
 * and whenever the flag changes, which keeps blocking working after a browser
 * restart without opening the popup (AC-1.4).
 *
 * No module-level mutable state: the worker can be stopped at any time
 * (Constitution 14); state lives in `chrome.storage`.
 */

import { createRulesetManager } from './ruleset-manager';
import { logger } from '../shared/logger';

async function applyStoredRulesets(): Promise<void> {
  try {
    await createRulesetManager().applyStored();
  } catch (error) {
    logger.error('failed to apply the ruleset master switch', error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  logger.info('service worker installed');
  void applyStoredRulesets();
});

chrome.runtime.onStartup.addListener(() => {
  void applyStoredRulesets();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes['enabled'] !== undefined) {
    void applyStoredRulesets();
  }
});

void applyStoredRulesets();
