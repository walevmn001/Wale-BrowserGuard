/**
 * Overview section (Phase 2): protection status, the real master switch, the
 * temporary pause control, real locally-stored statistics and the module
 * summary. Every value is read from the same modules the worker/popup use.
 */

import { createFilterUpdater } from '../background/filter-updater';
import { createProtectionPause, PAUSE_OPTIONS } from '../background/pause';
import { createProfiles } from '../background/profiles';
import { createRulesetManager } from '../background/ruleset-manager';
import { createStatsCounter } from '../background/stats';
import { t, type MessageKey } from '../shared/i18n';
import { logger } from '../shared/logger';
import { q } from './elements';
import { profileKey, statusKey } from './format';
import { clock, type Ctx, type Section } from './ui';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICONS: Record<string, readonly string[]> = {
  ads: ['m3 11 18-5v12L3 14v-3z', 'M11.6 16.8a3 3 0 1 1-5.8-1.6'],
  trackers: ['M9.88 9.88a3 3 0 1 0 4.24 4.24', 'M2 2l20 20'],
  cosmetic: ['M3 4h18v16H3z', 'M3 9h18'],
  web: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M12 8v4', 'M12 16h.01'],
  https: ['M6 11V7a6 6 0 0 1 12 0v4', 'M5 11h14v9H5z'],
  url: ['M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7', 'M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'],
};

/** The six protection modules and the ruleset group / section each maps to. */
interface ModuleDef {
  readonly id: string;
  readonly label: MessageKey;
  readonly group: string | null;
  readonly section: string;
}

const MODULES: readonly ModuleDef[] = [
  { id: 'ads', label: 'modAds', group: 'ads', section: 'filters' },
  { id: 'trackers', label: 'modTrackers', group: 'trackers', section: 'filters' },
  { id: 'cosmetic', label: 'modCosmetic', group: null, section: 'privacy' },
  { id: 'web', label: 'modWeb', group: 'malware', section: 'security' },
  { id: 'https', label: 'modHttps', group: 'privacy', section: 'privacy' },
  { id: 'url', label: 'modUrl', group: 'privacy', section: 'privacy' },
];

function icon(paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export function createOverview(ctx: Ctx): Section {
  const statusText = q('ov-status-text');
  const profileChip = q('ov-profile-chip');
  const master = q<HTMLInputElement>('ov-master');
  const pauseState = q('ov-pause-state');
  const pauseSelect = q<HTMLSelectElement>('ov-pause-select');
  const pauseResume = q<HTMLButtonElement>('ov-pause-resume');
  const statAds = q('ov-stat-ads');
  const statTrackers = q('ov-stat-trackers');
  const statMalware = q('ov-stat-malware');
  const statToday = q('ov-stat-today');
  const modules = q('ov-modules');

  async function renderPause(): Promise<void> {
    const state = await createProtectionPause().state();
    pauseState.textContent = state.paused
      ? state.until === null
        ? t('statusPaused', ctx.locale)
        : t('ppPausedUntil', ctx.locale, { time: clock(state.until) })
      : t('statusProtected', ctx.locale);
  }

  function renderModules(disabled: ReadonlySet<string>, on: boolean): void {
    modules.replaceChildren();
    for (const def of MODULES) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'module';
      row.dataset['module'] = def.id;
      const box = document.createElement('span');
      const active = on && (def.group === null || !disabled.has(def.group));
      box.className = active ? 'ic' : 'ic off';
      box.append(icon(ICONS[def.id] ?? []));
      const name = document.createElement('span');
      name.className = 'grow';
      name.style.textAlign = 'left';
      name.textContent = t(def.label, ctx.locale);
      const state = document.createElement('span');
      state.className = 'small muted';
      state.textContent = t(active ? 'gEnabled' : 'gDisabled', ctx.locale);
      row.append(box, name, state);
      row.addEventListener('click', () => ctx.open(def.section));
      modules.append(row);
    }
  }

  async function refresh(): Promise<void> {
    const rulesets = createRulesetManager();
    const masterEnabled = await rulesets.isEnabled();
    const storedOn = (await ctx.storage.get('enabled')) ?? true;
    const disabled = new Set(await rulesets.disabledGroups());
    const paused = (await createProtectionPause().state()).paused;
    const failures = (await createFilterUpdater().status()).failures;

    statusText.textContent = t(statusKey(storedOn, paused, failures), ctx.locale);
    profileChip.textContent = t(profileKey(await createProfiles().current()), ctx.locale);
    profileChip.className = 'chip';
    master.checked = storedOn;

    await renderPause();
    const active = masterEnabled && !paused;
    renderModules(disabled, active);

    const totals = await createStatsCounter().categoryTotals();
    statAds.textContent = String(totals['ads'] ?? 0);
    statTrackers.textContent = String(totals['trackers'] ?? 0);
    statMalware.textContent = String(totals['malware'] ?? 0);
    statToday.textContent = String(await createStatsCounter().todayTotal());
  }

  master.addEventListener('change', () => {
    void createRulesetManager()
      .setEnabled(master.checked)
      .then(refresh)
      .catch((error: unknown) => logger.error('master toggle failed', error));
  });

  pauseSelect.addEventListener('change', () => {
    const value = pauseSelect.value;
    pauseSelect.value = '';
    if (value !== 'manual' && value !== 'five' && value !== 'fifteen' && value !== 'thirty') {
      return;
    }
    void createProtectionPause()
      .pause(value === 'manual' ? null : PAUSE_OPTIONS[value])
      .then(() => refresh())
      .catch((error: unknown) => logger.error('pause failed', error));
  });

  pauseResume.addEventListener('click', () => {
    void createProtectionPause()
      .resume()
      .then(() => refresh())
      .catch((error: unknown) => logger.error('resume failed', error));
  });

  q('ov-open-activity').addEventListener('click', () => ctx.open('activity'));
  q('ov-open-filters').addEventListener('click', () => ctx.open('filters'));
  q('ov-open-settings').addEventListener('click', () => ctx.open('settings'));

  // Keep the countdown fresh while the dashboard is open.
  setInterval(() => void renderPause().catch(() => undefined), 1000);

  return { refresh };
}
