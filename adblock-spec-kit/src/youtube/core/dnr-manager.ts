/**
 * DNR rule manager (Phase 5 — core).
 *
 * Pure planner for the extension's *dynamic* declarativeNetRequest rules
 * (spec 11.16 / FR-032). The rules themselves are built by the registry layer
 * (`buildDnrRules`), which already skips protected playback endpoints; this
 * module adds the cross-group safety net the spec requires:
 *
 *  - every group keeps its own id range, but ids are checked for collisions;
 *  - the plan is rejected wholesale if it exceeds the configured rule cap;
 *  - no emitted rule may carry a protected endpoint in its filter (a second,
 *    independent guard so a bad registry entry can never block `googlevideo.com`
 *    or `/youtubei/v1/player`);
 *  - applying a plan is guarded, and a failed apply rolls back to the previous
 *    rule set (spec 11.16 — rollback).
 *
 * Everything above is pure; only `applyDnrPlan` talks to the injected Chrome
 * API, and even there every call is wrapped so it can never throw.
 */

import { TUNING } from '../config/tuning';
import { buildDnrRules, type DnrRule } from '../registry/rules';

export interface RuleGroup {
  readonly name: string;
  readonly endpoints: readonly string[];
  /** First rule id reserved for this group. */
  readonly startId: number;
}

export interface DnrPlan {
  readonly ok: boolean;
  readonly rules: readonly DnrRule[];
  /** Human-readable problems found while planning (empty when `ok`). */
  readonly errors: readonly string[];
}

/**
 * Builds a validated rule plan from ordered groups. Groups are flattened in
 * order; protected endpoints are dropped by `buildDnrRules`, and duplicate ids
 * or an over-cap plan make the whole plan invalid (`ok` false) so a caller can
 * refuse to apply it.
 */
export function buildDnrPlan(
  groups: readonly RuleGroup[],
  isProtected: (endpoint: string) => boolean,
  maxRules: number = TUNING.dnrMaxRules,
): DnrPlan {
  const rules: DnrRule[] = [];
  const errors: string[] = [];
  const seen = new Set<number>();

  for (const group of groups) {
    const groupRules = buildDnrRules(group.endpoints, group.startId, isProtected);
    for (const rule of groupRules) {
      if (seen.has(rule.id)) {
        errors.push(`duplicate-rule-id:${rule.id}`);
        continue;
      }
      seen.add(rule.id);
      rules.push(rule);
    }
  }

  for (const rule of rules) {
    if (rule.action.type !== 'block') {
      errors.push(`non-block-rule:${rule.id}`);
    }
    if (isProtected(rule.condition.urlFilter)) {
      errors.push(`protected-endpoint-rule:${rule.id}`);
    }
  }

  if (rules.length > maxRules) {
    errors.push(`too-many-rules:${rules.length}>${maxRules}`);
  }

  return { ok: errors.length === 0, rules, errors };
}

/** The subset of the extension's declarativeNetRequest API this module needs. */
export interface DnrApi {
  updateDynamicRules(options: {
    readonly removeRuleIds: readonly number[];
    readonly addRules: readonly DnrRule[];
  }): Promise<void>;
}

export interface DnrApplyResult {
  readonly ok: boolean;
  readonly reason?: string;
  /** True when the previous rules were restored after a failed apply. */
  readonly rolledBack: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown';
}

/**
 * Applies `next`, replacing any existing rules with the same ids. On failure it
 * restores `previous` and reports whether the rollback itself succeeded.
 */
export async function applyDnrPlan(
  api: DnrApi,
  next: readonly DnrRule[],
  previous: readonly DnrRule[] = [],
): Promise<DnrApplyResult> {
  const nextIds = next.map((rule) => rule.id);
  try {
    await api.updateDynamicRules({ removeRuleIds: nextIds, addRules: [...next] });
    return { ok: true, rolledBack: false };
  } catch (error) {
    const reason = errorMessage(error);
    try {
      const previousIds = previous.map((rule) => rule.id);
      await api.updateDynamicRules({ removeRuleIds: previousIds, addRules: [...previous] });
      return { ok: false, reason, rolledBack: true };
    } catch {
      return { ok: false, reason, rolledBack: false };
    }
  }
}
