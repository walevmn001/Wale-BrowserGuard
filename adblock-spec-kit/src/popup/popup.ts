/**
 * Popup UI (T016, US-2 / US-3; localisation added in T017).
 *
 * The popup is a thin view over the modules the worker also uses, so there is a
 * single source of truth: `Whitelist` (per-site on/off), `StatsCounter` (blocked
 * counts) and `RulesetManager` (master switch) all read and write
 * `chrome.storage`. Nothing is cached in a module variable.
 *
 * It acts on the tab that was active when it opened, resolved once: a later
 * focus change (such as clicking a button) must not retarget it. It only reads
 * the block counts the worker has already gathered: the worker is the single
 * writer of the counters, so a match is never counted twice by two contexts.
 *
 * Every user-facing string comes from `shared/i18n.ts`, chosen from the browser
 * UI language, so the popup ships in Vietnamese and English.
 */

import { createRulesetManager } from '../background/ruleset-manager';
import { createFingerprintSettings } from '../background/security/fingerprint-settings';
import { createStatsCounter } from '../background/stats';
import { createWhitelist } from '../background/whitelist';
import { isMessageKey, resolveLocale, t, type Locale } from '../shared/i18n';
import { logger } from '../shared/logger';
import { domainFromUrl } from './url';

/** Popup elements, looked up once at start-up. */
interface Elements {
  readonly siteDomain: HTMLElement;
  readonly siteStatus: HTMLElement;
  readonly siteToggle: HTMLButtonElement;
  readonly fingerprintSite: HTMLInputElement;
  readonly statsSite: HTMLElement;
  readonly statsTotal: HTMLElement;
  readonly statsClear: HTMLButtonElement;
  readonly masterStatus: HTMLElement;
  readonly masterToggle: HTMLButtonElement;
}

/** The tab the popup acts on. */
interface TargetTab {
  readonly id: number | undefined;
  readonly domain: string | undefined;
}

function elementById(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`popup: missing #${id}`);
  }
  return element;
}

function buttonById(id: string): HTMLButtonElement {
  const element = elementById(id);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`popup: #${id} is not a button`);
  }
  return element;
}

function inputById(id: string): HTMLInputElement {
  const element = elementById(id);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`popup: #${id} is not an input`);
  }
  return element;
}

function collectElements(): Elements {
  return {
    siteDomain: elementById('site-domain'),
    siteStatus: elementById('site-status'),
    siteToggle: buttonById('site-toggle'),
    fingerprintSite: inputById('fingerprint-site'),
    statsSite: elementById('stats-site'),
    statsTotal: elementById('stats-total'),
    statsClear: buttonById('stats-clear'),
    masterStatus: elementById('master-status'),
    masterToggle: buttonById('master-toggle'),
  };
}

/** Fills the static labels declared with `data-i18n` in `index.html`. */
function applyStaticText(locale: Locale): void {
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset['i18n'];
    if (key !== undefined && isMessageKey(key)) {
      element.textContent = t(key, locale);
    }
  }
}

/** The active tab of the window that opened the popup. */
async function resolveTargetTab(): Promise<TargetTab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return { id: tab?.id, domain: domainFromUrl(tab?.url) };
}

function renderSite(
  elements: Elements,
  locale: Locale,
  domain: string | undefined,
  blocking: boolean,
): void {
  if (domain === undefined) {
    elements.siteDomain.textContent = t('siteNotApplicable', locale);
    elements.siteStatus.textContent = '';
    elements.siteToggle.disabled = true;
    elements.siteToggle.setAttribute('aria-pressed', 'false');
    return;
  }
  elements.siteDomain.textContent = domain;
  elements.siteStatus.textContent = t(blocking ? 'siteBlockingOn' : 'siteBlockingOff', locale);
  elements.siteToggle.disabled = false;
  elements.siteToggle.setAttribute('aria-pressed', String(blocking));
}

/** AC-6.5: reflects the per-page anti-fingerprinting switch for `domain`. */
function renderFingerprint(
  elements: Elements,
  domain: string | undefined,
  enabled: boolean,
): void {
  elements.fingerprintSite.disabled = domain === undefined;
  elements.fingerprintSite.checked = domain !== undefined && enabled;
}

