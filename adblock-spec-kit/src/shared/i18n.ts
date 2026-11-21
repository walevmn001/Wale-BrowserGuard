/**
 * Localisation for the extension UI (spec §5: the interface ships in Vietnamese
 * and English).
 *
 * The messages now live in `src/shared/i18n/` (`vi.ts` / `en.ts` / `index.ts`);
 * this file stays as a thin re-export shim so existing imports of
 * `shared/i18n` keep working unchanged.
 */
export {
  DEFAULT_LOCALE,
  EN,
  MESSAGES,
  VI,
  isLocale,
  isMessageKey,
  resolveLocale,
  t,
} from './i18n/index.ts';
export type { Locale, MessageKey, MessageParams } from './i18n/index.ts';
