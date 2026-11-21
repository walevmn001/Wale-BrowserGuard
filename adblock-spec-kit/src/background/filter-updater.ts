/**
 * Filter-list updater — T023 (algorithm.md §E, US-7 / AC-7.1, AC-7.2).
 *
 * On a schedule (or on demand) it downloads every source, validates it — size,
 * format, minimum rule count, optional SHA-256 checksum — and *only when every
 * source is valid* atomically replaces the stored "active" descriptor and
 * records the version time. Any failure keeps the previous descriptor intact
 * (AC-7.2) and re-arms the alarm with backoff 1h → 6h → 24h.
 *
 * All downloads stay local to the machine (Constitution II); nothing ships the
 * list or usage anywhere. The updater keeps no module state: the active
 * descriptor, failure count and next-attempt time all live in `chrome.storage`
 * (Constitution 14).
 *
 * Scope note: this task keeps the descriptor (per-group byte/rule counts and a
 * checksum) fresh and safe; turning a downloaded list into runtime DNR rules is
 * out of scope for v1 (the shipped rulesets are built at build time).
 */

import { logger } from '../shared/logger';
import { TypedStorage } from '../shared/storage';
import type { FilterActiveSnapshot, FilterGroupInfo } from '../shared/types';

/** Alarm that drives the scheduled update (AC-7.1). */
export const UPDATE_ALARM = 'update-filters';
/** Default cadence: once a day (AC-7.1). */
export const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Per-source download timeout (algorithm.md §E). */
export const FETCH_TIMEOUT_MS = 15_000;
/** Retry delays after consecutive failures: 1h → 6h → 24h (algorithm.md §E). */
export const BACKOFF_MS: readonly number[] = [3_600_000, 21_600_000, 86_400_000];

/** One downloadable list and the limits it must satisfy to be accepted. */
export interface FilterSource {
  readonly id: string;
  readonly url: string;
  readonly maxBytes: number;
  readonly minRules: number;
  /** Optional expected SHA-256 hex; when set, a mismatch rejects the source. */
  readonly checksum?: string;
}

/** Why a source was rejected. */
export type RejectionReason =
  'http-error' | 'network' | 'timeout' | 'too-large' | 'corrupt' | 'too-few-rules' | 'checksum';

/** Health of the active filter set, for the options page (T024). */
export interface FilterStatus {
  readonly updatedAt: number | undefined;
  readonly groups: Readonly<Record<string, FilterGroupInfo>>;
  readonly failures: number;
}

export interface UpdateResult {
  readonly ok: boolean;
  readonly reason?: RejectionReason;
  readonly nextAttemptAt?: number;
}

export interface FilterUpdaterDeps {
  readonly storage: TypedStorage;
  readonly fetchText: (url: string) => Promise<string>;
  readonly hash: (text: string) => Promise<string>;
  readonly now: () => number;
  readonly setAlarm: (delayMs: number, periodic: boolean) => void;
  readonly getAlarm: (name: string) => Promise<unknown>;
}

type SourceOutcome =
  | { readonly ok: true; readonly info: FilterGroupInfo }
  | { readonly ok: false; readonly reason: RejectionReason };

const encoder = new TextEncoder();

/** UTF-8 size of `text`, the unit the size limit is measured in. */
export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/** Counts substantive lines (rules), ignoring blanks, comments and headers. */
export function countRules(text: string): number {
  let rules = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('!') || trimmed.startsWith('[')) {
      continue;
    }
    rules += 1;
  }
  return rules;
}

/** Retry delay for `failures` consecutive failures, clamped to the last step. */
export function nextDelayMs(failures: number): number {
  const step = Math.min(Math.max(failures, 1), BACKOFF_MS.length) - 1;
  return BACKOFF_MS[step] ?? UPDATE_INTERVAL_MS;
}

/** Maps a thrown fetch error onto a rejection reason. */
export function classifyFetchError(error: unknown): RejectionReason {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return 'timeout';
    }
    if (/^HTTP \d/.test(error.message)) {
      return 'http-error';
    }
  }
  return 'network';
}

/** Validates one downloaded list against its source limits (algorithm.md §E). */
export async function validateText(
  text: string,
  source: FilterSource,
  hash: (text: string) => Promise<string>,
): Promise<SourceOutcome> {
  const bytes = byteLength(text);
  if (bytes > source.maxBytes) {
    return { ok: false, reason: 'too-large' };
  }
  if (text.includes('\u0000')) {
    return { ok: false, reason: 'corrupt' };
  }
  const rules = countRules(text);
  if (rules < source.minRules) {
    return { ok: false, reason: 'too-few-rules' };
  }
  const checksum = await hash(text);
  if (source.checksum !== undefined && source.checksum !== checksum) {
    return { ok: false, reason: 'checksum' };
  }
  return { ok: true, info: { bytes, rules, checksum } };
}

