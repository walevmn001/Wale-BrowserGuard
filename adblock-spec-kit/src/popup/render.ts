/**
 * Popup rendering (Phase 2 / 3 / 12).
 *
 * Pure functions that paint an `Elements` set from a `LiveState`. They never
 * touch storage or the network: they only reflect the state the page script
 * read, so the popup stays a one-way view (single source of truth).
 */

import type { PauseState } from '../background/pause';
import { t, type Locale, type MessageKey } from '../shared/i18n';
import { DISPLAY_LABELS } from '../youtube/state/messages';
import type { DisplayState } from '../youtube/state/toggle-state';
import type { Elements, LiveState } from './elements';
import { renderModules, type ModuleView } from './view';
import { mainGroupState, type YtLayerRow } from './yt-layers';

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

/** Chip tone class per display state (see `components.css`). */
function chipTone(state: DisplayState): string {
  switch (state) {
    case 'ENABLED':
      return '';
    case 'INITIALIZING':
    case 'RECONCILING':
      return 'blue';
    case 'WAITING_FOR_REGISTRATION':
    case 'WAITING_FOR_ADAPTER':
      return 'warn';
    case 'ERROR':
      return 'danger';
    default:
      return 'off';
  }
}

/** One layer switch row: label (+ saved note), state chip and a switch. */
function buildYtRow(row: YtLayerRow, locale: Locale): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'row';

  const text = document.createElement('span');
  text.className = 'grow';
  const label = document.createElement('span');
  label.className = 't';
  label.textContent = t(row.labelKey, locale);
  text.append(label);
  if (row.savedNotApplied) {
    const note = document.createElement('span');
    note.className = 'd';
    note.textContent = t('ppYtSavedShort', locale);
    text.append(note);
  }

  const chip = document.createElement('span');
  chip.className = `chip ${chipTone(row.state)}`.trim();
  chip.textContent = DISPLAY_LABELS[row.state];
  chip.title = row.message;

  const toggle = document.createElement('label');
  toggle.className = 'switch';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = row.desired;
  input.dataset['flag'] = row.flag;
  input.setAttribute('aria-label', t(row.labelKey, locale));
  const track = document.createElement('span');
  track.className = 'track';
  toggle.append(input, track);

  wrap.append(text, chip, toggle);
  return wrap;
}

/**
 * Paints the YouTube engine card: the MAIN group's resolved state as a chip,
 * one switch per layer, and the mandatory note. The three MAIN rows read
 * WAITING_FOR_ADAPTER while the flag adapter is not ready (contract §3/§7).
 */
export function renderYtEngine(elements: Elements, locale: Locale, state: LiveState): void {
  const group = mainGroupState(state.ytLayers);
  elements.ytEngineState.className = `chip ${chipTone(group.state)}`.trim();
  elements.ytEngineState.textContent = DISPLAY_LABELS[group.state];
  elements.ytEngineNote.textContent = `${group.message} ${t('ppYtReloadNote', locale)}`;

  elements.ytLayers.replaceChildren();
  for (const row of state.ytLayers) {
    elements.ytLayers.append(buildYtRow(row, locale));
  }
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
  renderYtEngine(elements, state.locale, state);
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
