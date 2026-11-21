/**
 * Referer trimming (Phase 8).
 *
 * When the policy is `third-party`, one dynamic rule removes the `Referer`
 * header from third-party sub-resource requests. Top-level navigations are left
 * alone — dropping the header on a navigation breaks login redirects and
 * hotlink checks ("block too little over block too much"). The browser default
 * is `strict-origin-when-cross-origin`, so this is a small, opt-out step.
 *
 * A dynamic rule (not part of the static `privacy` ruleset) so it can be turned
 * off on its own. State lives in `chrome.storage` (Constitution 14).
 */

import { PRIORITY } from '../shared/constants';
import { logger } from '../shared/logger';
import { TypedStorage } from '../shared/storage';
import type { RefererPolicy } from '../shared/types';

/** Fixed dynamic-rule id for the referer rule (own range, see other modules). */
export const REFERER_RULE_ID = 4_000_001;

const REFERER_RESOURCE_TYPES: readonly `${chrome.declarativeNetRequest.ResourceType}`[] = [
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'media',
  'websocket',
  'other',
];

/** The rule that trims the Referer on third-party sub-resources. */
export function buildRefererRule(): chrome.declarativeNetRequest.Rule {
  return {
    id: REFERER_RULE_ID,
    priority: PRIORITY.REFERER_POLICY,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'referer', operation: 'remove' }],
    },
    condition: { domainType: 'thirdParty', resourceTypes: [...REFERER_RESOURCE_TYPES] },
  };
}

export interface RefererDeps {
  readonly storage: TypedStorage;
  readonly getDynamicRules: () => Promise<readonly chrome.declarativeNetRequest.Rule[]>;
  readonly updateDynamicRules: (
    options: chrome.declarativeNetRequest.UpdateRuleOptions,
  ) => Promise<void>;
}

export class RefererSettings {
  private readonly deps: RefererDeps;

  constructor(deps: RefererDeps) {
    this.deps = deps;
  }

  async policy(): Promise<RefererPolicy> {
    return (await this.deps.storage.get('refererPolicy')) ?? 'default';
  }

  async setPolicy(policy: RefererPolicy): Promise<void> {
    await this.deps.storage.set('refererPolicy', policy);
    await this.applyStored();
  }

  /** Adds or removes the referer rule so it matches the stored policy. */
  async applyStored(): Promise<void> {
    const on = (await this.policy()) === 'third-party';
    const installed = await this.deps.getDynamicRules();
    const present = installed.some(({ id }) => id === REFERER_RULE_ID);
    if (on === present) {
      return;
    }
    await this.deps.updateDynamicRules(
      on
        ? { addRules: [buildRefererRule()] }
        : { removeRuleIds: [REFERER_RULE_ID] },
    );
    logger.info(`referer trimming ${on ? 'enabled' : 'disabled'}`);
  }
}

/** Builds a controller backed by the real `chrome.*` APIs. */
export function createRefererSettings(): RefererSettings {
  return new RefererSettings({
    storage: new TypedStorage(),
    getDynamicRules: () => chrome.declarativeNetRequest.getDynamicRules(),
    updateDynamicRules: (options) => chrome.declarativeNetRequest.updateDynamicRules(options),
  });
}
