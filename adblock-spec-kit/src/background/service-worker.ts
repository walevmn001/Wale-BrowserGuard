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
 * T022: attaches the page-side observer (`content/cosmetic-observer.ts`) so ads
 * injected after load are pinned too (AC-4.2, AC-4.3).
 *
 * T023: arms and reacts to the daily `update-filters` alarm (`filter-updater.ts`)
 * so the filter lists refresh on schedule without ever losing the previous set
 * on failure (AC-7.1, AC-7.2).
 *
 * T024: re-applies the static rulesets when the per-group toggles change
 * (`disabledRuleSets`), so the options page switches individual list groups on
 * and off.
 *
 * T031: applies the temporary malware exceptions (`temp-exception.ts`) the
 * warning page's "continue anyway" publishes, and clears a pass once its alarm
 * fires (AC-5.2, AC-5.3).
 *
 * T035: applies the opt-in WebRTC IP handling policy (`security/privacy-settings.ts`)
 * on startup and whenever the choice changes (AC-6.4).
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
import { installCosmeticObserver, OBSERVER_OPTIONS } from '../content/cosmetic-observer';
import { createFilterUpdater, UPDATE_ALARM } from './filter-updater';
import { createPrivacySettings } from './security/privacy-settings';
import { createRulesetManager } from './ruleset-manager';
import { createStatsCounter } from './stats';
import { createTempException, TEMP_EXCEPTION_ALARM } from './temp-exception';
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

/** Applies the temporary malware exceptions (AC-5.2, AC-5.3). */
async function applyStoredTempExceptions(): Promise<void> {
  try {
    await createTempException().applyStored();
  } catch (error) {
    logger.error('failed to apply the stored temporary exceptions', error);
  }
}

async function pollStats(): Promise<void> {
  try {
    await createStatsCounter().poll();
  } catch (error) {
    logger.error('failed to update blocked-request stats', error);
  }
}

/** Applies the opt-in WebRTC IP handling policy (AC-6.4). */
async function applyStoredPrivacy(): Promise<void> {
  try {
    await createPrivacySettings().applyStored();
  } catch (error) {
    logger.error('failed to apply the WebRTC privacy setting', error);
  }
}

/** Arms the daily filter-update alarm if it is not already scheduled (AC-7.1). */
async function scheduleFilterUpdates(): Promise<void> {
  try {
    await createFilterUpdater().scheduleInitial();
  } catch (error) {
    logger.error('failed to schedule filter updates', error);
  }
}

/** Runs one filter update; failures keep the previous set (AC-7.2). */
async function runFilterUpdate(): Promise<void> {
  try {
    await createFilterUpdater().updateNow();
  } catch (error) {
    logger.error('filter update threw unexpectedly', error);
  }
}

function applyStoredState(): void {
  void applyStoredRulesets();
  void applyStoredWhitelist();
  void applyStoredTempExceptions();
  void pollStats();
  void scheduleFilterUpdates();
  void applyStoredPrivacy();
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
        // T022: pin ads injected after load. The function is serialised, so it
        // ships its own selectors/options as arguments (no shared scope).
        runObserver: async (id, selectors) => {
          await chrome.scripting.executeScript({
            target: { tabId: id },
            func: installCosmeticObserver,
            args: [selectors, OBSERVER_OPTIONS],
          });
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
  if (changes['disabledRuleSets'] !== undefined) {
    void applyStoredRulesets();
  }
  if (changes['whitelist'] !== undefined) {
    void applyStoredWhitelist();
  }
  if (changes['tempExceptions'] !== undefined) {
    void applyStoredTempExceptions();
  }
  if (changes['webrtcProtection'] !== undefined) {
    void applyStoredPrivacy();
  }
});

// T023: the daily alarm drives filter updates; a failure re-arms it with
// backoff (AC-7.1, AC-7.2).
// T031: the temp-exception alarm fires when the earliest pass lapses, so
// `applyStored` prunes it and removes its rule (AC-5.2, AC-5.3).
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UPDATE_ALARM) {
    void runFilterUpdate();
  }
  if (alarm.name === TEMP_EXCEPTION_ALARM) {
    void applyStoredTempExceptions();
  }
});

// A page load is when new requests get blocked; count them once it settles.
// T021/T022: inject the cosmetic CSS and the page-side observer once the
// document is complete. Injecting during the `loading` phase also worked, but
// it woke the worker mid-navigation and pushed the AC-1.3 latency delta past
// its 5ms budget, so the injection is deferred to `complete`.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    void pollStats();
    void injectCosmetic(tabId, tab.url);
  }
});

applyStoredState();
