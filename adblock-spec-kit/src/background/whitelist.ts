/**
 * Per-domain whitelist (T014, algorithm.md §C).
 *
 * Whitelisting a site adds one dynamic DNR rule with the highest priority that
 * lets every request from that site's frame through. The rule id is derived
 * from the domain with a stable hash, so re-applying the same site is
 * idempotent: toggling twice never creates a second rule.
 *
 * The domain list lives in `chrome.storage` (source of truth) while the
 * matching dynamic rules are updated in a single `updateDynamicRules` call
 * (remove + add at once) to avoid a half-applied state. Nothing is kept in a
 * module variable because the MV3 worker can be stopped at any time.
 *
 * Every dependency is injected so the class can be unit-tested without a
 * browser; `createWhitelist` wires the real `chrome.*` APIs.
 */

import { PRIORITY } from '../shared/constants';
import { logger } from '../shared/logger';
import { TypedStorage } from '../shared/storage';

/**
 * Dynamic rule ids live in a private range so they never collide with the
 * static rulesets' ids (those are 1-based per ruleset) or future dynamic rules.
 * The range is 1_000_000 wide, which keeps collisions between whitelisted
 * domains vanishingly unlikely for a hand-curated list.
 */
export const WHITELIST_RULE_ID_BASE = 1_000_000;
const WHITELIST_RULE_ID_RANGE = 1_000_000;

/** Resource types an `allowAllRequests` rule may use (sub_frame/main_frame). */
const FRAME_RESOURCE_TYPES: readonly `${chrome.declarativeNetRequest.ResourceType}`[] = [
  'main_frame',
  'sub_frame',
];

/**
 * Deterministic FNV-1a hash of the domain, mapped into the private id range.
 * Stable across sessions so the same domain always maps to the same rule id.
 */
export function whitelistRuleId(domain: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < domain.length; index += 1) {
    hash ^= domain.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return WHITELIST_RULE_ID_BASE + (hash % WHITELIST_RULE_ID_RANGE);
}

/** Builds the `allowAllRequests` rule that whitelists one domain. */
export function buildAllowAllRule(domain: string): chrome.declarativeNetRequest.Rule {
  return {
    id: whitelistRuleId(domain),
    priority: PRIORITY.WHITELIST_ALLOW_ALL,
    action: { type: 'allowAllRequests' },
    condition: {
      requestDomains: [domain],
      resourceTypes: [...FRAME_RESOURCE_TYPES],
    },
  };
}

export interface WhitelistDeps {
  readonly storage: TypedStorage;
  readonly updateDynamicRules: (
    options: chrome.declarativeNetRequest.UpdateRuleOptions,
  ) => Promise<void>;
}

export class Whitelist {
  private readonly deps: WhitelistDeps;

  constructor(deps: WhitelistDeps) {
    this.deps = deps;
  }

  /** Currently whitelisted domains (empty until the user adds some). */
  async list(): Promise<readonly string[]> {
    return (await this.deps.storage.get('whitelist')) ?? [];
  }

  /** Whether a domain is whitelisted. */
  async isAllowed(domain: string): Promise<boolean> {
    return (await this.list()).includes(domain);
  }

  /**
   * Adds or removes a domain. Idempotent: calling it again with the same value
   * leaves the same domain list and the same single dynamic rule.
   */
  async setEnabled(domain: string, enabled: boolean): Promise<readonly string[]> {
    const current = await this.list();
    const next = enabled
      ? current.includes(domain)
        ? current
        : [...current, domain]
      : current.filter((item) => item !== domain);

    await this.deps.storage.set('whitelist', [...next]);
    await this.deps.updateDynamicRules(
      enabled
        ? { addRules: [buildAllowAllRule(domain)] }
        : { removeRuleIds: [whitelistRuleId(domain)] },
    );
    logger.info(`whitelist ${enabled ? 'added' : 'removed'}: ${domain}`);
    return next;
  }

  /**
   * Re-applies every stored whitelist rule (worker install/startup and when the
   * stored list changes). Re-adding an existing id updates it in place, so this
   * is safe to call repeatedly.
   */
  async applyStored(): Promise<readonly string[]> {
    const domains = await this.list();
    if (domains.length === 0) {
      return domains;
    }
    await this.deps.updateDynamicRules({ addRules: domains.map(buildAllowAllRule) });
    logger.info(`whitelist rules applied: ${domains.join(', ')}`);
    return domains;
  }
}

/** Builds a whitelist backed by the real `chrome.*` APIs (used by the worker). */
export function createWhitelist(): Whitelist {
  return new Whitelist({
    storage: new TypedStorage(),
    updateDynamicRules: (options) => chrome.declarativeNetRequest.updateDynamicRules(options),
  });
}
