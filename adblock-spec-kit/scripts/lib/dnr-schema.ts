/**
 * Per-rule schema checks for declarativeNetRequest rulesets.
 *
 * These are the constraints the TypeScript types cannot express but Chrome
 * enforces at load time: exactly one of urlFilter/regexFilter, valid
 * action/resource types, frame-only `allowAllRequests`, ASCII URLs, unique ids.
 * Reference: developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
 * (the "Types" and "Rule limits" sections).
 *
 * Kept separate from scripts/validate-rules.ts so each file stays under the
 * 300-line budget; the aggregate limits and the public report live there.
 */

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  readonly severity: IssueSeverity;
  readonly message: string;
  readonly ruleSetId?: string;
  readonly ruleId?: number;
}

interface RuleLocation {
  readonly ruleSetId: string;
  readonly ruleId?: number;
}

type DnrActionType = `${chrome.declarativeNetRequest.RuleActionType}`;
type DnrResourceType = `${chrome.declarativeNetRequest.ResourceType}`;

// `satisfies` guarantees these lists only contain real DNR values.
const ACTION_TYPES = [
  'block',
  'redirect',
  'allow',
  'upgradeScheme',
  'modifyHeaders',
  'allowAllRequests',
] as const satisfies readonly DnrActionType[];

const RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other',
] as const satisfies readonly DnrResourceType[];

const ACTION_TYPE_SET = new Set<string>(ACTION_TYPES);
const RESOURCE_TYPE_SET = new Set<string>(RESOURCE_TYPES);

/** Actions that only make sense with a URL condition. */
const URL_CONDITION_ACTIONS = new Set<string>(['block', 'allow', 'redirect']);
const FRAME_RESOURCE_TYPES = new Set<string>(['main_frame', 'sub_frame']);

/** `urlFilter`/`regexFilter` only accept printable ASCII. */
const PRINTABLE_ASCII = /^[\x21-\x7e]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isAsciiUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && PRINTABLE_ASCII.test(value);
}

function isValidResourceTypeList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'string' && RESOURCE_TYPE_SET.has(item))
  );
}

function issue(severity: IssueSeverity, message: string, at?: RuleLocation): ValidationIssue {
  if (at === undefined) {
    return { severity, message };
  }
  return at.ruleId === undefined
    ? { severity, message, ruleSetId: at.ruleSetId }
    : { severity, message, ruleSetId: at.ruleSetId, ruleId: at.ruleId };
}

function checkResourceTypes(
  condition: Record<string, unknown>,
  at: RuleLocation,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const included = condition['resourceTypes'];
  const excluded = condition['excludedResourceTypes'];

  if (included !== undefined && excluded !== undefined) {
    issues.push(
      issue('error', 'không được đồng thời có resourceTypes và excludedResourceTypes', at),
    );
  }
  if (included !== undefined && !isValidResourceTypeList(included)) {
    issues.push(issue('error', 'resourceTypes không hợp lệ', at));
  }
  if (excluded !== undefined && !isValidResourceTypeList(excluded)) {
    issues.push(issue('error', 'excludedResourceTypes không hợp lệ', at));
  }
  return issues;
}

function checkCondition(condition: unknown, at: RuleLocation): ValidationIssue[] {
  if (!isRecord(condition)) {
    return [issue('error', 'condition phải là object', at)];
  }
  const issues: ValidationIssue[] = [];
  const hasUrl = 'urlFilter' in condition;
  const hasRegex = 'regexFilter' in condition;

  if (hasUrl && hasRegex) {
    issues.push(issue('error', 'chỉ được có một trong urlFilter/regexFilter', at));
  }
  if (hasUrl && !isAsciiUrl(condition['urlFilter'])) {
    issues.push(issue('error', 'urlFilter phải là chuỗi ASCII không rỗng', at));
  }
  if (hasRegex && !isAsciiUrl(condition['regexFilter'])) {
    issues.push(issue('error', 'regexFilter phải là chuỗi ASCII không rỗng', at));
  }
  issues.push(...checkResourceTypes(condition, at));
  return issues;
}

function checkAction(action: unknown, condition: unknown, at: RuleLocation): ValidationIssue[] {
  if (!isRecord(action)) {
    return [issue('error', 'action phải là object', at)];
  }
  const type = action['type'];
  if (typeof type !== 'string' || !ACTION_TYPE_SET.has(type)) {
    return [issue('error', `action.type không hợp lệ: ${String(type)}`, at)];
  }

  const issues: ValidationIssue[] = [];
  const hasUrlCondition =
    isRecord(condition) && ('urlFilter' in condition || 'regexFilter' in condition);

  if (URL_CONDITION_ACTIONS.has(type) && !hasUrlCondition) {
    issues.push(issue('error', `action ${type} cần urlFilter hoặc regexFilter`, at));
  }
  if (type === 'allowAllRequests' && isRecord(condition)) {
    const types = condition['resourceTypes'];
    const framesOnly =
      isValidResourceTypeList(types) && types.every((t) => FRAME_RESOURCE_TYPES.has(t));
    if (!framesOnly) {
      issues.push(
        issue('error', 'allowAllRequests chỉ cho phép resourceTypes main_frame/sub_frame', at),
      );
    }
  }
  return issues;
}

/** Schema-checks one rule; returns every issue found for it. */
export function checkRule(
  rule: unknown,
  index: number,
  ruleSetId: string,
  seenIds: Set<number>,
): ValidationIssue[] {
  if (!isRecord(rule)) {
    return [issue('error', 'rule phải là object', { ruleSetId })];
  }
  const rawId = rule['id'];
  const at: RuleLocation = isPositiveInteger(rawId) ? { ruleSetId, ruleId: rawId } : { ruleSetId };
  const issues: ValidationIssue[] = [];

  if (!isPositiveInteger(rawId)) {
    issues.push(issue('error', `rule.id phải là số nguyên >= 1 (vị trí ${index})`, at));
  } else if (seenIds.has(rawId)) {
    issues.push(issue('error', `rule.id trùng: ${rawId}`, at));
  } else {
    seenIds.add(rawId);
  }

  if (rule['priority'] !== undefined && !isPositiveInteger(rule['priority'])) {
    issues.push(issue('error', 'rule.priority phải là số nguyên >= 1', at));
  }

  issues.push(...checkCondition(rule['condition'], at));
  issues.push(...checkAction(rule['action'], rule['condition'], at));
  return issues;
}

/** A rule that uses a regexFilter counts against the regex-rule limit. */
export function isRegexRule(rule: unknown): boolean {
  return isRecord(rule) && isRecord(rule['condition']) && 'regexFilter' in rule['condition'];
}
