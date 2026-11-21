/**
 * WebRTC IP handling policy (T035, spec.md §6 / AC-6.4).
 *
 * WebRTC can reveal a machine's local/private IP addresses to any page that
 * opens a peer connection, even behind a VPN. As an opt-in, the extension
 * constrains Chrome to the interface that reaches the public internet
 * (`default_public_interface_only`); turning it back off calls `clear()`, which
 * restores whatever the browser's own default was (algorithm.md §G).
 *
 * The setting is only touched when this extension actually has control over it:
 * `chrome.privacy` reports `levelOfControl`, and enterprise policy or another
 * extension can take that away. The user's choice is still persisted, so it is
 * re-applied once control is available again.
 *
 * Every dependency is injected so the class is unit-testable without a browser;
 * `createPrivacySettings` wires the real `chrome.privacy` API. State lives in
 * `chrome.storage` (`webrtcProtection`), never in a module variable
 * (Constitution 14).
 *
 * Reference: developer.chrome.com/docs/extensions/reference/api/privacy —
 * the `privacy` permission is required, and `webRTCIPHandlingPolicy` is a
 * `ChromeSetting<IPHandlingPolicy>` with `get`/`set`/`clear`.
 */

import { logger } from '../../shared/logger';
import { TypedStorage } from '../../shared/storage';

/** The WebRTC IP handling policies Chrome accepts. */
export type WebRtcPolicy = `${chrome.privacy.IPHandlingPolicy}`;

/** Restricts WebRTC to the interface that can reach the public internet. */
export const WEBRTC_PROTECTED_POLICY: WebRtcPolicy = 'default_public_interface_only';

type LevelOfControl = `${chrome.types.LevelOfControl}`;

/** The two `levelOfControl` values under which we may change a setting. */
const CONTROLLABLE: ReadonlySet<LevelOfControl> = new Set<LevelOfControl>([
  'controllable_by_this_extension',
  'controlled_by_this_extension',
]);

/** Whether `levelOfControl` lets this extension change the setting. */
export function isControllable(level: LevelOfControl): boolean {
  return CONTROLLABLE.has(level);
}

export interface PrivacySettingsDeps {
  readonly storage: TypedStorage;
  /** `levelOfControl` for the WebRTC policy, from `chrome.privacy`. */
  readonly getControl: () => Promise<LevelOfControl>;
  readonly setPolicy: (value: WebRtcPolicy) => Promise<void>;
  /** Restores the browser default (ChromeSetting.clear). */
  readonly clearPolicy: () => Promise<void>;
}

export class PrivacySettings {
  private readonly deps: PrivacySettingsDeps;

  constructor(deps: PrivacySettingsDeps) {
    this.deps = deps;
  }

  /** Whether WebRTC leak protection is on; off until the user opts in. */
  async isEnabled(): Promise<boolean> {
    return (await this.deps.storage.get('webrtcProtection')) ?? false;
  }

  /** Persists the choice and applies it right away. */
  async setEnabled(enabled: boolean): Promise<void> {
    await this.deps.storage.set('webrtcProtection', enabled);
    await this.apply(enabled);
  }

  /** Re-applies the stored choice (startup, change) and returns it. */
  async applyStored(): Promise<boolean> {
    const enabled = await this.isEnabled();
    await this.apply(enabled);
    return enabled;
  }

  private async apply(enabled: boolean): Promise<void> {
    const level = await this.deps.getControl();
    if (!isControllable(level)) {
      logger.warn(`WebRTC policy is "${level}"; leaving it unchanged`);
      return;
    }
    if (enabled) {
      await this.deps.setPolicy(WEBRTC_PROTECTED_POLICY);
      logger.info('WebRTC limited to the public network interface');
    } else {
      await this.deps.clearPolicy();
      logger.info('WebRTC policy restored to the browser default');
    }
  }
}

/** Builds the settings backed by the real `chrome.privacy` API. */
export function createPrivacySettings(): PrivacySettings {
  const setting = chrome.privacy.network.webRTCIPHandlingPolicy;
  return new PrivacySettings({
    storage: new TypedStorage(),
    getControl: async () => (await setting.get({})).levelOfControl,
    setPolicy: async (value) => {
      await setting.set({ value });
    },
    clearPolicy: async () => {
      await setting.clear({});
    },
  });
}