export class FilterUpdater {
  private readonly deps: FilterUpdaterDeps;
  private readonly sources: readonly FilterSource[];
  /** Serialises overlapping updates; transient coordination only (Const. 14). */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(deps: FilterUpdaterDeps, sources: readonly FilterSource[]) {
    this.deps = deps;
    this.sources = sources;
  }

  /** Runs one update attempt, queued so runs never overlap. */
  updateNow(): Promise<UpdateResult> {
    const run = this.queue.then(() => this.runUpdate());
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Current descriptor + failure count, for display. */
  async status(): Promise<FilterStatus> {
    const active = await this.deps.storage.get('filterActive');
    return {
      updatedAt: active?.updatedAt,
      groups: active?.groups ?? {},
      failures: (await this.deps.storage.get('filterFailures')) ?? 0,
    };
  }

  /** Arms the periodic schedule if none exists (install / startup). */
  async scheduleInitial(): Promise<void> {
    const existing = await this.deps.getAlarm(UPDATE_ALARM);
    if (existing === undefined) {
      this.deps.setAlarm(UPDATE_INTERVAL_MS, true);
    }
  }

  private async runUpdate(): Promise<UpdateResult> {
    const groups: Record<string, FilterGroupInfo> = {};
    for (const source of this.sources) {
      const outcome = await this.loadSource(source);
      if (!outcome.ok) {
        return this.onFailure(outcome.reason);
      }
      groups[source.id] = outcome.info;
    }
    return this.onSuccess(groups);
  }

  private async loadSource(source: FilterSource): Promise<SourceOutcome> {
    let text: string;
    try {
      text = await this.deps.fetchText(source.url);
    } catch (error) {
      return { ok: false, reason: classifyFetchError(error) };
    }
    return validateText(text, source, this.deps.hash);
  }

  private async onSuccess(groups: Record<string, FilterGroupInfo>): Promise<UpdateResult> {
    const updatedAt = this.deps.now();
    const snapshot: FilterActiveSnapshot = { updatedAt, groups };
    // Single-key write: the active set flips in one atomic step, never half-set.
    await this.deps.storage.set('filterActive', snapshot);
    await this.deps.storage.set('filterFailures', 0);
    await this.deps.storage.set('filterNextAttemptAt', updatedAt + UPDATE_INTERVAL_MS);
    this.deps.setAlarm(UPDATE_INTERVAL_MS, true);
    logger.info(`filters: updated ${Object.keys(groups).length} group(s)`);
    return { ok: true };
  }

  private async onFailure(reason: RejectionReason): Promise<UpdateResult> {
    const failures = ((await this.deps.storage.get('filterFailures')) ?? 0) + 1;
    const delayMs = nextDelayMs(failures);
    const nextAttemptAt = this.deps.now() + delayMs;
    await this.deps.storage.set('filterFailures', failures);
    await this.deps.storage.set('filterNextAttemptAt', nextAttemptAt);
    this.deps.setAlarm(delayMs, false);
    logger.warn(
      `filters: update failed (${reason}); keeping the previous set, retrying in ${Math.round(
        delayMs / 60_000,
      )}m`,
    );
    return { ok: false, reason, nextAttemptAt };
  }
}

async function fetchTextWithTimeout(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createChromeAlarm(delayMs: number, periodic: boolean): void {
  const minutes = Math.max(1, Math.round(delayMs / 60_000));
  if (periodic) {
    chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: minutes });
  } else {
    chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: minutes });
  }
}

/**
 * Sources per clarify.md (EasyList, EasyPrivacy, URLhaus). Sizes/minimums are
 * generous guardrails: a truncated or proxied error page fails validation, so a
 * bad download never replaces a good set.
 */
export const DEFAULT_SOURCES: readonly FilterSource[] = [
  {
    id: 'easylist',
    url: 'https://easylist.to/easylist/easylist.txt',
    maxBytes: 8_000_000,
    minRules: 1000,
  },
  {
    id: 'easyprivacy',
    url: 'https://easylist.to/easylist/easyprivacy.txt',
    maxBytes: 8_000_000,
    minRules: 1000,
  },
  {
    id: 'urlhaus',
    url: 'https://urlhaus.abuse.ch/downloads/hostfile/',
    maxBytes: 8_000_000,
    minRules: 100,
  },
];

/** Builds an updater backed by the real `chrome.*` APIs (used by the worker). */
export function createFilterUpdater(
  sources: readonly FilterSource[] = DEFAULT_SOURCES,
): FilterUpdater {
  return new FilterUpdater(
    {
      storage: new TypedStorage(),
      fetchText: fetchTextWithTimeout,
      hash: sha256Hex,
      now: () => Date.now(),
      setAlarm: createChromeAlarm,
      getAlarm: (name) => chrome.alarms.get(name),
    },
    sources,
  );
}
