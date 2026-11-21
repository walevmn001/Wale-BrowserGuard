/**
 * Dashboard DOM helpers (Phase 1 / 12): element lookup, static-label
 * translation and the language/theme bootstrap.
 *
 * `applyStaticText` fills both the `data-i18n` text placeholders and the
 * `data-i18n-placeholder` input hints the dashboard markup uses, so no
 * user-facing string is hard-coded in the components.
 */

import { isMessageKey, resolveLocale, t, type Locale } from '../shared/i18n';
import type { TypedStorage } from '../shared/storage';

/** Looks up an element by id, throwing if the markup and the script disagree. */
export function q<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`dashboard: missing #${id}`);
  }
  return element as T;
}

/** Fills `data-i18n` (text) and `data-i18n-placeholder` in the page. */
export function applyStaticText(locale: Locale): void {
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset['i18n'];
    if (key !== undefined && isMessageKey(key)) {
      element.textContent = t(key, locale);
    }
  }
  for (const element of document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    const key = element.dataset['i18nPlaceholder'];
    if (key !== undefined && isMessageKey(key)) {
      element.placeholder = t(key, locale);
    }
  }
}

/** The stored language choice wins; otherwise fall back to the browser UI. */
export async function optionsLocale(storage: TypedStorage): Promise<Locale> {
  const choice = await storage.get('language');
  return choice === 'vi' || choice === 'en' ? choice : resolveLocale(chrome.i18n.getUILanguage());
}

/** Applies a stored explicit theme; "system" leaves the media query in charge. */
export async function applyTheme(storage: TypedStorage): Promise<void> {
  const theme = await storage.get('theme');
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset['theme'] = theme;
  } else {
    delete document.documentElement.dataset['theme'];
  }
}
