/**
 * Manifest V3 background service worker entry point.
 *
 * Bootstraps every background module and keeps their stored state applied to the
 * browser. Original wiring (T013–T036) plus the WALE GUARD expansion:
 *  - protection pause (`pause.ts`), profiles (`profiles.ts`)
 *  - activity log (`activity.ts`) fed from the same `getMatchedRules` batch
 *  - custom rules (`custom-rules.ts`), referer policy (`referer.ts`)
 *  - per-site cosmetic preferences + hidden selectors (`site-settings.ts`)
 *  - notifications (`notifications.ts`) and keyboard commands
 *
 * No module-level mutable state: the worker can be stopped at any time
 * (Constitution 14); state lives in `chrome.storage`.
 */

import { installAntiFingerprint } from '../content/anti-fingerprint';
import {
  applyCosmetic,
  createCosmeticDataCache,
  isCosmeticData,
  pageHost,
  COSMETIC_PATHS,
} from '../content/cosmetic';
import { installCosmeticObserver, OBSERVER_OPTIONS } from '../content/cosmetic-observer';
import { createActivityLog } from './activity';
import { injectBanner, registerBridge } from './content-bridge';
import { createCustomRules } from './custom-rules';
import { createFilterUpdater, UPDATE_ALARM } from './filter-updater';
import { createNotifications } from './notifications';
import { createProtectionPause, PAUSE_ALARM } from './pause';
import { createRefererSettings } from './referer';
import { createRulesetManager } from './ruleset-manager';
import { createSettingsSync, isSyncedKey } from './settings-sync';
import { createSitePreferences } from './site-settings';
import { categoryForRuleset, createStatsCounter } from './stats';
import { createTempException, TEMP_EXCEPTION_ALARM } from './temp-exception';
import { createWhitelist } from './whitelist';
import { createYouTubeConfigUpdater } from './youtube-config-updater';
import { isYouTubeHost, loadEffectiveYouTubeConfig } from './youtube-module';
import { createHealthStorage, recordHealthFault } from './youtube-health';
import { createYouTubeModuleSettings } from './youtube-settings';
import { createChromeScriptingApi, syncEngineRegistration } from '../youtube/isolated/registration';
import { workerLocale } from './locale';
import { createFingerprintSettings } from './security/fingerprint-settings';
import { createPrivacySettings } from './security/privacy-settings';
import { t } from '../shared/i18n';
import { YOUTUBE_RULESET_ID } from '../shared/constants';
import { isYouTubeFaultMessage } from '../shared/messages';
import { logger } from '../shared/logger';

async function guard(label: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    logger.error(`failed to ${label}`, error);
  }
}

const applyStoredRulesets = (): Promise<void> =>
  guard('apply the ruleset master switch', () => createRulesetManager().applyStored());
const applyStoredWhitelist = (): Promise<void> =>
  guard('apply the stored whitelist', () => createWhitelist().applyStored());
const applyStoredTempExceptions = (): Promise<void> =>
  guard('apply the stored temporary exceptions', () => createTempException().applyStored());
const applyStoredPrivacy = (): Promise<void> =>
  guard('apply the WebRTC privacy setting', () => createPrivacySettings().applyStored());
const applyStoredReferer = (): Promise<void> =>
  guard('apply the referer policy', () => createRefererSettings().applyStored());
const applyStoredCustomRules = (): Promise<void> =>
  guard('apply the custom rules', () => createCustomRules().applyStored());

/**
 * Keeps the module-owned `youtube` ruleset (Q1) in step with the module switch.
 * It is enabled only when the user opted in *and* the effective config still
 * allows the module — so the Q6 kill-switch (`enabled:false`), and a stored
 * config that fails to validate, keep Q1 off. The master switch never touches
 * this ruleset (AC-15.1), so this is the only place that turns Q1 on.
 */
const applyYouTubeModuleRuleSet = (): Promise<void> =>
  guard('apply the YouTube module ruleset', async () => {
    const on =
      (await createYouTubeModuleSettings().isEnabled()) &&
      (await loadEffectiveYouTubeConfig())?.enabled === true;
    await chrome.declarativeNetRequest.updateEnabledRulesets(
      on ? { enableRulesetIds: [YOUTUBE_RULESET_ID] } : { disableRulesetIds: [YOUTUBE_RULESET_ID] },
    );
  });

/** Locale for worker-originated strings (notifications): stored choice or browser. */
async function notify(
  kind: 'filterUpdate' | 'securityBlock' | 'protectionOff' | 'errors',
  bodyKey:
    | 'notifSecurityBody'
    | 'notifFilterFailBody'
    | 'notifProtectionOffBody'
    | 'notifErrorBody'
    | 'notifYoutubeQ2OffBody'
    | 'notifYoutubeOffBody'
    | 'notifSyncTooLargeBody',
): Promise<void> {
  const locale = await workerLocale();
  await createNotifications().notify({
    kind,
    title: t('notifTitle', locale),
    message: t(bodyKey, locale),
  });
}

