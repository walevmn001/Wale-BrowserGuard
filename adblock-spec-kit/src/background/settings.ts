/**
 * General settings (Phase 10): language, theme and the reset action.
 *
 * Reset returns every *configuration* key to its default by removing it —
 * storage getters treat a missing key as the default, so this is the cleanest
 * way to "forget" a choice. Statistics, the activity log and the filter data
 * are left alone so a settings reset never destroys usage history.
 */

import { TypedStorage } from '../shared/storage';
import type { LanguageChoice, ThemeChoice } from '../shared/types';
import { BACKUP_KEYS } from './backup';

/** Keys removed by a settings reset (config only; stats/logs are preserved). */
const RESET_KEYS = [...BACKUP_KEYS, 'pausedUntil', 'statsCursor'] as const;

export interface SettingsDeps {
  readonly storage: TypedStorage;
}

export class Settings {
  private readonly deps: SettingsDeps;

  constructor(deps: SettingsDeps) {
    this.deps = deps;
  }

  async language(): Promise<LanguageChoice> {
    return (await this.deps.storage.get('language')) ?? 'auto';
  }

  async setLanguage(language: LanguageChoice): Promise<void> {
    await this.deps.storage.set('language', language);
  }

  async theme(): Promise<ThemeChoice> {
    return (await this.deps.storage.get('theme')) ?? 'system';
  }

  async setTheme(theme: ThemeChoice): Promise<void> {
    await this.deps.storage.set('theme', theme);
  }

  /** Removes every configuration key, leaving statistics and logs intact. */
  async reset(): Promise<void> {
    for (const key of RESET_KEYS) {
      await this.deps.storage.remove(key);
    }
  }
}

/** Builds a settings controller backed by real storage. */
export function createSettings(): Settings {
  return new Settings({ storage: new TypedStorage() });
}
