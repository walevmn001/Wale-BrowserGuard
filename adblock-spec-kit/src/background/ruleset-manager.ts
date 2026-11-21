/**
 * Master switch for the static declarativeNetRequest rulesets (T013, US-2 /
 * AC-2.3).
 *
 * Turning the extension "off" means disabling every static ruleset, so the
 * browser stops applying them without needing a reload. The switch value lives
 * in `chrome.storage` (`enabled`), never in a module variable, because the MV3
 * worker can be stopped at any time (Constitution 14).
 *
 * Everything the class touches is injected so it can be unit-tested without a
 * real browser; `createRulesetManager` wires the real `chrome.*` APIs.
 */

import { logger } from '../shared/logger';
import { TypedStorage } from '../shared/storage';

/** Mirrors `chrome.declarativeNetRequest.UpdateRulesetOptions`. */
export interface UpdateEnabledRulesetsOptions {
  enableRulesetIds?: string[];
  disableRulesetIds?: string[];
}

export type UpdateEnabledRulesets = (options: UpdateEnabledRulesetsOptions) => Promise<void>;

/** The slice of the manifest this module needs (lets tests pass a literal). */
export interface ManifestRuleResources {
  readonly declarative_net_request?:
    { readonly rule_resources: readonly { readonly id: string }[] } | undefined;
}

export interface RulesetManagerDeps {
  readonly storage: TypedStorage;
  readonly ruleSetIds: readonly string[];
  readonly updateEnabledRulesets: UpdateEnabledRulesets;
}

/** Static ruleset ids declared in the manifest — the runtime source of truth. */
export function ruleSetIdsFromManifest(
  manifest: ManifestRuleResources = chrome.runtime.getManifest(),
): readonly string[] {
  const resources = manifest.declarative_net_request?.rule_resources ?? [];
  return resources.map(({ id }) => id);
}

export class RulesetManager {
  private readonly deps: RulesetManagerDeps;

  constructor(deps: RulesetManagerDeps) {
    this.deps = deps;
  }

  /** Master switch state; defaults to on until the user turns it off. */
  async isEnabled(): Promise<boolean> {
    return (await this.deps.storage.get('enabled')) ?? true;
  }

  /** Persists the switch and applies it right away. */
  async setEnabled(enabled: boolean): Promise<void> {
    await this.deps.storage.set('enabled', enabled);
    await this.applyEnabled(enabled);
  }

  /** Re-applies the stored switch (worker startup, storage change). */
  async applyStored(): Promise<boolean> {
    const enabled = await this.isEnabled();
    await this.applyEnabled(enabled);
    return enabled;
  }

  private async applyEnabled(enabled: boolean): Promise<void> {
    const ids = [...this.deps.ruleSetIds];
    if (ids.length === 0) {
      return;
    }
    await this.deps.updateEnabledRulesets(
      enabled ? { enableRulesetIds: ids } : { disableRulesetIds: ids },
    );
    logger.info(`static rulesets ${enabled ? 'enabled' : 'disabled'}: ${ids.join(', ')}`);
  }
}

/** Builds a manager backed by the real `chrome.*` APIs (used by the worker). */
export function createRulesetManager(): RulesetManager {
  return new RulesetManager({
    storage: new TypedStorage(),
    ruleSetIds: ruleSetIdsFromManifest(),
    updateEnabledRulesets: (options) => chrome.declarativeNetRequest.updateEnabledRulesets(options),
  });
}
