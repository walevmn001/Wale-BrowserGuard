/**
 * Master switch and per-group toggles for the static declarativeNetRequest
 * rulesets (T013, T024; US-2 / AC-2.3, US-7).
 *
 * Turning the extension "off" means disabling every static ruleset, so the
 * browser stops applying them without needing a reload. The switch value and
 * the set of groups the user switched off live in `chrome.storage` (`enabled`,
 * `disabledRuleSets`), never in a module variable, because the MV3 worker can be
 * stopped at any time (Constitution 14).
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
    await this.applyCurrent();
  }

  /** Re-applies the stored switch and per-group toggles (startup, change). */
  async applyStored(): Promise<boolean> {
    await this.applyCurrent();
    return this.isEnabled();
  }

  /** Every static ruleset id declared in the manifest. */
  listGroups(): readonly string[] {
    return this.deps.ruleSetIds;
  }

  /** The ruleset ids the user switched off; missing means none. */
  async disabledGroups(): Promise<readonly string[]> {
    return (await this.deps.storage.get('disabledRuleSets')) ?? [];
  }

  /** Whether a group is on: the master switch is on and it is not disabled. */
  async isGroupEnabled(id: string): Promise<boolean> {
    if (!(await this.isEnabled())) {
      return false;
    }
    return !(await this.disabledGroups()).includes(id);
  }

  /** Persists a group toggle and applies the resulting set right away. */
  async setGroupEnabled(id: string, enabled: boolean): Promise<void> {
    const disabled = new Set(await this.disabledGroups());
    if (enabled) {
      disabled.delete(id);
    } else {
      disabled.add(id);
    }
    await this.deps.storage.set('disabledRuleSets', [...disabled].sort());
    await this.applyCurrent();
  }

  /**
   * Enables exactly the groups that should be on (master on and not disabled)
   * and disables the rest, in one `updateEnabledRulesets` call.
   */
  private async applyCurrent(): Promise<void> {
    const enabled = await this.isEnabled();
    const disabled = new Set(await this.disabledGroups());
    const enableRulesetIds: string[] = [];
    const disableRulesetIds: string[] = [];
    for (const id of this.deps.ruleSetIds) {
      if (enabled && !disabled.has(id)) {
        enableRulesetIds.push(id);
      } else {
        disableRulesetIds.push(id);
      }
    }
    if (enableRulesetIds.length === 0 && disableRulesetIds.length === 0) {
      return;
    }
    const options: UpdateEnabledRulesetsOptions = {};
    if (enableRulesetIds.length > 0) {
      options.enableRulesetIds = enableRulesetIds;
    }
    if (disableRulesetIds.length > 0) {
      options.disableRulesetIds = disableRulesetIds;
    }
    await this.deps.updateEnabledRulesets(options);
    logger.info(`static rulesets enabled: [${enableRulesetIds.join(', ')}]`);
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