/** Resolves the page host for a tab, or `''` when it cannot be read. */
async function resolveHost(tabId: number): Promise<string> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return pageHost(tab.url) ?? '';
  } catch {
    return '';
  }
}

/** Builds local activity records from a matched-rules batch (Phase 4). */
async function recordActivity(
  fresh: readonly chrome.declarativeNetRequest.MatchedRuleInfo[],
): Promise<void> {
  const hosts = new Map<number, string>();
  for (const info of fresh) {
    if (!hosts.has(info.tabId)) {
      hosts.set(info.tabId, await resolveHost(info.tabId));
    }
  }
  const entries = [...fresh]
    .sort((a, b) => b.timeStamp - a.timeStamp)
    .map((info) => ({
      host: hosts.get(info.tabId) ?? '',
      category: categoryForRuleset(info.rule.rulesetId),
      rulesetId: info.rule.rulesetId,
      ruleId: info.rule.ruleId,
      tabId: info.tabId,
      timeStamp: info.timeStamp,
    }));
  await createActivityLog().record(entries);
  if (entries.some((entry) => entry.category === 'malware')) {
    await guard('raise the security notification', () => notify('securityBlock', 'notifSecurityBody'));
  }
}

async function pollStats(): Promise<void> {
  await guard('update blocked-request stats', () =>
    createStatsCounter(recordActivity).poll(),
  );
}

async function scheduleFilterUpdates(): Promise<void> {
  await guard('schedule filter updates', () => createFilterUpdater().scheduleInitial());
}

/** Runs one filter update; failures keep the previous set and may notify (AC-7.2). */
async function runFilterUpdate(): Promise<void> {
  await guard('run the filter update', async () => {
    const result = await createFilterUpdater().updateNow();
    if (!result.ok) {
      await notify('filterUpdate', 'notifFilterFailBody');
    }
  });
  // Q6 rides the same cadence: a newer, valid config replaces the active one
  // atomically (and a remote `enabled:false` is the kill-switch). Kept in its
  // own guard so a YouTube fault can never affect the core filter update.
  await runYouTubeConfigUpdate();
}

/** Runs one YouTube config refresh (Q6); a stale or corrupt download is a no-op. */
async function runYouTubeConfigUpdate(): Promise<void> {
  await guard('update the YouTube config', async () => {
    await createYouTubeConfigUpdater().updateNow();
  });
}

/**
 * Publishes local configuration to `chrome.storage.sync` (AC-16.2). A no-op
 * while sync is off; if the payload overflows the sync quota the push is
 * refused and the user is told rather than fed a silent partial write.
 */
async function publishSettingsToSync(now: number): Promise<void> {
  await guard('publish settings to sync', async () => {
    const result = await createSettingsSync().push(now);
    if (!result.ok && result.reason === 'too-large') {
      await notify('errors', 'notifSyncTooLargeBody');
    }
  });
}

function applyStoredState(): void {
  void applyStoredRulesets();
  void applyStoredWhitelist();
  void applyStoredTempExceptions();
  void applyStoredCustomRules();
  void applyStoredReferer();
  void applyStoredPrivacy();
  void applyYouTubeModuleRuleSet();
  void applyYouTubeEngineRegistration();
  void pollStats();
  void scheduleFilterUpdates();
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(chrome.runtime.getURL(path));
  return response.json() as Promise<unknown>;
}

const loadCosmeticData = createCosmeticDataCache(async () => {
  const [generic, domains] = await Promise.all([
    fetchJson(COSMETIC_PATHS.generic),
    fetchJson(COSMETIC_PATHS.domainSpecific),
  ]);
  const candidate = { generic, domains };
  if (!isCosmeticData(candidate)) {
    throw new Error('cosmetic data has an unexpected shape');
  }
  return candidate;
});

/**
 * Injects cosmetic hiding on the `complete` pass only. An earlier injection at
 * `status: 'loading'` (B3) woke the service worker mid-navigation and pushed
 * AC-1.3 over budget (B5, echoing T025); a single ready-DOM pass keeps latency
 * green — the stylesheet hides in-DOM ads and the observer catches late ones.
 */
async function injectCosmetic(tabId: number, url: string | undefined): Promise<void> {
  await guard('inject cosmetic filters', async () => {
    const host = pageHost(url);
    const prefs = createSitePreferences();
    const site = host === undefined ? {} : await prefs.get(host);
    const extraSelectors = host === undefined ? [] : await prefs.hidden(host);
    await applyCosmetic(
      {
        loadData: loadCosmeticData,
        insertCss: async (id, css) => {
          await chrome.scripting.insertCSS({ target: { tabId: id }, css });
        },
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
      { extraSelectors, enabled: site.cosmeticOff !== true },
    );
  });
}

async function injectAntiFingerprint(tabId: number, url: string | undefined): Promise<void> {
  await guard('inject anti-fingerprinting', async () => {
    const host = pageHost(url);
    if (host === undefined || !(await createFingerprintSettings().appliesTo(host))) {
      return;
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: installAntiFingerprint,
      injectImmediately: true,
    });
  });
}

