/**
 * Popup controller (Phase 2 / 3 / 9 — the compact WALE GUARD panel).
 *
 * Wires the DOM (see `elements.ts` / `render.ts`) to the very modules the
 * worker uses, so there is a single source of truth: `Whitelist` (per-site
 * on/off), `StatsCounter` (blocked counts), `RulesetManager` (master switch +
 * groups), `ProtectionPause` (temporary pause), `SitePreferences` (per-site
 * cosmetic), `FilterUpdater` (failures) and the local `scanUrl` heuristic.
 * Nothing is cached in a module variable.
 *
 * It acts on the tab that was active when it opened, resolved once. Counts are
 * read, never written: the worker is the only writer of the counters.
 *
 * Every user-facing string comes from `shared/i18n`, in Vietnamese or English.
 */

import { createFingerprintSettings } from '../background/security/fingerprint-settings';
import { createFilterUpdater } from '../background/filter-updater';
import { createProtectionPause, PAUSE_OPTIONS } from '../background/pause';
import { createRulesetManager } from '../background/ruleset-manager';
import { createSitePreferences } from '../background/site-settings';
import { createStatsCounter } from '../background/stats';
import { createWhitelist } from '../background/whitelist';
import { scanUrl } from '../background/url-scan';
import { isMessageKey, t, type MessageKey } from '../shared/i18n';
import { logger } from '../shared/logger';
import { MSG_START_PICKER } from '../shared/messages';
import { TypedStorage } from '../shared/storage';
import { adapterStateOf } from '../youtube/adapter/adapter';
import { NullAdapter } from '../youtube/adapter/null-adapter';
import type { FlagName } from '../youtube/config/flags';
import { createYouTubeEngineSettings } from '../youtube/isolated/settings';
import {
  applyStaticText,
  applyTheme,
  collectElements,
  popupLocale,
  type Elements,
  type LiveState,
} from './elements';
import {
  bannerTone,
  render,
  renderModuleList,
  renderPause,
  renderSite,
  renderStats,
  renderStatus,
  renderYtEngine,
} from './render';
import { domainFromUrl } from './url';
import { findingKey, verdictKey } from './view';
import { buildYtLayers } from './yt-layers';

/** Reads every piece of state from its owning module in one pass. */
async function loadState(storage: TypedStorage): Promise<LiveState> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const domain = domainFromUrl(tab?.url);
  const locale = await popupLocale(storage);
  const masterEnabled = (await storage.get('enabled')) ?? true;
  const paused = await createProtectionPause().state();
  const blocking = domain === undefined ? false : !(await createWhitelist().isAllowed(domain));
  const site = domain === undefined ? {} : await createSitePreferences().get(domain);
  const fingerprintOn =
    domain === undefined ? false : await createFingerprintSettings().isSiteEnabled(domain);
  const counter = createStatsCounter();
  const tabId = tab?.id;
  const siteCount = tabId === undefined ? 0 : await counter.forTab(tabId);
  const { total } = await counter.snapshot();
  // The engine ships with a NullAdapter, so the three MAIN layers can only ever
  // read WAITING_FOR_ADAPTER — a saved "off" is never shown as applied (T004).
  const engine = createYouTubeEngineSettings();
  const ytLayers = buildYtLayers(
    await engine.desiredFlags(),
    adapterStateOf(new NullAdapter().status()),
    'MISSING',
  );
  return {
    locale,
    domain,
    tabId,
    url: tab?.url,
    masterEnabled,
    paused,
    blocking,
    fingerprintOn,
    cosmeticOff: site.cosmeticOff === true,
    siteCount,
    total,
    today: await counter.todayTotal(),
    failures: (await createFilterUpdater().status()).failures,
    disabled: await createRulesetManager().disabledGroups(),
    ytLayers,
  };
}

/** Opens a dashboard section (options page) in a new tab and closes the popup. */
function openSection(section: string): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL(`src/options/index.html#${section}`) });
  window.close();
}

/** AC-2.1: toggles blocking on the current site by (un)whitelisting its host. */
async function toggleSite(elements: Elements, state: LiveState): Promise<void> {
  if (state.domain === undefined) {
    return;
  }
  const whitelist = createWhitelist();
  const allowed = await whitelist.isAllowed(state.domain);
  await whitelist.setEnabled(state.domain, !allowed);
  renderSite(elements, state.locale, { ...state, blocking: !(await whitelist.isAllowed(state.domain)) });
}

/** AC-2.3: turns the whole extension off (or back on) in one action. */
async function toggleMaster(elements: Elements, state: LiveState): Promise<void> {
  const next = !state.masterEnabled;
  await createRulesetManager().setEnabled(next);
  render(elements, { ...state, masterEnabled: next }, openSection);
}

/** Re-renders the parts that depend on the pause state. */
function renderPaused(elements: Elements, state: LiveState, paused: LiveState['paused']): void {
  const updated = { ...state, paused };
  renderStatus(elements, state.locale, updated);
  renderPause(elements, state.locale, paused);
  renderModuleList(elements, updated, openSection);
}

