/**
 * Protection profiles (Phase 9 §1).
 *
 * A profile is a named bundle of real settings, not a label: applying one writes
 * the per-group toggles, the WebRTC policy and the referer policy, and the
 * worker's `storage.onChanged` listeners turn those into live DNR changes.
 * "Custom" is what the profile becomes once the user edits a module by hand.
 */

import { logger } from '../shared/logger';
import { TypedStorage } from '../shared/storage';
import type { ProtectionProfileId, RefererPolicy } from '../shared/types';

/** The concrete settings a named profile applies. */
interface ProfilePreset {
  readonly disabledRuleSets: string[];
  readonly webrtcProtection: boolean;
  readonly antiFingerprint: boolean;
  readonly refererPolicy: RefererPolicy;
}

/**
 * Balanced favours compatibility; Strict layers the stronger privacy controls on
 * top. Anti-fingerprinting stays off even in Strict because it can break pages
 * and is documented as opt-in — the UI warns about Strict's compatibility cost.
 */
export const PROFILE_PRESETS: Record<'balanced' | 'strict', ProfilePreset> = {
  balanced: {
    disabledRuleSets: [],
    webrtcProtection: false,
    antiFingerprint: false,
    refererPolicy: 'default',
  },
  strict: {
    disabledRuleSets: [],
    webrtcProtection: true,
    antiFingerprint: false,
    refererPolicy: 'third-party',
  },
};

export interface ProfilesDeps {
  readonly storage: TypedStorage;
}

export class Profiles {
  private readonly deps: ProfilesDeps;

  constructor(deps: ProfilesDeps) {
    this.deps = deps;
  }

  async current(): Promise<ProtectionProfileId> {
    return (await this.deps.storage.get('profile')) ?? 'balanced';
  }

  /** Applies a named profile, or marks the settings as custom without changing them. */
  async apply(id: ProtectionProfileId): Promise<void> {
    if (id === 'custom') {
      await this.deps.storage.set('profile', 'custom');
      return;
    }
    const preset = PROFILE_PRESETS[id];
    await this.deps.storage.set('disabledRuleSets', [...preset.disabledRuleSets]);
    await this.deps.storage.set('webrtcProtection', preset.webrtcProtection);
    await this.deps.storage.set('antiFingerprint', preset.antiFingerprint);
    await this.deps.storage.set('refererPolicy', preset.refererPolicy);
    await this.deps.storage.set('profile', id);
    logger.info(`protection profile applied: ${id}`);
  }
}

/** Builds a profiles controller backed by real storage. */
export function createProfiles(): Profiles {
  return new Profiles({ storage: new TypedStorage() });
}
