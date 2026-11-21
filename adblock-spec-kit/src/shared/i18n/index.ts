/**
 * Localisation entry point (spec §5, Phase 11).
 *
 * A small self-contained dictionary rather than `chrome.i18n`/`_locales`: the
 * messages stay type-checked (every locale must define every key) and the
 * look-up is pure, so it can be unit-tested without a browser. The caller reads
 * the browser UI language (`chrome.i18n.getUILanguage()`), or the user's saved
 * preference, and passes it in.
 *
 * Messages live in `vi.ts` (source of truth for the keys) and `en.ts` (typed so
 * it must cover every key). Vietnamese is the default locale.
 */
import { EN } from './en.ts';
import { VI } from './vi.ts';

export type Locale = 'vi' | 'en';

/** Locale used when the browser language is not one we ship. */
export const DEFAULT_LOCALE: Locale = 'vi';

/** Every translatable string; the keys are derived from the Vietnamese file. */
export type MessageKey = keyof typeof VI;

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { vi: VI, en: EN };

export type MessageParams = Readonly<Record<string, string | number>>;

export function isLocale(value: string): value is Locale {
  return value === 'vi' || value === 'en';
}

export function isMessageKey(value: string): value is MessageKey {
  return Object.prototype.hasOwnProperty.call(VI, value);
}

/**
 * Maps a browser UI language (`vi`, `vi-VN`, `en-US`, …) to a locale we ship,
 * falling back to {@link DEFAULT_LOCALE} for anything else.
 */
export function resolveLocale(uiLanguage: string | undefined): Locale {
  const base = uiLanguage?.toLowerCase().split('-')[0];
  return base !== undefined && isLocale(base) ? base : DEFAULT_LOCALE;
}

/** Looks up `key` and replaces `{name}` placeholders with `params`. */
export function t(key: MessageKey, locale: Locale, params?: MessageParams): string {
  const template = MESSAGES[locale][key];
  if (params === undefined) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export { VI, EN };
