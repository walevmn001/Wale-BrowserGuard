/**
 * Popup rendering (Phase 2 / 3 / 12).
 *
 * Pure functions that paint an `Elements` set from a `LiveState`. They never
 * touch storage or the network: they only reflect the state the page script
 * read, so the popup stays a one-way view (single source of truth).
 */

import type { PauseState } from '../background/pause';
import { t, type Locale, type MessageKey } from '../shared/i18n';
import type { Elements, LiveState } from './elements';
import { renderModules, type ModuleView } from './view';

function statusKey(masterEnabled: boolean, paused: boolean, failures: number): MessageKey {
  if (paused) return 'statusPaused';
  if (!masterEnabled) return 'statusOff';
  if (failures > 0) return 'statusAttention';
  return 'statusProtected';
}

export function renderStatus(elements: Elements, locale: Locale, state: LiveState): void {
  const paused = state.paused.paused;
  elements.guardStatus.textContent = t(statusKey(state.masterEnabled, paused, state.failures), locale);
  elements.masterStatus.textContent = t(state.masterEnabled ? 'masterOn' : 'masterOff', locale);

  const [tone, mark] = !state.masterEnabled
    ? ['off', 'M4 4 20 20M20 4 4 20']
    : paused || state.failures > 0
      ? ['warn', 'M12 8v4M12 16h.01']
      : ['on', 'm9 12 2 2 4-4'];
  elements.statusIco.className = `ico${tone === 'on' ? '' : ` ${tone}`}`;
  const path = elements.statusIco.querySelector<SVGPathElement>('#status-ico-mark');
  if (path !== null) {
    path.setAttribute('d', mark);
  }
  elements.masterToggle.setAttribute('aria-checked', String(state.masterEnabled));
}

/** `HH:MM` in the user's own timezone, for the pause chip. */
export function formatClock(until: number): string {
  const date = new Date(until);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function renderPause(elements: Elements, locale: Locale, state: PauseState): void {
  if (!state.paused) {
    elements.pauseBar.classList.add('hidden');
    return;
  }
  elements.pauseBar.classList.remove('hidden');
  elements.pauseState.textContent =
    state.until === null
      ? t('statusPaused', locale)
      : t('ppPausedUntil', locale, { time: formatClock(state.until) });
}

export function renderSite(elements: Elements, locale: Locale, state: LiveState): void {
  if (state.domain === undefined) {
    elements.siteDomain.textContent = t('siteNotApplicable', locale);
    elements.siteStatus.textContent = '';
    elements.siteToggle.disabled = true;
    elements.siteToggle.setAttribute('aria-pressed', 'false');
    return;
  }
  elements.siteDomain.textContent = state.domain;
  elements.siteStatus.textContent = t(state.blocking ? 'siteBlockingOn' : 'siteBlockingOff', locale);
  elements.siteToggle.disabled = false;
  elements.siteToggle.setAttribute('aria-pressed', String(state.blocking));
}

export function renderStats(elements: Elements, state: LiveState): void {
  elements.statsSite.textContent = String(state.siteCount);
  elements.statsTotal.textContent = String(state.total);
  elements.statsToday.textContent = String(state.today);
}

/** The six protection modules and whether each is effectively on right now. */
function modulesFor(state: LiveState): readonly ModuleView[] {
  const on = state.masterEnabled && !state.paused.paused;
  const disabled = new Set(state.disabled);
  return [
    { id: 'ads', label: 'modAds', on: on && !disabled.has('ads'), section: 'filters' },
    { id: 'trackers', label: 'modTrackers', on: on && !disabled.has('trackers'), section: 'filters' },
    { id: 'cosmetic', label: 'modCosmetic', on: on && !state.cosmeticOff, section: 'privacy' },
    { id: 'web', label: 'modWeb', on: on && !disabled.has('malware'), section: 'security' },
    { id: 'https', label: 'modHttps', on: on && !disabled.has('privacy'), section: 'privacy' },
    { id: 'url', label: 'modUrl', on: on && !disabled.has('privacy'), section: 'privacy' },
  ];
}

export function renderModuleList(
  elements: Elements,
  state: LiveState,
  onOpen: (section: string) => void,
): void {
  renderModules(elements.modules, modulesFor(state), state.locale, onOpen);
}

/** Paints the whole popup from `state`. */
export function render(
  elements: Elements,
  state: LiveState,
  onOpen: (section: string) => void,
): void {
  renderStatus(elements, state.locale, state);
  renderSite(elements, state.locale, state);
  renderPause(elements, state.locale, state.paused);
  renderStats(elements, state);
  renderModuleList(elements, state, onOpen);
  elements.fingerprintSite.disabled = state.domain === undefined;
  elements.fingerprintSite.checked = state.domain !== undefined && state.fingerprintOn;
  elements.actionScan.disabled = state.url === undefined;
}

/** Banner tone for a scan verdict. */
export function bannerTone(verdict: string): string {
  switch (verdict) {
    case 'dangerous':
      return 'danger';
    case 'suspicious':
      return 'warn';
    case 'safe':
      return 'ok';
    default:
      return 'info';
  }
}
