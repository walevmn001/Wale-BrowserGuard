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
 * T021: injects the cosmetic element-hiding CSS (`content/cosmetic.ts`) into
 * each navigation using the packaged selector data (AC-4.1).
 *
 * No module-level mutable state: the worker can be stopped at any time
 * (Constitution 14); state lives in `chrome.storage`.
 */

import {
  applyCosmetic,
  isCosmeticData,
  COSMETIC_PATHS,
  type CosmeticData,
} from '../content/cosmetic';
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

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(chrome.runtime.getURL(path));
  return response.json() as Promise<unknown>;
}

/**
 * Loads the packaged cosmetic data (T020) and validates its shape before use.
 * Read fresh on each call so the worker keeps no state across restarts.
 */
async function loadCosmeticData(): Promise<CosmeticData> {
  const [generic, domains] = await Promise.all([
    fetchJson(COSMETIC_PATHS.generic),
    fetchJson(COSMETIC_PATHS.domainSpecific),
  ]);
  const candidate = { generic, domains };
  if (!isCosmeticData(candidate)) {
    throw new Error('cosmetic data has an unexpected shape');
  }
  return candidate;
}

async function injectCosmetic(tabId: number, url: string | undefined): Promise<void> {
  try {
    await applyCosmetic(
      {
        loadData: loadCosmeticData,
        insertCss: async (id, css) => {
          await chrome.scripting.insertCSS({ target: { tabId: id }, css });
        },
      },
      tabId,
      url,
    );
  } catch (error) {
    logger.error('failed to inject cosmetic filters', error);
  }
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
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    void pollStats();
  }
  // Hide leftover banners as early as the navigation gives us a URL.
  if (changeInfo.status === 'loading') {
    void injectCosmetic(tabId, changeInfo.url ?? tab.url);
  }
});

applyStoredState();
