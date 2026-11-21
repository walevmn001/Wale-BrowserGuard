/**
 * Custom rules (Phase 9 §5).
 *
 * A deliberately small subset of ABP syntax is supported so the extension can
 * translate a rule into a declarativeNetRequest rule without running any code:
 *
 *   ||example.com^     block requests to example.com and its subdomains
 *   example.com        the same, without the anchors
 *   @@||example.com^   allow (exception) for example.com
 *
 * Anything carrying `$` options, wildcards, paths or regular expressions is
 * rejected — "block too little over block too much", and no user input is ever
 * evaluated as code (Constitution 11).
 */

import { PRIORITY } from '../shared/constants';
import { logger } from '../shared/logger';
import { TypedStorage } from '../shared/storage';
import type { CustomRule } from '../shared/types';

/** Dynamic-rule id range for custom rules (see whitelist/temp-exception ranges). */
export const CUSTOM_RULE_ID_BASE = 3_000_000;
const CUSTOM_RULE_ID_RANGE = 1_000_000;

/** A rule as the UI sends it: text plus the stored id/enabled flag. */
export type RuleValidation =
  | { readonly ok: true; readonly rule: Omit<CustomRule, 'id' | 'enabled'> }
  | { readonly ok: false; readonly reason: 'invalid' | 'unsupported' | 'tooBroad' };

const HOST_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/** Parses a host-suffix rule into `{ domain, allow }`, or a failure reason. */
export function parseRule(text: string): RuleValidation {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === '') {
    return { ok: false, reason: 'invalid' };
  }
  const allow = trimmed.startsWith('@@');
  const body = allow ? trimmed.slice(2) : trimmed;
  // Reject anything richer than a bare hostname: options, wildcards, paths,
  // regex, ports — all of which the small translation below cannot express.
  if (/[$*[\](){}|\\/?:^~"]/.test(body.replace(/\^$/, ''))) {
    return { ok: false, reason: 'unsupported' };
  }
  const domain = body.replace(/^\|\|/, '').replace(/\^$/, '');
  if (!HOST_RE.test(domain)) {
    return { ok: false, reason: 'invalid' };
  }
  // A single-label host (a bare TLD like `com`) would block half the web.
  if (domain.split('.').length < 2) {
    return { ok: false, reason: 'tooBroad' };
  }
  return { ok: true, rule: { text: `${allow ? '@@' : ''}||${domain}^` } };
}

/** Deterministic FNV-1a id in the custom-rule range, stable across sessions. */
export function customRuleId(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return CUSTOM_RULE_ID_BASE + (hash % CUSTOM_RULE_ID_RANGE);
}

/** Builds the DNR rule for one stored custom rule. */
export function buildCustomRule(rule: CustomRule): chrome.declarativeNetRequest.Rule {
  const parsed = parseRule(rule.text);
  const allow = rule.text.trim().toLowerCase().startsWith('@@');
  return {
    id: customRuleId(rule.text),
    priority: allow ? PRIORITY.EXCEPTION_ALLOW : PRIORITY.BLOCK,
    action: { type: allow ? 'allow' : 'block' },
    condition: {
      urlFilter:
        parsed.ok
          ? parsed.rule.text.replace(/^@@/, '')
          : `||${rule.text.trim().toLowerCase()}^`,
      resourceTypes: [
        'main_frame',
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
      ],
    },
  };
}

function isCustomRuleId(id: number): boolean {
  return id >= CUSTOM_RULE_ID_BASE && id < CUSTOM_RULE_ID_BASE + CUSTOM_RULE_ID_RANGE;
}

export interface CustomRulesDeps {
  readonly storage: TypedStorage;
  readonly getDynamicRules: () => Promise<readonly chrome.declarativeNetRequest.Rule[]>;
  readonly updateDynamicRules: (
    options: chrome.declarativeNetRequest.UpdateRuleOptions,
  ) => Promise<void>;
  readonly makeId: () => string;
}

export class CustomRules {
  private readonly deps: CustomRulesDeps;

  constructor(deps: CustomRulesDeps) {
    this.deps = deps;
  }

  private async stored(): Promise<CustomRule[]> {
    return [...((await this.deps.storage.get('customRules')) ?? [])];
  }

  async list(): Promise<readonly CustomRule[]> {
    return this.stored();
  }

  /** Validates and appends a rule; returns the failure reason when invalid. */
  async add(text: string): Promise<RuleValidation> {
    const parsed = parseRule(text);
    if (!parsed.ok) {
      return parsed;
    }
    const current = await this.stored();
    if (current.some((rule) => rule.text === parsed.rule.text)) {
      return { ok: true, rule: parsed.rule };
    }
    const next = [
      ...current,
      { id: this.deps.makeId(), text: parsed.rule.text, enabled: true },
    ];
    await this.deps.storage.set('customRules', next);
    await this.applyStored();
    return parsed;
  }

  async remove(id: string): Promise<void> {
    await this.deps.storage.set(
      'customRules',
      (await this.stored()).filter((rule) => rule.id !== id),
    );
    await this.applyStored();
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.deps.storage.set(
      'customRules',
      (await this.stored()).map((rule) => (rule.id === id ? { ...rule, enabled } : rule)),
    );
    await this.applyStored();
  }

  /** Replaces the whole list (import); entries are re-validated. */
  async replaceAll(texts: readonly string[]): Promise<void> {
    const next: CustomRule[] = [];
    for (const text of texts) {
      const parsed = parseRule(text);
      if (parsed.ok) {
        next.push({ id: this.deps.makeId(), text: parsed.rule.text, enabled: true });
      }
    }
    await this.deps.storage.set('customRules', next);
    await this.applyStored();
  }

  /** Reconciles the dynamic rules with the enabled stored rules. */
  async applyStored(): Promise<void> {
    const enabled = (await this.stored()).filter((rule) => rule.enabled);
    const desired = new Map(enabled.map((rule) => [customRuleId(rule.text), buildCustomRule(rule)]));
    const installed = await this.deps.getDynamicRules();
    const stale = installed.map(({ id }) => id).filter((id) => isCustomRuleId(id) && !desired.has(id));
    if (desired.size === 0 && stale.length === 0) {
      return;
    }
    await this.deps.updateDynamicRules({
      removeRuleIds: stale,
      addRules: [...desired.values()],
    });
    logger.info(`custom rules applied: ${desired.size}`);
  }
}

/** Builds a manager backed by the real `chrome.*` APIs. */
export function createCustomRules(): CustomRules {
  return new CustomRules({
    storage: new TypedStorage(),
    getDynamicRules: () => chrome.declarativeNetRequest.getDynamicRules(),
    updateDynamicRules: (options) => chrome.declarativeNetRequest.updateDynamicRules(options),
    makeId: () => crypto.randomUUID(),
  });
}
