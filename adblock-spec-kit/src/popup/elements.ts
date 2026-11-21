/**
 * Popup DOM helpers and shared view state (Phase 2 / 12).
 *
 * Element lookup, static-label filling and the language/theme bootstrap live
 * here so the page script and the render module stay small. Nothing is cached
 * in a module variable: every lookup happens once per popup open.
 */

import type { PauseState } from '../background/pause';
import { isMessageKey, resolveLocale, t, type Locale } from '../shared/i18n';
import type { TypedStorage } from '../shared/storage';

/** All popup elements, looked up once. */
export interface Elements {
  readonly statusIco: HTMLElement;
  readonly guardStatus: HTMLElement;
  readonly masterStatus: HTMLElement;
  readonly masterToggle: HTMLButtonElement;
  readonly pauseBar: HTMLElement;
  readonly pauseState: HTMLElement;
  readonly pauseResume: HTMLButtonElement;
  readonly pauseSelect: HTMLSelectElement;
  readonly siteDomain: HTMLElement;
  readonly siteStatus: HTMLElement;
  readonly siteToggle: HTMLButtonElement;
  readonly statsSite: HTMLElement;
  readonly statsTotal: HTMLElement;
  readonly statsToday: HTMLElement;
  readonly statsClear: HTMLButtonElement;
  readonly modules: HTMLElement;
  readonly fingerprintSite: HTMLInputElement;
  readonly actionScan: HTMLButtonElement;
  readonly scanResult: HTMLElement;
  readonly openActivity: HTMLButtonElement;
  readonly openDashboard: HTMLButtonElement;
  readonly openSettings: HTMLButtonElement;
}

/** Everything the first paint needs, gathered in one pass. */
export interface LiveState {
  readonly locale: Locale;
  readonly domain: string | undefined;
  readonly tabId: number | undefined;
  readonly url: string | undefined;
  readonly masterEnabled: boolean;
  readonly paused: PauseState;
  readonly blocking: boolean;
  readonly fingerprintOn: boolean;
  readonly cosmeticOff: boolean;
  readonly siteCount: number;
  readonly total: number;
  readonly today: number;
  readonly failures: number;
  readonly disabled: readonly string[];
}

/** Looks up an element by id and throws if the markup and the script disagree. */
export function q<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`popup: missing #${id}`);
  }
  return element as T;
}

export function collectElements(): Elements {
  return {
    statusIco: q('status-ico'),
    guardStatus: q('guard-status'),
    masterStatus: q('master-status'),
    masterToggle: q<HTMLButtonElement>('master-toggle'),
    pauseBar: q('pause-bar'),
    pauseState: q('pause-state'),
    pauseResume: q<HTMLButtonElement>('pause-resume'),
    pauseSelect: q<HTMLSelectElement>('pause-select'),
    siteDomain: q('site-domain'),
    siteStatus: q('site-status'),
    siteToggle: q<HTMLButtonElement>('site-toggle'),
    statsSite: q('stats-site'),
    statsTotal: q('stats-total'),
    statsToday: q('stats-today'),
    statsClear: q<HTMLButtonElement>('stats-clear'),
    modules: q('modules'),
    fingerprintSite: q<HTMLInputElement>('fingerprint-site'),
    actionScan: q<HTMLButtonElement>('action-scan'),
    scanResult: q('scan-result'),
    openActivity: q<HTMLButtonElement>('open-activity'),
    openDashboard: q<HTMLButtonElement>('open-dashboard'),
    openSettings: q<HTMLButtonElement>('open-settings'),
  };
}

/** Fills `data-i18n` (text) and `data-i18n-title` (title) placeholders. */
export function applyStaticText(locale: Locale): void {
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset['i18n'];
    if (key !== undefined && isMessageKey(key)) {
      element.textContent = t(key, locale);
    }
  }
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    const key = element.dataset['i18nTitle'];
    if (key !== undefined && isMessageKey(key)) {
      element.title = t(key, locale);
    }
  }
}

/** The stored language choice wins; otherwise fall back to the browser UI. */
export async function popupLocale(storage: TypedStorage): Promise<Locale> {
  const choice = await storage.get('language');
  return choice === 'vi' || choice === 'en' ? choice : resolveLocale(chrome.i18n.getUILanguage());
}

/** Applies a stored explicit theme; "system" leaves the media query in charge. */
export async function applyTheme(storage: TypedStorage): Promise<void> {
  const theme = await storage.get('theme');
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset['theme'] = theme;
  }
}
