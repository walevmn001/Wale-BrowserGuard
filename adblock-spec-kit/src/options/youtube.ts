/**
 * YouTube module page (T068, US-15 / AC-15.1 + AC-15.6): the module's own
 * on/off switch and the clear risk warning the acceptance criteria require.
 *
 * The module is an opt-in, best-effort extra (Constitution VI): it is off unless
 * the user turns it here, and the switch is the single source of truth the
 * worker reads (`youtubeModule`, `youtube-settings.ts`). The worker keeps the
 * module-owned `youtube` ruleset (Q1) in step with this flag, so toggling it
 * changes real behaviour. AC-15.6's three caveats are shown in the warning
 * banner above the switch.
 */

import { createYouTubeModuleSettings } from '../background/youtube-settings';
import { t } from '../shared/i18n';
import { logger } from '../shared/logger';
import { q } from './elements';
import type { Ctx, Section } from './ui';

export function createYouTubeSection(ctx: Ctx): Section {
  const toggle = q<HTMLInputElement>('yt-module');

  async function refresh(): Promise<void> {
    toggle.checked = await createYouTubeModuleSettings().isEnabled();
  }

  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    void createYouTubeModuleSettings()
      .setEnabled(enabled)
      .then(async () => {
        await refresh();
        ctx.toast(t(enabled ? 'ytToastOn' : 'ytToastOff', ctx.locale));
      })
      .catch((error: unknown) => logger.error('youtube module toggle failed', error));
  });

  return { refresh };
}
