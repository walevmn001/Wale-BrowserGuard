/**
 * Options page (T024, US-7 / AC-7.1, AC-7.2).
 *
 * A thin view over the modules the worker and popup also use, so there is a
 * single source of truth: `RulesetManager` (per-group on/off) and
 * `FilterUpdater` (manual update + version/status read from `chrome.storage`).
 * Nothing is cached in a module variable.
 *
 * Every user-facing string comes from `shared/i18n.ts`, chosen from the browser
 * UI language, so the page ships in Vietnamese and English.
 */

import { createFilterUpdater, type FilterUpdater } from '../background/filter-updater';
import { createRulesetManager } from '../background/ruleset-manager';
import { isMessageKey, resolveLocale, t, type Locale } from '../shared/i18n';
import { logger } from '../shared/logger';
import { describeUpdateResult, formatTimestamp, groupLabel, summarizeGroups } from './format';

/** Options page elements, looked up once at start-up. */
interface Elements {
  readonly groupList: HTMLElement;
  readonly updateStatus: HTMLElement;
  readonly updateNow: HTMLButtonElement;
  readonly versionExt: HTMLElement;
  readonly versionData: HTMLElement;
}

function elementById(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`options: missing #${id}`);
  }
  return element;
}

function buttonById(id: string): HTMLButtonElement {
  const element = elementById(id);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`options: #${id} is not a button`);
  }
  return element;
}

function collectElements(): Elements {
  return {
    groupList: elementById('group-list'),
    updateStatus: elementById('update-status'),
    updateNow: buttonById('update-now'),
    versionExt: elementById('version-ext'),
    versionData: elementById('version-data'),
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

/** Renders one checkbox per group, checked according to the stored toggles. */
function renderGroups(
  list: HTMLElement,
  ids: readonly string[],
  enabledById: ReadonlyMap<string, boolean>,
  locale: Locale,
  onToggle: (id: string, enabled: boolean) => void,
): void {
  list.replaceChildren();
  for (const id of ids) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset['group'] = id;
    checkbox.checked = enabledById.get(id) ?? false;
    checkbox.addEventListener('change', () => onToggle(id, checkbox.checked));

    const label = document.createElement('label');
    label.append(checkbox, document.createTextNode(` ${groupLabel(id, locale)}`));

    const item = document.createElement('li');
    item.append(label);
    list.append(item);
  }
}

/** Shows the packaged extension version and the active list's rule totals. */
async function renderVersion(
  elements: Elements,
  locale: Locale,
  updater: FilterUpdater,
): Promise<void> {
  elements.versionExt.textContent = t('optionsVersion', locale, {
    version: chrome.runtime.getManifest().version,
  });
  const { groups } = await updater.status();
  const totals = summarizeGroups(groups);
  elements.versionData.textContent = t('optionsDataRules', locale, {
    rules: totals.rules,
    groups: totals.groups,
  });
}

/** Runs a user-triggered update and reports the outcome (AC-7.1, AC-7.2). */
async function runManualUpdate(
  elements: Elements,
  locale: Locale,
  updater: FilterUpdater,
): Promise<void> {
  elements.updateNow.disabled = true;
  elements.updateStatus.textContent = t('optionsUpdating', locale);
  try {
    const result = await updater.updateNow();
    elements.updateStatus.textContent = describeUpdateResult(result, locale);
    await renderVersion(elements, locale, updater);
  } catch (error) {
    logger.error('manual filter update failed', error);
    elements.updateStatus.textContent = t('optionsUpdateFailed', locale);
  } finally {
    elements.updateNow.disabled = false;
  }
}

function reportError(error: unknown): void {
  logger.error('options action failed', error);
}

async function main(): Promise<void> {
  const locale = resolveLocale(chrome.i18n.getUILanguage());
  document.documentElement.lang = locale;
  applyStaticText(locale);

  const elements = collectElements();
  const rulesets = createRulesetManager();
  const updater = createFilterUpdater();

  const ids = rulesets.listGroups();
  const enabledById = new Map<string, boolean>();
  for (const id of ids) {
    enabledById.set(id, await rulesets.isGroupEnabled(id));
  }
  renderGroups(elements.groupList, ids, enabledById, locale, (id, enabled) => {
    void rulesets.setGroupEnabled(id, enabled).catch(reportError);
  });

  await renderVersion(elements, locale, updater);
  elements.updateStatus.textContent = formatTimestamp((await updater.status()).updatedAt, locale);

  elements.updateNow.addEventListener('click', () => {
    void runManualUpdate(elements, locale, updater).catch(reportError);
  });
}

void main().catch(reportError);
