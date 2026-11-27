/**
 * User-facing layer grouping for the rebuilt YouTube engine (Phase 6).
 *
 * The engine has twelve flags, but the popup only exposes six switches: the
 * three MAIN-world hooks and the three ISOLATED-world layers. This module is
 * the single place that says which flag belongs to which world, so the popup,
 * the settings store and the tests never re-derive the grouping.
 *
 * Pure logic: it never touches page or extension globals (architecture test).
 *
 * The three MAIN flags are the ones the flag adapter (T004) gates — with no
 * snapshot their effective state is ON (spec A-3), so the popup must show them
 * as WAITING_FOR_ADAPTER, never as "off". The three ISOLATED flags are applied
 * straight from the extension's sync storage, no adapter involved.
 */

import type { FlagName } from './flags';

export type LayerWorld = 'MAIN' | 'ISOLATED';

/** One switchable layer: the flag that gates it and the world it runs in. */
export interface LayerDef {
  readonly flag: FlagName;
  readonly world: LayerWorld;
}

/** The three MAIN-world hook layers, gated by the flag adapter (T004). */
export const MAIN_LAYERS: readonly LayerDef[] = [
  { flag: 'ENABLE_JSON_PRUNER', world: 'MAIN' },
  { flag: 'ENABLE_FETCH_HOOK', world: 'MAIN' },
  { flag: 'ENABLE_XHR_HOOK', world: 'MAIN' },
];

/** The three ISOLATED-world layers, applied via the extension's sync storage. */
export const ISOLATED_LAYERS: readonly LayerDef[] = [
  { flag: 'ENABLE_DNR', world: 'ISOLATED' },
  { flag: 'ENABLE_RUNTIME_GUARD', world: 'ISOLATED' },
  { flag: 'ENABLE_CSS_HIDER', world: 'ISOLATED' },
];

/** Every user-facing layer, MAIN first. */
export const ENGINE_LAYERS: readonly LayerDef[] = [...MAIN_LAYERS, ...ISOLATED_LAYERS];

/** True for one of the three MAIN-world flags that depend on the adapter. */
export function isMainFlag(flag: FlagName): boolean {
  return MAIN_LAYERS.some((layer) => layer.flag === flag);
}