function renderStats(elements: Elements, locale: Locale, siteCount: number, total: number): void {
  elements.statsSite.textContent = t('statsSite', locale, { count: siteCount });
  elements.statsTotal.textContent = t('statsTotal', locale, { count: total });
}

function renderMaster(elements: Elements, locale: Locale, enabled: boolean): void {
  elements.masterStatus.textContent = t(enabled ? 'masterOn' : 'masterOff', locale);
  elements.masterToggle.textContent = t(enabled ? 'masterToggleOff' : 'masterToggleOn', locale);
}

async function readStats(tabId: number | undefined): Promise<{ site: number; total: number }> {
  const counter = createStatsCounter();
  const site = tabId === undefined ? 0 : await counter.forTab(tabId);
  const { total } = await counter.snapshot();
  return { site, total };
}

/**
 * Shows the counts the worker has already gathered. The popup does not poll
 * itself: only the worker writes the counters (stats.ts serialises its polls),
 * so a match can never be counted by two contexts at once.
 */
async function loadStats(
  elements: Elements,
  locale: Locale,
  tabId: number | undefined,
): Promise<void> {
  const { site, total } = await readStats(tabId);
  renderStats(elements, locale, site, total);
}

/** AC-3.2: clears the counters (the cursor is kept, so nothing is recounted). */
async function clearStats(
  elements: Elements,
  locale: Locale,
  tabId: number | undefined,
): Promise<void> {
  await createStatsCounter().reset();
  const { site, total } = await readStats(tabId);
  renderStats(elements, locale, site, total);
}

/** AC-2.1: toggles blocking on the current site by (un)whitelisting its host. */
async function toggleSite(
  elements: Elements,
  locale: Locale,
  domain: string | undefined,
): Promise<void> {
  if (domain === undefined) {
    return;
  }
  const whitelist = createWhitelist();
  const allowed = await whitelist.isAllowed(domain);
  await whitelist.setEnabled(domain, !allowed);
  renderSite(elements, locale, domain, !(await whitelist.isAllowed(domain)));
}

/** AC-2.3: turns the whole extension off (or back on) in one action. */
async function toggleMaster(elements: Elements, locale: Locale): Promise<void> {
  const rulesets = createRulesetManager();
  const enabled = await rulesets.isEnabled();
  await rulesets.setEnabled(!enabled);
  renderMaster(elements, locale, !enabled);
}

/**
 * AC-6.5: the per-page quick switch. Unchecking adds the host to the off list
 * the worker consults before injecting anti-fingerprinting.
 */
async function toggleFingerprintSite(elements: Elements, domain: string | undefined): Promise<void> {
  if (domain === undefined) {
    return;
  }
  await createFingerprintSettings().setSiteEnabled(domain, elements.fingerprintSite.checked);
}

function reportError(error: unknown): void {
  logger.error('popup action failed', error);
}

async function main(): Promise<void> {
  const locale = resolveLocale(chrome.i18n.getUILanguage());
  document.documentElement.lang = locale;
  applyStaticText(locale);

  const elements = collectElements();
  const target = await resolveTargetTab();

  const whitelist = createWhitelist();
  const blocking =
    target.domain === undefined ? false : !(await whitelist.isAllowed(target.domain));
  const fingerprints = createFingerprintSettings();
  const fingerprintSite =
    target.domain === undefined ? false : await fingerprints.isSiteEnabled(target.domain);

  renderSite(elements, locale, target.domain, blocking);
  renderFingerprint(elements, target.domain, fingerprintSite);
  renderMaster(elements, locale, await createRulesetManager().isEnabled());
  await loadStats(elements, locale, target.id);

  elements.siteToggle.addEventListener('click', () => {
    void toggleSite(elements, locale, target.domain).catch(reportError);
  });
  elements.fingerprintSite.addEventListener('change', () => {
    void toggleFingerprintSite(elements, target.domain).catch(reportError);
  });
  elements.statsClear.addEventListener('click', () => {
    void clearStats(elements, locale, target.id).catch(reportError);
  });
  elements.masterToggle.addEventListener('click', () => {
    void toggleMaster(elements, locale).catch(reportError);
  });
}

void main().catch(reportError);
