import { describe, expect, it } from 'vitest';

import {
  RULE_LIMITS,
  RulesValidationError,
  assertValidRules,
  validateRules,
  type RuleLimits,
  type ValidateInput,
} from '../../scripts/validate-rules';

type DnrRule = chrome.declarativeNetRequest.Rule;

function blockRule(id: number, urlFilter: string): DnrRule {
  return { id, priority: 500, action: { type: 'block' }, condition: { urlFilter } };
}

function input(enabled: boolean, rules: readonly unknown[]): ValidateInput {
  return { ruleSets: [{ id: 'ads', enabled, rules }] };
}

const errors = (report: ReturnType<typeof validateRules>): readonly string[] =>
  report.issues.filter((entry) => entry.severity === 'error').map((entry) => entry.message);

describe('validateRules — valid input', () => {
  it('accepts a well-formed ruleset and reports no issues', () => {
    const report = validateRules(input(true, [blockRule(1, '||ads.example^')]));

    expect(report.ok).toBe(true);
    expect(report.issues).toHaveLength(0);
    expect(report.stats).toEqual({
      ruleSets: 1,
      enabledRuleSets: 1,
      enabledRules: 1,
      enabledRegexRules: 0,
    });
  });

  it('accepts allowAllRequests on frame resource types', () => {
    const rule: DnrRule = {
      id: 1,
      priority: 1000,
      action: { type: 'allowAllRequests' },
      condition: { urlFilter: '||good.example^', resourceTypes: ['main_frame', 'sub_frame'] },
    };

    expect(validateRules(input(true, [rule])).ok).toBe(true);
  });

  it('counts regex rules separately and ignores disabled rulesets', () => {
    const regex: DnrRule = {
      id: 1,
      priority: 500,
      action: { type: 'block' },
      condition: { regexFilter: 'ad\\d+' },
    };
    const report = validateRules({
      ruleSets: [
        { id: 'ads', enabled: true, rules: [regex, blockRule(2, '||a.example^')] },
        { id: 'off', enabled: false, rules: [blockRule(1, '||b.example^')] },
      ],
    });

    expect(report.stats).toEqual({
      ruleSets: 2,
      enabledRuleSets: 1,
      enabledRules: 2,
      enabledRegexRules: 1,
    });
  });
});

describe('validateRules — schema violations', () => {
  it('rejects a rule without id', () => {
    const rule = { priority: 500, action: { type: 'block' }, condition: { urlFilter: '||a^' } };

    expect(errors(validateRules(input(true, [rule])))).toContainEqual(
      expect.stringContaining('rule.id'),
    );
  });

  it('rejects duplicate rule ids within a ruleset', () => {
    const report = validateRules(input(true, [blockRule(7, '||a^'), blockRule(7, '||b^')]));

    expect(errors(report)).toContainEqual(expect.stringContaining('trùng'));
  });

  it('rejects urlFilter and regexFilter in the same condition', () => {
    const rule: DnrRule = {
      id: 1,
      priority: 500,
      action: { type: 'block' },
      condition: { urlFilter: '||a^', regexFilter: 'a' },
    };

    expect(errors(validateRules(input(true, [rule])))).toContainEqual(
      expect.stringContaining('urlFilter/regexFilter'),
    );
  });

  it('rejects non-ASCII urlFilter', () => {
    expect(errors(validateRules(input(true, [blockRule(1, '||пример.com^')])))).toContainEqual(
      expect.stringContaining('ASCII'),
    );
  });

  it('rejects resourceTypes together with excludedResourceTypes', () => {
    const rule: DnrRule = {
      id: 1,
      priority: 500,
      action: { type: 'block' },
      condition: { urlFilter: '||a^', resourceTypes: ['image'], excludedResourceTypes: ['script'] },
    };

    expect(errors(validateRules(input(true, [rule])))).toContainEqual(
      expect.stringContaining('đồng thời'),
    );
  });

  it('rejects an unknown resource type', () => {
    const rule = {
      id: 1,
      priority: 500,
      action: { type: 'block' },
      condition: { urlFilter: '||a^', resourceTypes: ['nope'] },
    };

    expect(errors(validateRules(input(true, [rule])))).toContainEqual(
      expect.stringContaining('resourceTypes'),
    );
  });

  it('rejects an unknown action type', () => {
    const rule = {
      id: 1,
      priority: 500,
      action: { type: 'explode' },
      condition: { urlFilter: '||a^' },
    };

    expect(errors(validateRules(input(true, [rule])))).toContainEqual(
      expect.stringContaining('action.type'),
    );
  });

  it('requires a URL condition for block actions', () => {
    const rule: DnrRule = {
      id: 1,
      priority: 500,
      action: { type: 'block' },
      condition: { resourceTypes: ['image'] },
    };

    expect(errors(validateRules(input(true, [rule])))).toContainEqual(
      expect.stringContaining('cần urlFilter'),
    );
  });

  it('rejects allowAllRequests on a non-frame resource type', () => {
    const rule: DnrRule = {
      id: 1,
      priority: 1000,
      action: { type: 'allowAllRequests' },
      condition: { urlFilter: '||a^', resourceTypes: ['image'] },
    };

    expect(errors(validateRules(input(true, [rule])))).toContainEqual(
      expect.stringContaining('allowAllRequests'),
    );
  });
});