/**
 * Keeps the rebuilt YouTube engine's content-script registration in step with
 * the module switch (AC-15.1) and the effective config (the Q6 kill-switch).
 * This is the activation seam: the engine's MAIN and ISOLATED scripts are
 * registered dynamically — main.ts runs the json-pruner/fetch/xhr hooks, the
 * ad-control module and the runtime modules, and the ISOLATED bridge publishes
 * the flag snapshot (T004). Registering dynamically (not in the manifest) is
 * what lets the module be turned off without a reload. Fail-open: the seam
 * returns a result and never throws, so a scripting fault cannot take down the
 * worker.
 */
const applyYouTubeEngineRegistration = (): Promise<void> =>
  guard('apply the YouTube engine registration', async () => {
    const on =
      (await createYouTubeModuleSettings().isEnabled()) &&
      (await loadEffectiveYouTubeConfig())?.enabled === true;
    await syncEngineRegistration(createChromeScriptingApi(), on);
  });

/**
 * Q5 (US-15.4): records a playback fault the page-side monitor reported and
 * degrades the module for the session when it crosses the threshold (two faults
 * in five minutes drop Q2; a fault after that turns the module off). The host is
 * derived from the sender tab, never trusted from the payload.
 */
function registerYouTubeHealth(): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isYouTubeFaultMessage(message)) {
      return false;
    }
    const host = pageHost(sender.tab?.url);
    if (host === undefined || !isYouTubeHost(host)) {
      sendResponse({ ok: false });
      return false;
    }
    void (async () => {
      try {
        const { degrade } = await recordHealthFault(createHealthStorage(), Date.now());
        if (degrade === 'q2') {
          await notify('errors', 'notifYoutubeQ2OffBody');
        } else if (degrade === 'module') {
          await notify('errors', 'notifYoutubeOffBody');
        }
      } catch (error) {
        logger.error('failed to record a YouTube health fault', error);
      } finally {
        sendResponse({ ok: true });
      }
    })();
    return true;
  });
}

// Injected page components (element picker, security banner) talk to the
// worker through this bridge; it validates and persists what they send.
registerBridge();

// The YouTube health monitor reports playback faults the same way.
registerYouTubeHealth();

/** Keyboard commands (Phase 9 §10); the browser owns the shortcut bindings. */
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-protection') {
    void guard('toggle protection', async () => {
      const manager = createRulesetManager();
      await manager.setEnabled(!(await manager.isEnabled()));
    });
  }
  if (command === 'pause-protection') {
    void guard('pause protection', () => createProtectionPause().pause(null));
  }
  if (command === 'open-activity') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/options/index.html#activity') });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  logger.info('service worker installed');
  applyStoredState();
});

chrome.runtime.onStartup.addListener(() => {
  applyStoredState();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  // Settings sync (AC-16.2): a remote change applies the newer groups locally;
  // a local change to any synced key publishes them. Both no-op when sync is off.
  if (areaName === 'sync') {
    void guard('apply synced settings', () => createSettingsSync().pull());
    return;
  }
  if (areaName !== 'local') {
    return;
  }
  if (changes['enabled'] !== undefined || changes['disabledRuleSets'] !== undefined) {
    void applyStoredRulesets();
    if (changes['enabled']?.newValue === false) {
      void notify('protectionOff', 'notifProtectionOffBody');
    }
  }
  if (changes['pausedUntil'] !== undefined) {
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
  if (changes['refererPolicy'] !== undefined) {
    void applyStoredReferer();
  }
  if (changes['customRules'] !== undefined) {
    void applyStoredCustomRules();
  }
  if (changes['youtubeModule'] !== undefined) {
    void applyYouTubeModuleRuleSet();
    void applyYouTubeEngineRegistration();
  }
  if (Object.keys(changes).some(isSyncedKey)) {
    void publishSettingsToSync(Date.now());
  }
});

// `update-filters` drives the daily refresh (AC-7.1/7.2); `pause-expired` resumes
// protection; `temp-exception` prunes a lapsed malware pass (AC-5.2/5.3).
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UPDATE_ALARM) {
    void runFilterUpdate();
  }
  if (alarm.name === PAUSE_ALARM) {
    void applyStoredRulesets();
  }
  if (alarm.name === TEMP_EXCEPTION_ALARM) {
    void applyStoredTempExceptions();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // The rebuilt engine is a dynamically-registered content script, so Chrome
  // re-injects it at `document_start` on every YouTube navigation — there is no
  // per-tab injection to schedule here (the old executeScript path is retired).
  if (changeInfo.status === 'complete') {
    void pollStats();
    void injectCosmetic(tabId, tab.url);
    void injectAntiFingerprint(tabId, tab.url);
    void guard('inject the security banner', () => injectBanner(tabId, tab.url));
  }
});

applyStoredState();
