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
import { createSitePreferences } from './site-settings';
import { categoryForRuleset, createStatsCounter } from './stats';
import { createTempException, TEMP_EXCEPTION_ALARM } from './temp-exception';
import { createWhitelist } from './whitelist';
import { createYouTubeModule, isYouTubeHost, type YouTubePhase } from './youtube-module';
import { workerLocale } from './locale';
import { createFingerprintSettings } from './security/fingerprint-settings';
import { createPrivacySettings } from './security/privacy-settings';
import { t } from '../shared/i18n';
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

/** Locale for worker-originated strings (notifications): stored choice or browser. */
async function notify(
  kind: 'filterUpdate' | 'securityBlock' | 'protectionOff' | 'errors',
  bodyKey: 'notifSecurityBody' | 'notifFilterFailBody' | 'notifProtectionOffBody' | 'notifErrorBody',
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
}

function applyStoredState(): void {
  void applyStoredRulesets();
  void applyStoredWhitelist();
  void applyStoredTempExceptions();
  void applyStoredCustomRules();
  void applyStoredReferer();
  void applyStoredPrivacy();
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
 * Runs the opt-in YouTube module. The host is checked synchronously first so a
 * non-YouTube navigation never pays for the storage/config reads, and the
 * module itself is fail-open (a fault must not affect normal blocking). The
 * phase lets Q2 inject early while Q3's CSS waits for a stable document.
 */
function runYouTubeModule(
  tabId: number,
  url: string | undefined,
  phase: YouTubePhase,
): void {
  const host = pageHost(url);
  if (host === undefined || !isYouTubeHost(host)) {
    return;
  }
  void guard('run the YouTube module', () => createYouTubeModule().handleTab(tabId, url, phase));
}

// Injected page components (element picker, security banner) talk to the
// worker through this bridge; it validates and persists what they send.
registerBridge();

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
  // Q2 prunes the player response before YouTube reads it, so the module gets
  // the earliest navigation signal (a `document_start`-like injection) and the
  // `complete` pass as a fallback; the install is idempotent.
  if (changeInfo.status === 'loading') {
    runYouTubeModule(tabId, changeInfo.url ?? tab.url, 'loading');
  }
  if (changeInfo.status === 'complete') {
    void pollStats();
    void injectCosmetic(tabId, tab.url);
    void injectAntiFingerprint(tabId, tab.url);
    void guard('inject the security banner', () => injectBanner(tabId, tab.url));
    runYouTubeModule(tabId, tab.url, 'complete');
  }
});

applyStoredState();
