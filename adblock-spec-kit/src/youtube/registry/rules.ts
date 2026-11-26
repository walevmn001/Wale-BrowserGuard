/**
 * DNR rule builder for the YouTube engine (Phase 1 — registry layer).
 *
 * Pure: the builder takes the endpoint list and a protection predicate and
 * returns plain rule objects, so it can be unit-tested without the extension
 * APIs. Playback endpoints are dropped defensively, and no rule sets
 * `resourceTypes`, so — like the shipped ad/tracker rulesets — a rule here only
 * ever applies to sub-resources and can never take down main-frame navigation.
 */

export interface DnrRule {
  readonly id: number;
  readonly priority: number;
  readonly action: { readonly type: 'block' };
  readonly condition: { readonly urlFilter: string };
}

/** Priority for every generated block rule (bigger wins). */
const RULE_PRIORITY = 1;

/**
 * Builds one block rule per non-protected endpoint, with ids sequential from
 * `startId`. Protected endpoints are skipped entirely (and do not consume an
 * id), and ids stay contiguous over the emitted rules.
 */
export function buildDnrRules(
  endpoints: readonly string[],
  startId: number,
  isProtected: (endpoint: string) => boolean,
): DnrRule[] {
  const rules: DnrRule[] = [];
  let id = startId;
  for (const endpoint of endpoints) {
    if (isProtected(endpoint)) {
      continue;
    }
    rules.push({
      id,
      priority: RULE_PRIORITY,
      action: { type: 'block' },
      // No `resourceTypes`: sub-resource only.
      condition: { urlFilter: endpoint },
    });
    id += 1;
  }
  return rules;
}
