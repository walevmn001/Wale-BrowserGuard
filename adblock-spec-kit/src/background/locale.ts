/**
 * Locale for worker-originated (not page-rendered) strings — notifications,
 * injected picker labels, the in-page banner (Phase 11).
 *
 * The user's stored choice wins; otherwise we follow the browser UI language.
 */

import { resolveLocale, type Locale } from '../shared/i18n';
import { TypedStorage } from '../shared/storage';

export async function workerLocale(): Promise<Locale> {
  const choice = await new TypedStorage().get('language');
  if (choice === 'vi' || choice === 'en') {
    return choice;
  }
  return resolveLocale(chrome.i18n.getUILanguage());
}
