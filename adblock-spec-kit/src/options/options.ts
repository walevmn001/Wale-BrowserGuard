/**
 * Dashboard shell (T072): bootstraps language + theme, builds the shared
 * context, wires the sidebar navigation, the top-bar status pill and the smart
 * search. Each section module owns its own markup and behaviour; this file only
 * composes them and caches nothing (Constitution 14).
 */

import { createFilterUpdater } from '../background/filter-updater';
import { createProtectionPause } from '../background/pause';
import { t } from '../shared/i18n';
import { logger } from '../shared/logger';
import { TypedStorage } from '../shared/storage';
import { createAbout } from './about';
import { createActivity } from './activity';
import { createData } from './data';
import { createDiagnostics } from './diagnostics';
import { applyStaticText, applyTheme, optionsLocale, q } from './elements';
import { createExceptions } from './exceptions';
import { createFilters } from './filters';
import { statusKey, statusTone } from './format';
import { createOverview } from './overview';
import { createPrivacy } from './privacy';
import { createProfilesSection } from './profiles';
import { createRules } from './rules';
import { createSecurity } from './security';
import { createSettingsSection } from './settings';
import { createContext, type Ctx, type Section } from './ui';

/** Sidebar pages in display order; the id is also the `<section>` id. */
const PAGES = [
  'overview',
  'activity',
  'filters',
  'security',
  'privacy',
  'exceptions',
  'profiles',
  'rules',
  'data',
  'diagnostics',
  'settings',
  'about',
] as const;

type PageId = (typeof PAGES)[number];

const DEFAULT_PAGE: PageId = 'overview';

function isPageId(value: string): value is PageId {
  return (PAGES as readonly string[]).includes(value);
}

/** Builds all twelve sections; each factory only attaches its own listeners. */
function buildSections(ctx: Ctx): ReadonlyMap<PageId, Section> {
  return new Map<PageId, Section>([
    ['overview', createOverview(ctx)],
    ['activity', createActivity(ctx)],
    ['filters', createFilters(ctx)],
    ['security', createSecurity(ctx)],
    ['privacy', createPrivacy(ctx)],
    ['exceptions', createExceptions(ctx)],
    ['profiles', createProfilesSection(ctx)],
    ['rules', createRules(ctx)],
    ['data', createData(ctx)],
    ['diagnostics', createDiagnostics(ctx)],
    ['settings', createSettingsSection(ctx)],
    ['about', createAbout(ctx)],
  ]);
}

/** The page named by the URL hash, or the overview by default. */
function currentPage(): PageId {
  const hash = window.location.hash.replace(/^#/, '');
  return isPageId(hash) ? hash : DEFAULT_PAGE;
}

/** Shows one page and marks its sidebar link as the current one. */
function showPage(page: PageId): void {
  for (const id of PAGES) {
    q(id).hidden = id !== page;
  }
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-nav]')) {
    if (link.dataset['nav'] === page) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  }
}

/** Reads the live protection state into the top-bar status pill. */
async function renderTopStatus(ctx: Ctx, storage: TypedStorage): Promise<void> {
  const enabled = (await storage.get('enabled')) ?? true;
  const paused = (await createProtectionPause().state()).paused;
  const failures = (await createFilterUpdater().status()).failures;
  const tone = statusTone(enabled, paused, failures);
  q('top-status').className = `status ${tone}`;
  q('top-status-dot').className = tone === 'on' ? 'dot' : `dot ${tone}`;
  q('top-status-text').textContent = t(statusKey(enabled, paused, failures), ctx.locale);
}

interface SearchEntry {
  readonly page: PageId;
  readonly text: string;
}

/** Builds a flat, local-only search index over every list the user owns. */
async function buildSearchIndex(storage: TypedStorage): Promise<readonly SearchEntry[]> {
  const entries: SearchEntry[] = [];
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-nav]')) {
    const page = link.dataset['nav'];
    const label = link.textContent?.trim() ?? '';
    if (page !== undefined && isPageId(page) && label !== '') {
      entries.push({ page, text: label });
    }
  }
  for (const domain of (await storage.get('whitelist')) ?? []) {
    entries.push({ page: 'exceptions', text: domain });
  }
  for (const rule of (await storage.get('customRules')) ?? []) {
    entries.push({ page: 'rules', text: rule.text });
  }
  for (const list of (await storage.get('customLists')) ?? []) {
    entries.push({ page: 'filters', text: `${list.name} ${list.url}` });
  }
  for (const item of (await storage.get('activity')) ?? []) {
    if (item.host !== '') {
      entries.push({ page: 'activity', text: item.host });
    }
  }
  return entries;
}

/** Top-bar search: a live match count plus Enter to jump to the first hit. */
function wireSearch(ctx: Ctx, index: readonly SearchEntry[]): void {
  const input = q<HTMLInputElement>('smart-search');
  const count = q('search-count');
  let matches: readonly SearchEntry[] = [];

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    if (query === '') {
      matches = [];
      count.hidden = true;
      return;
    }
    matches = index.filter((entry) => entry.text.toLowerCase().includes(query));
    count.textContent = t('gResults', ctx.locale, { count: matches.length });
    count.hidden = false;
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && matches[0] !== undefined) {
      ctx.open(matches[0].page);
    }
  });
}

async function main(): Promise<void> {
  const storage = new TypedStorage();
  const locale = await optionsLocale(storage);
  document.documentElement.lang = locale;
  applyStaticText(locale);
  await applyTheme(storage);

  const ctx = createContext(locale);
  const sections = buildSections(ctx);

  q('side-version').textContent = t('abtVersion', locale, {
    version: chrome.runtime.getManifest().version,
  });

  const refreshCurrent = (): void => {
    const section = sections.get(currentPage());
    if (section !== undefined) {
      void section
        .refresh()
        .catch((error: unknown) => logger.error('section refresh failed', error));
    }
  };

  window.addEventListener('hashchange', () => {
    showPage(currentPage());
    refreshCurrent();
  });

  showPage(currentPage());
  refreshCurrent();
  await renderTopStatus(ctx, storage);

  // Keep the status pill honest when a toggle changes in any section or in the
  // popup — no polling, no cached copy of the state.
  chrome.storage.onChanged.addListener(() => {
    void renderTopStatus(ctx, storage).catch(() => undefined);
  });

  wireSearch(ctx, await buildSearchIndex(storage));
}

void main().catch((error: unknown) => logger.error('options boot failed', error));
