/**
 * Build-time validator for generated declarativeNetRequest rulesets.
 *
 * Turns "the build produced something Chrome will reject" into a hard failure
 * before packaging. The per-rule schema checks live in scripts/lib/dnr-schema.ts;
 * this module adds the aggregate limits (regex rules, number of rulesets, our
 * static-rule budget) and the report/throw surface used by the build step.
 *
 * Reference: developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
 * ("Rule limits" and "Types" sections).
 */

import { checkRule, isRegexRule } from './lib/dnr-schema.ts';
import type { IssueSeverity, ValidationIssue } from './lib/dnr-schema.ts';

export type { IssueSeverity, ValidationIssue } from './lib/dnr-schema.ts';

export interface RuleSetInput {
  readonly id: string;
  readonly enabled: boolean;
  readonly rules: readonly unknown[];
}

export interface ValidateInput {
  readonly ruleSets: readonly RuleSetInput[];
}

export interface ValidationStats {
  readonly ruleSets: number;
  readonly enabledRuleSets: number;
  readonly enabledRules: number;
  readonly enabledRegexRules: number;
}

export interface ValidationReport {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly stats: ValidationStats;
}

export interface RuleLimits {
  readonly MAX_RULESETS: number;
  readonly MAX_ENABLED_RULESETS: number;
  readonly MAX_REGEX_RULES: number;
  readonly STATIC_RULE_BUDGET: number;
}

/**
 * `STATIC_RULE_BUDGET` is our own build budget, not a Chrome constant: Chrome
 * only *guarantees* 30,000 static rules (GUARANTEED_MINIMUM_STATIC_RULES), so
 * staying under that keeps the extension working on every Chrome version.
 */
export const RULE_LIMITS: RuleLimits = {
  MAX_RULESETS: 100,
  MAX_ENABLED_RULESETS: 50,
  MAX_REGEX_RULES: 1_000,
  STATIC_RULE_BUDGET: 30_000,
};

function limitIssue(severity: IssueSeverity, message: string): ValidationIssue {
  return { severity, message };
}

function checkLimits(
  ruleSets: number,
  enabledRuleSets: number,
  enabledRules: number,
  enabledRegexRules: number,
  limits: RuleLimits,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (ruleSets > limits.MAX_RULESETS) {
    issues.push(limitIssue('error', `số ruleset ${ruleSets} > giới hạn ${limits.MAX_RULESETS}`));
  }
  if (enabledRuleSets > limits.MAX_ENABLED_RULESETS) {
    issues.push(
      limitIssue(
        'error',
        `số ruleset bật ${enabledRuleSets} > giới hạn ${limits.MAX_ENABLED_RULESETS}`,
      ),
    );
  }
  if (enabledRegexRules > limits.MAX_REGEX_RULES) {
    issues.push(
      limitIssue(
        'error',
        `số regex rule ${enabledRegexRules} > giới hạn ${limits.MAX_REGEX_RULES}`,
      ),
    );
  }
  if (enabledRules > limits.STATIC_RULE_BUDGET) {
    issues.push(
      limitIssue('error', `số rule tĩnh ${enabledRules} > ngân sách ${limits.STATIC_RULE_BUDGET}`),
    );
  }
  return issues;
}

/** Validates every ruleset; `ok` is false when any error was found. */
export function validateRules(
  input: ValidateInput,
  limits: RuleLimits = RULE_LIMITS,
): ValidationReport {
  const issues: ValidationIssue[] = [];
  let enabledRuleSets = 0;
  let enabledRules = 0;
  let enabledRegexRules = 0;

  for (const ruleSet of input.ruleSets) {
    if (ruleSet.enabled) {
      enabledRuleSets += 1;
    }
    const seenIds = new Set<number>();
    for (let index = 0; index < ruleSet.rules.length; index += 1) {
      const rule = ruleSet.rules[index];
      issues.push(...checkRule(rule, index, ruleSet.id, seenIds));
      if (ruleSet.enabled) {
        enabledRules += 1;
        if (isRegexRule(rule)) {
          enabledRegexRules += 1;
        }
      }
    }
  }

  issues.push(
    ...checkLimits(input.ruleSets.length, enabledRuleSets, enabledRules, enabledRegexRules, limits),
  );

  return {
    ok: issues.every((entry) => entry.severity !== 'error'),
    issues,
    stats: {
      ruleSets: input.ruleSets.length,
      enabledRuleSets,
      enabledRules,
      enabledRegexRules,
    },
  };
}

export class RulesValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    const errors = issues.filter((entry) => entry.severity === 'error').length;
    super(`ruleset không hợp lệ: ${errors} lỗi (xem report để biết chi tiết)`);
    this.name = 'RulesValidationError';
    this.issues = issues;
  }
}

/** Throws when validation fails, so the build step exits non-zero. */
export function assertValidRules(
  input: ValidateInput,
  limits: RuleLimits = RULE_LIMITS,
): ValidationReport {
  const report = validateRules(input, limits);
  if (!report.ok) {
    throw new RulesValidationError(report.issues);
  }
  return report;
}