describe('validateRules — documented limits', () => {
  const tight: RuleLimits = {
    MAX_RULESETS: 2,
    MAX_ENABLED_RULESETS: 1,
    MAX_REGEX_RULES: 1,
    STATIC_RULE_BUDGET: 2,
  };

  it('flags too many rulesets and too many enabled rulesets', () => {
    const report = validateRules(
      {
        ruleSets: [
          { id: 'a', enabled: true, rules: [blockRule(1, '||a^')] },
          { id: 'b', enabled: true, rules: [blockRule(1, '||b^')] },
          { id: 'c', enabled: false, rules: [] },
        ],
      },
      tight,
    );

    expect(errors(report)).toContainEqual(expect.stringContaining('số ruleset 3'));
    expect(errors(report)).toContainEqual(expect.stringContaining('ruleset bật 2'));
  });

  it('flags more regex rules than allowed', () => {
    const a: DnrRule = {
      id: 1,
      priority: 500,
      action: { type: 'block' },
      condition: { regexFilter: 'a' },
    };
    const b: DnrRule = {
      id: 2,
      priority: 500,
      action: { type: 'block' },
      condition: { regexFilter: 'b' },
    };

    expect(errors(validateRules(input(true, [a, b]), tight))).toContainEqual(
      expect.stringContaining('regex rule 2'),
    );
  });

  it('flags more static rules than the budget', () => {
    const rules = [blockRule(1, '||a^'), blockRule(2, '||b^'), blockRule(3, '||c^')];

    expect(errors(validateRules(input(true, rules), tight))).toContainEqual(
      expect.stringContaining('rule tĩnh 3'),
    );
  });

  it('defaults to the documented RULE_LIMITS', () => {
    expect(RULE_LIMITS.MAX_REGEX_RULES).toBe(1_000);
    expect(RULE_LIMITS.MAX_ENABLED_RULESETS).toBe(50);
    expect(RULE_LIMITS.STATIC_RULE_BUDGET).toBe(30_000);
  });
});

describe('assertValidRules', () => {
  it('returns the report when everything is valid', () => {
    const report = assertValidRules(input(true, [blockRule(1, '||a^')]));

    expect(report.ok).toBe(true);
  });

  it('throws RulesValidationError carrying the issues', () => {
    const call = (): unknown =>
      assertValidRules(input(true, [blockRule(1, '||a^'), blockRule(1, '||b^')]));

    expect(call).toThrow(RulesValidationError);
    try {
      call();
    } catch (error) {
      expect(error).toBeInstanceOf(RulesValidationError);
      expect((error as RulesValidationError).issues.length).toBeGreaterThan(0);
    }
  });
});