/** Phase 9 §2: pauses (or resumes) protection for the chosen duration. */
async function changePause(elements: Elements, state: LiveState): Promise<void> {
  const value = elements.pauseSelect.value;
  elements.pauseSelect.value = '';
  if (value !== 'manual' && value !== 'five' && value !== 'fifteen' && value !== 'thirty') {
    return;
  }
  const pause = createProtectionPause();
  await pause.pause(value === 'manual' ? null : PAUSE_OPTIONS[value]);
  renderPaused(elements, state, await pause.state());
}

async function resume(elements: Elements, state: LiveState): Promise<void> {
  const pause = createProtectionPause();
  await pause.resume();
  renderPaused(elements, state, await pause.state());
}

/** AC-3.2: clears the counters (cursor kept, so nothing is recounted). */
async function clearStats(elements: Elements, state: LiveState): Promise<void> {
  await createStatsCounter().reset();
  renderStats(elements, { ...state, siteCount: 0, total: 0, today: 0 });
}

/** Phase 2 quick action: locally analyse the current page URL (no network). */
function scanCurrent(elements: Elements, state: LiveState): void {
  if (state.url === undefined) {
    return;
  }
  const result = scanUrl(state.url);
  const details = result.findings
    .map((finding) => findingKey(finding.id))
    .filter((key): key is MessageKey => key !== undefined && isMessageKey(key))
    .map((key) => t(key, state.locale));
  const body = details.length === 0 ? t('scanNoFindings', state.locale) : details.join(' · ');
  elements.scanResult.textContent = `${t(verdictKey(result.verdict), state.locale)} — ${body}`;
  elements.scanResult.className = `banner span2 ${bannerTone(result.verdict)}`;
}

/**
 * AC-6.5: the per-page anti-fingerprinting switch. Unchecking adds the host to
 * the off list the worker consults before injecting.
 */
async function toggleFingerprintSite(elements: Elements, state: LiveState): Promise<void> {
  if (state.domain === undefined) {
    return;
  }
  await createFingerprintSettings().setSiteEnabled(state.domain, elements.fingerprintSite.checked);
}

/**
 * Phase 9 §4: asks the worker to open the element picker on the current tab,
 * then closes the popup so the page is visible to pick on.
 */
function startPicker(state: LiveState): void {
  if (state.tabId === undefined) {
    return;
  }
  void chrome.runtime.sendMessage({ type: MSG_START_PICKER, tabId: state.tabId }).catch(reportError);
  window.close();
}

function reportError(error: unknown): void {
  logger.error('popup action failed', error);
}

/**
 * Saves one YouTube engine layer choice and re-paints the card. The three MAIN
 * layers keep showing WAITING_FOR_ADAPTER: the switch stores the desire, but the
 * contract forbids claiming it was applied before the adapter confirms (§5.1).
 */
async function toggleYtLayer(
  elements: Elements,
  state: LiveState,
  input: HTMLInputElement,
): Promise<void> {
  const flag = input.dataset['flag'] as FlagName | undefined;
  if (flag === undefined) {
    return;
  }
  const engine = createYouTubeEngineSettings();
  await engine.setFlag(flag, input.checked);
  const ytLayers = buildYtLayers(
    await engine.desiredFlags(),
    adapterStateOf(new NullAdapter().status()),
    'MISSING',
  );
  renderYtEngine(elements, state.locale, { ...state, ytLayers });
}

function wireActions(elements: Elements, state: LiveState): void {
  elements.siteToggle.addEventListener('click', () => {
    void toggleSite(elements, state).catch(reportError);
  });
  elements.masterToggle.addEventListener('click', () => {
    void toggleMaster(elements, state).catch(reportError);
  });
  elements.pauseSelect.addEventListener('change', () => {
    void changePause(elements, state).catch(reportError);
  });
  elements.pauseResume.addEventListener('click', () => {
    void resume(elements, state).catch(reportError);
  });
  elements.statsClear.addEventListener('click', () => {
    void clearStats(elements, state).catch(reportError);
  });
  elements.fingerprintSite.addEventListener('change', () => {
    void toggleFingerprintSite(elements, state).catch(reportError);
  });
  elements.ytLayers.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      void toggleYtLayer(elements, state, target).catch(reportError);
    }
  });
  elements.actionScan.addEventListener('click', () => scanCurrent(elements, state));
  elements.actionPick.addEventListener('click', () => startPicker(state));
  elements.openActivity.addEventListener('click', () => openSection('activity'));
  elements.openDashboard.addEventListener('click', () => openSection('overview'));
  elements.openSettings.addEventListener('click', () => openSection('settings'));
}

/** Keeps the "paused until HH:MM" chip counting down while the popup is open. */
function startPauseTicker(elements: Elements, locale: LiveState['locale']): void {
  const timer = setInterval(() => {
    void createProtectionPause()
      .state()
      .then((paused) => renderPause(elements, locale, paused))
      .catch(reportError);
  }, 1000);
  window.addEventListener('unload', () => clearInterval(timer));
}

async function main(): Promise<void> {
  const storage = new TypedStorage();
  await applyTheme(storage);
  const state = await loadState(storage);
  document.documentElement.lang = state.locale;
  applyStaticText(state.locale);

  const elements = collectElements();
  render(elements, state, openSection);
  wireActions(elements, state);
  startPauseTicker(elements, state.locale);
}

void main().catch(reportError);
