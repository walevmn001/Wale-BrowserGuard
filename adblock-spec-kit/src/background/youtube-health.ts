/**
 * YouTube module health & self-downgrade — T066 (US-15.4, algorithm.md §Q5).
 *
 * Keeps the *local* decision of when to stop trusting the best-effort module.
 * The page-side monitor (`content/youtube/health.ts`) reports faults; two faults
 * inside a five-minute window drop the Q2 prune for the session, and a fault
 * after that turns the whole module off — always for the session only, so the
 * user is not left unprotected on the next launch.
 *
 * State lives in `chrome.storage.session`, never in a module variable
 * (Constitution 14): the worker can be stopped at any time, and the flags must
 * not survive a browser restart.
 */

import { TypedStorage } from '../shared/storage';
import type { YouTubeHealthSessionState } from '../shared/types';

/** Faults older than this are forgotten (algorithm.md §Q5). */
export const HEALTH_FAULT_WINDOW_MS = 5 * 60 * 1000;
/** Faults in the window before the Q2 prune is dropped (N = 2). */
export const HEALTH_FAULT_LIMIT = 2;

/** What a navigation must respect this session. */
export interface YouTubeHealthState {
  readonly q2Disabled: boolean;
  readonly moduleDisabled: boolean;
}

/** Which layer (if any) the latest fault just dropped. */
export type HealthDegrade = 'none' | 'q2' | 'module';

export interface HealthFaultResult {
  readonly state: YouTubeHealthState;
  readonly degrade: HealthDegrade;
}

const DEFAULT_STATE: YouTubeHealthSessionState = {
  q2Disabled: false,
  moduleDisabled: false,
  faults: [],
};

/** Builds storage over `chrome.storage.session` (cleared at browser shutdown). */
export function createHealthStorage(): TypedStorage {
  return new TypedStorage(chrome.storage.session);
}

/** The session flags, defaulting to "healthy" when nothing is stored yet. */
export async function readHealthState(storage: TypedStorage): Promise<YouTubeHealthState> {
  const stored = (await storage.get('youtubeHealthSession')) ?? DEFAULT_STATE;
  return { q2Disabled: stored.q2Disabled, moduleDisabled: stored.moduleDisabled };
}

/** Drops fault timestamps outside the rolling window. */
function recentFaults(faults: readonly number[], now: number): number[] {
  return faults.filter((time) => now - time < HEALTH_FAULT_WINDOW_MS);
}

/**
 * Records one fault and escalates: the second fault in the window drops Q2; a
 * fault after that turns the whole module off. Once the module is off there is
 * nothing left to degrade, so further faults are only counted.
 */
export async function recordHealthFault(
  storage: TypedStorage,
  now: number,
): Promise<HealthFaultResult> {
  const stored = (await storage.get('youtubeHealthSession')) ?? DEFAULT_STATE;
  const faults = recentFaults(stored.faults, now);
  faults.push(now);

  let { q2Disabled, moduleDisabled } = stored;
  let degrade: HealthDegrade = 'none';

  if (!moduleDisabled) {
    if (q2Disabled) {
      moduleDisabled = true;
      degrade = 'module';
    } else if (faults.length >= HEALTH_FAULT_LIMIT) {
      q2Disabled = true;
      degrade = 'q2';
    }
  }

  await storage.set('youtubeHealthSession', { q2Disabled, moduleDisabled, faults });
  return { state: { q2Disabled, moduleDisabled }, degrade };
}
