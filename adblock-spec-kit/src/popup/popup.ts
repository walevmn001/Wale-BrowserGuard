/**
 * Popup UI (T016, US-2 / US-3).
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
 * Strings are hard-coded in Vietnamese for now; T017 adds vi/en localisation.
 */

import { createRulesetManager } from '../background/ruleset-manager';
import { createStatsCounter } from '../background/stats';
import { createWhitelist } from '../background/whitelist';
import { logger } from '../shared/logger';
import { domainFromUrl } from './url';

/** Popup elements, looked up once at start-up. */
interface Elements {
  readonly siteDomain: HTMLElement;
  readonly siteStatus: HTMLElement;
  readonly siteToggle: HTMLButtonElement;
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

function collectElements(): Elements {
  return {
    siteDomain: elementById('site-domain'),
    siteStatus: elementById('site-status'),
    siteToggle: buttonById('site-toggle'),
    statsSite: elementById('stats-site'),
    statsTotal: elementById('stats-total'),
    statsClear: buttonById('stats-clear'),
    masterStatus: elementById('master-status'),
    masterToggle: buttonById('master-toggle'),
  };
}

/** The active tab of the window that opened the popup. */
async function resolveTargetTab(): Promise<TargetTab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return { id: tab?.id, domain: domainFromUrl(tab?.url) };
}

function renderSite(elements: Elements, domain: string | undefined, blocking: boolean): void {
  if (domain === undefined) {
    elements.siteDomain.textContent = 'Không áp dụng cho trang này';
    elements.siteStatus.textContent = '';
    elements.siteToggle.disabled = true;
    elements.siteToggle.setAttribute('aria-pressed', 'false');
    return;
  }
  elements.siteDomain.textContent = domain;
  elements.siteStatus.textContent = blocking
    ? 'Đang chặn trên trang này'
    : 'Đã tắt chặn trên trang này';
  elements.siteToggle.disabled = false;
  elements.siteToggle.setAttribute('aria-pressed', String(blocking));
}

function renderStats(elements: Elements, siteCount: number, total: number): void {
  elements.statsSite.textContent = `Trang này: ${siteCount} request đã chặn`;
  elements.statsTotal.textContent = `Tổng cộng: ${total}`;
}

function renderMaster(elements: Elements, enabled: boolean): void {
  elements.masterStatus.textContent = enabled ? 'Extension đang bật' : 'Extension đang tắt';
  elements.masterToggle.textContent = enabled ? 'Tắt toàn bộ' : 'Bật lại';
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
async function loadStats(elements: Elements, tabId: number | undefined): Promise<void> {
  const { site, total } = await readStats(tabId);
  renderStats(elements, site, total);
}

/** AC-3.2: clears the counters (the cursor is kept, so nothing is recounted). */
async function clearStats(elements: Elements, tabId: number | undefined): Promise<void> {
  await createStatsCounter().reset();
  const { site, total } = await readStats(tabId);
  renderStats(elements, site, total);
}

/** AC-2.1: toggles blocking on the current site by (un)whitelisting its host. */
async function toggleSite(elements: Elements, domain: string | undefined): Promise<void> {
  if (domain === undefined) {
    return;
  }
  const whitelist = createWhitelist();
  const allowed = await whitelist.isAllowed(domain);
  await whitelist.setEnabled(domain, !allowed);
  renderSite(elements, domain, !(await whitelist.isAllowed(domain)));
}

/** AC-2.3: turns the whole extension off (or back on) in one action. */
async function toggleMaster(elements: Elements): Promise<void> {
  const rulesets = createRulesetManager();
  const enabled = await rulesets.isEnabled();
  await rulesets.setEnabled(!enabled);
  renderMaster(elements, !enabled);
}

function reportError(error: unknown): void {
  logger.error('popup action failed', error);
}

async function main(): Promise<void> {
  const elements = collectElements();
  const target = await resolveTargetTab();

  const whitelist = createWhitelist();
  const blocking =
    target.domain === undefined ? false : !(await whitelist.isAllowed(target.domain));

  renderSite(elements, target.domain, blocking);
  renderMaster(elements, await createRulesetManager().isEnabled());
  await loadStats(elements, target.id);

  elements.siteToggle.addEventListener('click', () => {
    void toggleSite(elements, target.domain).catch(reportError);
  });
  elements.statsClear.addEventListener('click', () => {
    void clearStats(elements, target.id).catch(reportError);
  });
  elements.masterToggle.addEventListener('click', () => {
    void toggleMaster(elements).catch(reportError);
  });
}

void main().catch(reportError);
