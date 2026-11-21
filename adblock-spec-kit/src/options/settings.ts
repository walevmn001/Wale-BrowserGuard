/**
 * Settings (Phase 10): language, theme, notifications and the factory reset.
 *
 * Language and theme are the same choices the popup/worker read. Changing the
 * language reloads the page so every already-rendered/labelled string switches;
 * a reset restores defaults (and clears the whitelist) after a confirmation.
 */

import { createNotifications } from '../background/notifications';
import { createSettings } from '../background/settings';
import { t } from '../shared/i18n';
import { logger } from '../shared/logger';
import type { LanguageChoice, NotificationSettings, ThemeChoice } from '../shared/types';
import { applyTheme, q } from './elements';
import type { Ctx, Section } from './ui';

function isLanguage(value: string): value is LanguageChoice {
  return value === 'auto' || value === 'vi' || value === 'en';
}

function isTheme(value: string): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function createSettingsSection(ctx: Ctx): Section {
  const language = q<HTMLSelectElement>('set-language');
  const theme = q<HTMLSelectElement>('set-theme');
  const notifFilter = q<HTMLInputElement>('set-notif-filter');
  const notifSecurity = q<HTMLInputElement>('set-notif-security');
  const notifOff = q<HTMLInputElement>('set-notif-off');
  const notifErrors = q<HTMLInputElement>('set-notif-errors');

  function readNotifications(): NotificationSettings {
    return {
      filterUpdate: notifFilter.checked,
      securityBlock: notifSecurity.checked,
      protectionOff: notifOff.checked,
      errors: notifErrors.checked,
    };
  }

  async function refresh(): Promise<void> {
    language.value = (await ctx.storage.get('language')) ?? 'auto';
    theme.value = (await ctx.storage.get('theme')) ?? 'system';
    const notifications = await createNotifications().settings();
    notifFilter.checked = notifications.filterUpdate;
    notifSecurity.checked = notifications.securityBlock;
    notifOff.checked = notifications.protectionOff;
    notifErrors.checked = notifications.errors;
  }

  language.addEventListener('change', () => {
    if (!isLanguage(language.value)) {
      return;
    }
    void createSettings()
      .setLanguage(language.value)
      .then(() => window.location.reload())
      .catch((error: unknown) => logger.error('set language failed', error));
  });

  theme.addEventListener('change', () => {
    if (!isTheme(theme.value)) {
      return;
    }
    void createSettings()
      .setTheme(theme.value)
      .then(() => applyTheme(ctx.storage))
      .catch((error: unknown) => logger.error('set theme failed', error));
  });

  for (const box of [notifFilter, notifSecurity, notifOff, notifErrors]) {
    box.addEventListener('change', () => {
      void createNotifications()
        .setSettings(readNotifications())
        .catch((error: unknown) => logger.error('set notifications failed', error));
    });
  }

  q('set-reset').addEventListener('click', () => {
    void (async () => {
      const ok = await ctx.confirm(
        t('setReset', ctx.locale),
        t('setResetConfirm', ctx.locale),
        t('setReset', ctx.locale),
        true,
      );
      if (!ok) {
        return;
      }
      await createSettings().reset();
      ctx.toast(t('setResetDone', ctx.locale), 'ok');
      window.location.reload();
    })().catch((error: unknown) => logger.error('reset settings failed', error));
  });

  return { refresh };
}
