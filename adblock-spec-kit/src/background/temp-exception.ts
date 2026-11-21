/**
 * Temporary malware exceptions — T031 (algorithm.md §F, US-5 / AC-5.2).
 *
 * The warning page's "continue anyway" button grants a 10-minute pass for the
 * host that was blocked: an `allowAllRequests` rule at whitelist priority
 * outranks the malware block (900), so the site loads again — but only briefly.
 * Hosts and their expiry live in `chrome.storage` (`tempExceptions`), never in a
 * module variable (Constitution 14); an alarm fires when the earliest pass
 * lapses and `applyStored` then drops the lapsed hosts, so a pass never outlives
 * its window.
 *
 * Like the whitelist, callers only publish *desired state* to `chrome.storage`
 * (the warning page calls `allow`); the worker is the only writer of the dynamic
 * rules, through `applyStored`. Every dependency is injected so the class can be
 * unit-tested without a browser.
 */

import { PRIORITY } from '../shared/constants';
import { logger } from '../shared/logger';
import { TypedStorage } from '../shared/storage';

/** How long a "continue anyway" pass lasts (algorithm.md §F). */
export const TEMP_EXCEPTION_MS = 10 * 60 * 1000;

/** One-shot alarm that clears a pass once it lapses. */
export const TEMP_EXCEPTION_ALARM = 'temp-exception-expiry';

/**
 * Dynamic rule ids live in their own private range so they never collide with
 * the whitelist's (base 1_000_000) or the static rulesets' ids.
 */
export const TEMP_EXCEPTION_RULE_ID_BASE = 2_000_000;
const TEMP_EXCEPTION_RULE_ID_RANGE = 1_000_000;

/** Resource types an `allowAllRequests` rule may use (sub_frame/main_frame). */
const FRAME_RESOURCE_TYPES: readonly `${chrome.declarativeNetRequest.ResourceType}`[] = [
  'main_frame',
  'sub_frame',
];

/**
 * Deterministic FNV-1a hash of the host, mapped into the private id range, so
 * the same host always maps to the same rule id (idempotent re-application).
 */
export function tempExceptionRuleId(host: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < host.length; index += 1) {
    hash ^= host.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return TEMP_EXCEPTION_RULE_ID_BASE + (hash % TEMP_EXCEPTION_RULE_ID_RANGE);
}

/** Builds the `allowAllRequests` rule that lets one host through temporarily. */
export function buildTempAllowRule(host: string): chrome.declarativeNetRequest.Rule {
  return {
    id: tempExceptionRuleId(host),
    priority: PRIORITY.WHITELIST_ALLOW_ALL,
    action: { type: 'allowAllRequests' },
    condition: {
      requestDomains: [host],
      resourceTypes: [...FRAME_RESOURCE_TYPES],
    },
  };
}

/** Whether an id belongs to this module's private dynamic-rule range. */
function isTempExceptionRuleId(id: number): boolean {
  return (
    id >= TEMP_EXCEPTION_RULE_ID_BASE &&
    id < TEMP_EXCEPTION_RULE_ID_BASE + TEMP_EXCEPTION_RULE_ID_RANGE
  );
}

export interface TempExceptionDeps {
  readonly storage: TypedStorage;
  readonly getDynamicRules: () => Promise<readonly chrome.declarativeNetRequest.Rule[]>;
  readonly updateDynamicRules: (
    options: chrome.declarativeNetRequest.UpdateRuleOptions,
  ) => Promise<void>;
  readonly now: () => number;
  readonly setAlarm: (whenMs: number) => void;
  readonly clearAlarm: () => Promise<unknown>;
}

export class TempException {
  private readonly deps: TempExceptionDeps;

  constructor(deps: TempExceptionDeps) {
    this.deps = deps;
  }

  /**
   * Publishes a 10-minute pass for `host` (the warning page's "continue
   * anyway"). Idempotent: re-granting the same host just extends the expiry. It
   * only writes `chrome.storage`; the worker turns that into a dynamic rule via
   * `applyStored` (its `storage.onChanged` listener), so there is a single
   * writer and no two contexts can race to add the same rule id.
   */
  async allow(host: string): Promise<void> {
    const stored = (await this.deps.storage.get('tempExceptions')) ?? {};
    await this.deps.storage.set('tempExceptions', {
      ...stored,
      [host]: this.deps.now() + TEMP_EXCEPTION_MS,
    });
    logger.info(`temporary exception granted: ${host}`);
  }

  /** The raw stored map (host -> expiry), including anything not yet pruned. */
  async stored(): Promise<Readonly<Record<string, number>>> {
    return (await this.deps.storage.get('tempExceptions')) ?? {};
  }

  /** Whether the host currently has a live pass (its rule is installed). */
  async isActive(host: string): Promise<boolean> {
    const id = tempExceptionRuleId(host);
    const installed = await this.deps.getDynamicRules();
    return installed.some((rule) => rule.id === id);
  }

  /**
   * Reconciles the dynamic rules with the live hosts: prunes lapsed entries,
   * removes the rules of hosts no longer wanted, upserts the active ones, and
   * arms (or clears) the expiry alarm. Called by the worker on install/startup,
   * when `tempExceptions` changes, and when the alarm fires; safe to re-run.
   */
  async applyStored(): Promise<void> {
    const now = this.deps.now();
    const stored = await this.deps.storage.get('tempExceptions');
    const entries = Object.entries(stored ?? {});
    const active: Record<string, number> = {};
    for (const [host, expiry] of entries) {
      if (expiry > now) {
        active[host] = expiry;
      }
    }

    if (Object.keys(active).length !== entries.length) {
      await this.deps.storage.set('tempExceptions', { ...active });
      logger.info(`temporary exceptions pruned to ${Object.keys(active).length}`);
    }

    const hosts = Object.keys(active);
    const desiredIds = new Set(hosts.map(tempExceptionRuleId));
    const installed = await this.deps.getDynamicRules();
    const staleIds = installed
      .map(({ id }) => id)
      .filter((id) => isTempExceptionRuleId(id) && !desiredIds.has(id));

    if (hosts.length > 0 || staleIds.length > 0) {
      await this.deps.updateDynamicRules({
        removeRuleIds: staleIds,
        addRules: hosts.map(buildTempAllowRule),
      });
      logger.info(`temporary exception rules applied: ${hosts.length}`);
    }

    await this.rearmAlarm(active);
  }

  /** Points the expiry alarm at the earliest live pass, or clears it. */
  private async rearmAlarm(active: Readonly<Record<string, number>>): Promise<void> {
    const expiries = Object.values(active);
    if (expiries.length === 0) {
      await this.deps.clearAlarm();
      return;
    }
    this.deps.setAlarm(Math.min(...expiries));
  }
}

/** Builds a temp-exception manager backed by the real `chrome.*` APIs. */
export function createTempException(): TempException {
  return new TempException({
    storage: new TypedStorage(),
    getDynamicRules: () => chrome.declarativeNetRequest.getDynamicRules(),
    updateDynamicRules: (options) => chrome.declarativeNetRequest.updateDynamicRules(options),
    now: () => Date.now(),
    setAlarm: (whenMs) => chrome.alarms.create(TEMP_EXCEPTION_ALARM, { when: whenMs }),
    clearAlarm: () => chrome.alarms.clear(TEMP_EXCEPTION_ALARM),
  });
}
