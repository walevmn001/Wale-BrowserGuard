/**
 * MAIN-world runtime-status publisher (CHECKPOINT FIX-01, Phase C).
 *
 * Serialises the engine's live module status + effective flags to one JSON
 * string and hands it to an injected `write` (in production the shared root
 * attribute the ISOLATED bridge watches). It dedupes on the serialised value,
 * so a re-publish with nothing new writes nothing, and it is fail-open: a
 * throwing write can never disturb the page.
 *
 * The world-specific bits (resolving the root element, reading `location`) live
 * in `main.ts`, which injects them — this module stays pure and testable.
 */

import type { FlagName } from '../config/flags';
import type { ModuleStatus } from '../core/module';
import { buildRuntimeStatus } from '../state/runtime-status';

export interface StatusPublisherDeps {
  /** Writes the serialised status (e.g. `root.setAttribute(...)`). */
  readonly write: (raw: string) => void;
  readonly readModules: () => readonly ModuleStatus[];
  readonly readFlags: () => Readonly<Record<FlagName, boolean>>;
  readonly readUrl: () => string;
  readonly now: () => number;
}

export interface StatusPublisher {
  readonly publish: () => void;
}

export function createStatusPublisher(deps: StatusPublisherDeps): StatusPublisher {
  let last = '';
  return {
    publish(): void {
      try {
        const status = buildRuntimeStatus({
          now: deps.now(),
          url: deps.readUrl(),
          flags: deps.readFlags(),
          modules: deps.readModules(),
        });
        const raw = JSON.stringify(status);
        if (raw === last) {
          return;
        }
        last = raw;
        deps.write(raw);
      } catch {
        // fail-open: a status write must never disturb the page.
      }
    },
  };
}
