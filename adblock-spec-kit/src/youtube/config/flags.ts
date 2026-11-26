/**
 * Feature flags for the rebuilt YouTube engine (Phase 1 — config layer).
 *
 * Everything below `main/` is deliberately world-independent: this module is
 * pure logic and never touches page or extension globals. Flags arrive from a
 * flag adapter (T004) as a validated snapshot, but the engine always has an
 * effective value — with no snapshot every flag is ON (spec A-3), so a missing
 * or broken adapter can only ever *reduce* protection through an explicit
 * snapshot.
 *
 * `applyRemote` is all-or-nothing: a snapshot that does not exactly match the
 * schema version, the twelve flag names and their boolean types is rejected
 * wholesale and the previous values are kept, so a partially applied config is
 * never possible.
 */

export const FLAG_SCHEMA_VERSION = 1;

export const FLAG_NAMES = [
  'ENABLE_JSON_PRUNER',
  'ENABLE_FETCH_HOOK',
  'ENABLE_XHR_HOOK',
  'ENABLE_DNR',
  'ENABLE_RUNTIME_GUARD',
  'ENABLE_PLAYBACK_WATCHDOG',
  'ENABLE_RECOVERY',
  'ENABLE_CSS_HIDER',
  'ENABLE_AD_STATE_MACHINE',
  'ENABLE_SPA_NAVIGATION',
  'ENABLE_DOM_OBSERVER',
  'ENABLE_DEBUG_LOGGER',
] as const;

export type FlagName = (typeof FLAG_NAMES)[number];

/**
 * Effective defaults with no adapter snapshot. Spec A-3: when no snapshot
 * exists the MAIN-world flags are effectively ON, so the engine is never left
 * silently disabled by a missing adapter.
 */
export const DEFAULT_FLAGS: Readonly<Record<FlagName, boolean>> = {
  ENABLE_JSON_PRUNER: true,
  ENABLE_FETCH_HOOK: true,
  ENABLE_XHR_HOOK: true,
  ENABLE_DNR: true,
  ENABLE_RUNTIME_GUARD: true,
  ENABLE_PLAYBACK_WATCHDOG: true,
  ENABLE_RECOVERY: true,
  ENABLE_CSS_HIDER: true,
  ENABLE_AD_STATE_MACHINE: true,
  ENABLE_SPA_NAVIGATION: true,
  ENABLE_DOM_OBSERVER: true,
  ENABLE_DEBUG_LOGGER: true,
};

/** A validated set of flags as produced by an adapter. */
export interface FlagSnapshot {
  readonly schemaVersion: number;
  readonly flags: Readonly<Record<FlagName, boolean>>;
  readonly source: 'default' | 'adapter';
  readonly receivedAt: number;
}

/** Outcome of `FeatureFlags.applyRemote`; `reason` explains a rejection. */
export interface ApplyResult {
  readonly ok: boolean;
  readonly reason?: string;
}

const FLAG_NAME_SET: ReadonlySet<string> = new Set<string>(FLAG_NAMES);

/** True for a non-null object, the only shapes a snapshot may have. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export class FeatureFlags {
  private current: Record<FlagName, boolean>;
  private readonly now: () => number;
  private source: 'default' | 'adapter' = 'default';
  private receivedAt = 0;
  private readonly subscribers = new Set<(changed: readonly FlagName[]) => void>();
  private readonly unknownNames = new Set<string>();
  private readonly unknownWarnings: string[] = [];

  constructor(
    defaults: Readonly<Record<FlagName, boolean>> = DEFAULT_FLAGS,
    now: () => number = Date.now,
  ) {
    this.current = { ...defaults };
    this.now = now;
  }

  /**
   * Current value of `name`. An unknown flag name is never fatal: it returns
   * `false` and records a warning once per distinct unknown name.
   */
  get(name: FlagName): boolean {
    try {
      if (!FLAG_NAME_SET.has(name)) {
        const unknown = String(name);
        if (!this.unknownNames.has(unknown)) {
          this.unknownNames.add(unknown);
          this.unknownWarnings.push(unknown);
        }
        return false;
      }
      return this.current[name];
    } catch {
      return false;
    }
  }

  /** Unknown flag names seen so far, each reported once (insertion order). */
  unknownFlagWarnings(): readonly string[] {
    return [...this.unknownWarnings];
  }

  /**
   * Applies an adapter snapshot. Validates the schema version, the exact
   * twelve keys and their boolean types; on any violation the previous values
   * are kept and a descriptive reason is returned. Subscribers are notified
   * only when at least one value actually changed.
   */
  applyRemote(snapshot: unknown): ApplyResult {
    try {
      if (!isRecord(snapshot)) {
        return { ok: false, reason: 'shape' };
      }
      if (snapshot['schemaVersion'] !== FLAG_SCHEMA_VERSION) {
        return { ok: false, reason: 'schemaVersion' };
      }
      const rawFlags = snapshot['flags'];
      if (!isRecord(rawFlags)) {
        return { ok: false, reason: 'shape' };
      }
      for (const name of FLAG_NAMES) {
        if (!Object.prototype.hasOwnProperty.call(rawFlags, name)) {
          return { ok: false, reason: 'missing-keys' };
        }
      }
      for (const key of Object.keys(rawFlags)) {
        if (!FLAG_NAME_SET.has(key)) {
          return { ok: false, reason: 'extra-keys' };
        }
      }
      const next = {} as Record<FlagName, boolean>;
      for (const name of FLAG_NAMES) {
        const value = rawFlags[name];
        if (typeof value !== 'boolean') {
          return { ok: false, reason: 'bad-type' };
        }
        next[name] = value;
      }

      const changed: FlagName[] = [];
      for (const name of FLAG_NAMES) {
        if (this.current[name] !== next[name]) {
          changed.push(name);
        }
      }

      this.current = next;
      this.source = 'adapter';
      this.receivedAt = this.now();
      if (changed.length > 0) {
        this.notify(changed);
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: 'shape' };
    }
  }

  /** A defensive copy of the current flags, source and timestamp. */
  snapshot(): FlagSnapshot {
    const flags = {} as Record<FlagName, boolean>;
    for (const name of FLAG_NAMES) {
      flags[name] = this.current[name];
    }
    return {
      schemaVersion: FLAG_SCHEMA_VERSION,
      flags,
      source: this.source,
      receivedAt: this.receivedAt,
    };
  }

  /** Registers a change handler; returns an unsubscribe function. */
  subscribe(handler: (changed: readonly FlagName[]) => void): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  /** Clears all subscribers. Idempotent. */
  dispose(): void {
    this.subscribers.clear();
  }

  private notify(changed: readonly FlagName[]): void {
    for (const handler of [...this.subscribers]) {
      try {
        handler(changed);
      } catch {
        // A faulty subscriber must not break flag application.
      }
    }
  }
}
