/**
 * Protection profiles (Phase 9 §1): Balanced / Strict / Custom.
 *
 * Selecting a profile applies the real preset through `Profiles`, so the choice
 * changes actual settings (disabled rulesets, Referer policy, WebRTC) rather
 * than only a label. Strict warns about the compatibility trade-off.
 */

import { createProfiles } from '../background/profiles';
import type { ProtectionProfileId } from '../shared/types';
import { t } from '../shared/i18n';
import { logger } from '../shared/logger';
import { q } from './elements';
import { profileKey } from './format';
import type { Ctx, Section } from './ui';

function isProfileId(value: string | undefined): value is ProtectionProfileId {
  return value === 'balanced' || value === 'strict' || value === 'custom';
}

export function createProfilesSection(ctx: Ctx): Section {
  const cards = q('prof-cards');
  const warn = q('prof-warn');
  const buttons = [...cards.querySelectorAll<HTMLButtonElement>('button[data-profile]')];

  function paint(current: ProtectionProfileId): void {
    for (const button of buttons) {
      const active = button.dataset['profile'] === current;
      button.setAttribute('aria-pressed', String(active));
      const chip = button.querySelector<HTMLElement>('.chip');
      if (chip !== null) {
        chip.hidden = !active;
      }
    }
    warn.hidden = current !== 'strict';
  }

  async function refresh(): Promise<void> {
    paint(await createProfiles().current());
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const id = button.dataset['profile'];
      if (!isProfileId(id)) {
        return;
      }
      void createProfiles()
        .apply(id)
        .then(async () => {
          await refresh();
          ctx.toast(t(profileKey(id), ctx.locale), 'ok');
        })
        .catch((error: unknown) => logger.error('apply profile failed', error));
    });
  }

  return { refresh };
}
