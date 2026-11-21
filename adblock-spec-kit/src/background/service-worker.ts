/**
 * Manifest V3 background service worker entry point.
 *
 * T002: bootstrap. T013: wires the master switch (`ruleset-manager.ts`) so the
 * static rulesets follow the stored `enabled` flag — applied on install/startup
 * and whenever the flag changes, which keeps blocking working after a browser
 * restart without opening the popup (AC-1.4).
 *
 * T014: wires the per-domain whitelist (`whitelist.ts`) so the stored domains
 * are re-applied on install/startup and whenever the list changes (AC-2.2).
 *
 * T015: polls the local block counter (`stats.ts`) on install/startup and after
 * each page finishes loading, so the totals follow real blocking (AC-3.1).
 *
 * No module-level mutable state: the worker can be stopped at any time
 * (Constitution 14); state lives in `chrome.storage`.
 */

import { createRulesetManager } from './ruleset-manager';
import { createStatsCounter } from './stats';
import { createWhitelist } from './whitelist';
import { logger } from '../shared/logger';

async function applyStoredRulesets(): Promise<void> {
  try {
    await createRulesetManager().applyStored();
  } catch (error) {
    logger.error('failed to apply the ruleset master switch', error);
  }
}

async function applyStoredWhitelist(): Promise<void> {
  try {
    await createWhitelist().applyStored();
  } catch (error) {
    logger.error('failed to apply the stored whitelist', error);
  }
}

async function pollStats(): Promise<void> {
  try {
    await createStatsCounter().poll();
  } catch (error) {
    logger.error('failed to update blocked-request stats', error);
  }
}

function applyStoredState(): void {
  void applyStoredRulesets();
  void applyStoredWhitelist();
  void pollStats();
}

chrome.runtime.onInstalled.addListener(() => {
  logger.info('service worker installed');
  applyStoredState();
});

chrome.runtime.onStartup.addListener(() => {
  applyStoredState();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }
  if (changes['enabled'] !== undefined) {
    void applyStoredRulesets();
  }
  if (changes['whitelist'] !== undefined) {
    void applyStoredWhitelist();
  }
});

// A page load is when new requests get blocked; count them once it settles.
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    void pollStats();
  }
});

applyStoredState();
