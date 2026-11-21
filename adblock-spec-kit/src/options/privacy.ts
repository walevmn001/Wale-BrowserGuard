/**
 * Privacy Center (Phase 8): HTTPS upgrade / tracking-parameter / Referer group,
 * Referer policy, WebRTC leak protection and the opt-in anti-fingerprinting
 * control with its per-site off list.
 *
 * Each control writes the same setting the worker reads, so the UI reflects
 * real behaviour. Anti-fingerprinting stays opt-in and off by default.
 */

import type { RefererPolicy } from '../shared/types';
import { createRulesetManager } from '../background/ruleset-manager';
import { createFingerprintSettings } from '../background/security/fingerprint-settings';
import { createPrivacySettings } from '../background/security/privacy-settings';
import { createRefererSettings } from '../background/referer';
import { t } from '../shared/i18n';
import { logger } from '../shared/logger';
import { TRACKING_PARAMS } from '../../scripts/privacy-rules.ts';
import { q } from './elements';
import type { Ctx, Section } from './ui';

export function createPrivacy(ctx: Ctx): Section {
  const group = q<HTMLInputElement>('prv-group');
  const referer = q<HTMLSelectElement>('prv-referer');
  const webrtc = q<HTMLInputElement>('webrtc-protection');
  const fingerprint = q<HTMLInputElement>('anti-fingerprint');
  const fpList = q('prv-fp-list');
  const fpEmpty = q('prv-fp-empty');
  const params = q('prv-params');

  async function renderFp(list: readonly string[]): Promise<void> {
    fpList.replaceChildren();
    fpEmpty.hidden = list.length > 0;
    for (const host of [...list].sort()) {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'grow truncate';
      name.textContent = host;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn ghost sm';
      remove.textContent = t('gRemove', ctx.locale);
      remove.addEventListener('click', () => {
        void createFingerprintSettings()
          .setSiteEnabled(host, true)
          .then(() => createFingerprintSettings().offSites())
          .then(renderFp)
          .catch((error: unknown) => logger.error('remove fp exception failed', error));
      });
      item.append(name, remove);
      fpList.append(item);
    }
  }

  async function refresh(): Promise<void> {
    group.checked = await createRulesetManager().isGroupEnabled('privacy');
    referer.value = await createRefererSettings().policy();
    webrtc.checked = await createPrivacySettings().isEnabled();
    fingerprint.checked = await createFingerprintSettings().isEnabled();
    await renderFp(await createFingerprintSettings().offSites());
    params.textContent = TRACKING_PARAMS.join(', ');
  }

  group.addEventListener('change', () => {
    void createRulesetManager()
      .setGroupEnabled('privacy', group.checked)
      .catch((error: unknown) => logger.error('privacy group toggle failed', error));
  });

  referer.addEventListener('change', () => {
    const value: RefererPolicy = referer.value === 'third-party' ? 'third-party' : 'default';
    void createRefererSettings()
      .setPolicy(value)
      .catch((error: unknown) => logger.error('referer policy failed', error));
  });

  webrtc.addEventListener('change', () => {
    void createPrivacySettings()
      .setEnabled(webrtc.checked)
      .catch((error: unknown) => logger.error('webrtc toggle failed', error));
  });

  fingerprint.addEventListener('change', () => {
    void createFingerprintSettings()
      .setEnabled(fingerprint.checked)
      .catch((error: unknown) => logger.error('fingerprint toggle failed', error));
  });

  return { refresh };
}
