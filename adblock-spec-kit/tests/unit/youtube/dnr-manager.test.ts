import { describe, expect, it } from 'vitest';

import {
  applyDnrPlan,
  buildDnrPlan,
  type DnrApi,
  type RuleGroup,
} from '../../../src/youtube/core/dnr-manager';
import type { DnrRule } from '../../../src/youtube/registry/rules';

const noneProtected = (): boolean => false;

function rule(id: number, urlFilter: string): DnrRule {
  return { id, priority: 1, action: { type: 'block' }, condition: { urlFilter } };
}

describe('buildDnrPlan — planning', () => {
  it('flattens groups into a valid plan with contiguous ids', () => {
    const groups: RuleGroup[] = [
      { name: 'a', endpoints: ['/a1', '/a2'], startId: 1 },
      { name: 'b', endpoints: ['/b1'], startId: 11 },
    ];
    const plan = buildDnrPlan(groups, noneProtected);

    expect(plan.ok).toBe(true);
    expect(plan.errors).toEqual([]);
    expect(plan.rules.map((r) => r.id)).toEqual([1, 2, 11]);
    expect(plan.rules.map((r) => r.condition.urlFilter)).toEqual(['/a1', '/a2', '/b1']);
  });

  it('drops protected endpoints without consuming an id', () => {
    const groups: RuleGroup[] = [{ name: 'a', endpoints: ['/ok', '/player', '/also'], startId: 5 }];
    const plan = buildDnrPlan(groups, (endpoint) => endpoint === '/player');

    expect(plan.ok).toBe(true);
    expect(plan.rules.map((r) => r.id)).toEqual([5, 6]);
    expect(plan.rules.map((r) => r.condition.urlFilter)).toEqual(['/ok', '/also']);
  });

  it('rejects a plan whose rule ids collide across groups', () => {
    const groups: RuleGroup[] = [
      { name: 'a', endpoints: ['/a1', '/a2'], startId: 1 },
      { name: 'b', endpoints: ['/b1'], startId: 2 },
    ];
    const plan = buildDnrPlan(groups, noneProtected);

    expect(plan.ok).toBe(false);
    expect(plan.errors).toContain('duplicate-rule-id:2');
  });

  it('rejects a plan that exceeds the rule cap', () => {
    const groups: RuleGroup[] = [
      { name: 'a', endpoints: ['/a1', '/a2', '/a3'], startId: 1 },
    ];
    const plan = buildDnrPlan(groups, noneProtected, 2);

    expect(plan.ok).toBe(false);
    expect(plan.errors).toContain('too-many-rules:3>2');
  });
});

describe('applyDnrPlan — apply & rollback', () => {
  function recordingApi(failOn: 'first' | 'both' | null): {
    api: DnrApi;
    calls: Array<{ removeRuleIds: readonly number[]; addRules: readonly DnrRule[] }>;
  } {
    const calls: Array<{ removeRuleIds: readonly number[]; addRules: readonly DnrRule[] }> = [];
    let attempt = 0;
    const api: DnrApi = {
      async updateDynamicRules(options): Promise<void> {
        attempt += 1;
        calls.push(options);
        const shouldFail = failOn === 'both' || (failOn === 'first' && attempt === 1);
        if (shouldFail) {
          throw new Error('dnr rejected');
        }
      },
    };
    return { api, calls };
  }

  it('applies the next rules and reports success', async () => {
    const { api, calls } = recordingApi(null);
    const next = [rule(1, '/a1')];
    const result = await applyDnrPlan(api, next);

    expect(result).toEqual({ ok: true, rolledBack: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.removeRuleIds).toEqual([1]);
    expect(calls[0]!.addRules).toEqual(next);
  });

  it('restores the previous rules when an apply fails', async () => {
    const { api, calls } = recordingApi('first');
    const previous = [rule(9, '/old')];
    const result = await applyDnrPlan(api, [rule(1, '/a1')], previous);

    expect(result.ok).toBe(false);
    expect(result.rolledBack).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.addRules).toEqual(previous);
    expect(calls[1]!.removeRuleIds).toEqual([9]);
  });

  it('reports no rollback when the restore itself fails', async () => {
    const { api } = recordingApi('both');
    const result = await applyDnrPlan(api, [rule(1, '/a1')], [rule(9, '/old')]);

    expect(result.ok).toBe(false);
    expect(result.rolledBack).toBe(false);
    expect(result.reason).toBe('dnr rejected');
  });
});
