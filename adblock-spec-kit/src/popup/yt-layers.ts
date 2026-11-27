/**
 * YouTube engine layer rows for the popup (Phase 6 — T017 / T071).
 *
 * Pure mapping from the stored desired state plus the transport health
 * (adapter/snapshot) and the runtime handshake (registration + the MAIN engine's
 * confirmed per-module facts) to the six rows the popup paints. It is
 * deliberately free of DOM and storage so it can be unit-tested directly.
 *
 * CHECKPOINT FIX-01 (Phase C): the three MAIN rows no longer infer READY from
 * "the content script is registered". They resolve through `resolveLayerDisplay`,
 * which needs the engine's *confirmed* runtime status: a hook reads ENABLED
 * (READY) only when the page reported it installed, BEFORE that it is
 * INITIALIZING, and with no registration it is WAITING_FOR_REGISTRATION. The
 * three ISOLATED rows reflect the effective state the ISOLATED module reports,
 * which for now is simply the stored choice.
 */

import type { AdapterState } from '../youtube/adapter/adapter';
import type { FlagName } from '../youtube/config/flags';
import { ISOLATED_LAYERS, MAIN_LAYERS, type LayerWorld } from '../youtube/config/layers';
import { displayMessage } from '../youtube/state/messages';
import { HOOK_MODULE_BY_FLAG, type YtModuleRuntime, type YtRuntimeStatus } from '../youtube/state/runtime-status';
import {
  isPendingState,
  resolveLayerDisplay,
  type DisplayState,
  type SnapshotState,
} from '../youtube/state/toggle-state';
import type { MessageKey } from '../shared/i18n';

/** One switch row the popup renders. */
export interface YtLayerRow {
  readonly flag: FlagName;
  readonly labelKey: MessageKey;
  readonly world: LayerWorld;
  /** Switch position = the saved (desired) choice. */
  readonly desired: boolean;
  readonly state: DisplayState;
  readonly message: string;
  /** True when a saved choice differs from the still-effective default. */
  readonly savedNotApplied: boolean;
}

/** The registration + runtime handshake the popup feeds `buildYtLayers` with. */
export interface YtEngineRuntime {
  /** The module switch is on (the user opted in). */
  readonly moduleEnabled: boolean;
  /** The MAIN content script is registered for YouTube. */
  readonly registered: boolean;
  /** The MAIN engine's confirmed runtime status for the tab, or null. */
  readonly status: YtRuntimeStatus | null;
}

/** Localised label per user-facing layer; unknown flags fall back to generic. */
const LAYER_LABELS: Partial<Record<FlagName, MessageKey>> = {
  ENABLE_JSON_PRUNER: 'ppYtLayerJsonPruner',
  ENABLE_FETCH_HOOK: 'ppYtLayerFetchHook',
  ENABLE_XHR_HOOK: 'ppYtLayerXhrHook',
  ENABLE_DNR: 'ppYtLayerDnr',
  ENABLE_RUNTIME_GUARD: 'ppYtLayerRuntimeGuard',
  ENABLE_CSS_HIDER: 'ppYtLayerCssHider',
};

function labelKeyFor(flag: FlagName): MessageKey {
  return LAYER_LABELS[flag] ?? 'gUnknown';
}

/** The MAIN runtime facts for one flag, or null when no fresh status has landed. */
function runtimeFor(engine: YtEngineRuntime, flag: FlagName): YtModuleRuntime | null {
  if (engine.status === null) {
    return null;
  }
  const moduleName = HOOK_MODULE_BY_FLAG[flag];
  if (moduleName === undefined) {
    return null;
  }
  return engine.status.modules[moduleName] ?? null;
}

/**
 * Builds the six rows, MAIN first, from the desired flags, the transport health
 * and the runtime handshake.
 */
export function buildYtLayers(
  desired: Readonly<Record<FlagName, boolean>>,
  adapter: AdapterState,
  snapshot: SnapshotState,
  engine: YtEngineRuntime,
): readonly YtLayerRow[] {
  const rows: YtLayerRow[] = [];

  for (const layer of MAIN_LAYERS) {
    const on = desired[layer.flag];
    const resolution = resolveLayerDisplay({
      desired: on ? 'ON' : 'OFF',
      adapter,
      snapshot,
      moduleEnabled: engine.moduleEnabled,
      registered: engine.registered,
      runtime: runtimeFor(engine, layer.flag),
    });
    const state = resolution.state;
    rows.push({
      flag: layer.flag,
      labelKey: labelKeyFor(layer.flag),
      world: layer.world,
      desired: on,
      state,
      message: displayMessage(state, resolution.reason),
      savedNotApplied: isPendingState(state) && !on,
    });
  }

  for (const layer of ISOLATED_LAYERS) {
    const on = desired[layer.flag];
    const state: DisplayState = on ? 'ENABLED' : 'DISABLED';
    rows.push({
      flag: layer.flag,
      labelKey: labelKeyFor(layer.flag),
      world: layer.world,
      desired: on,
      state,
      message: displayMessage(state),
      savedNotApplied: false,
    });
  }

  return rows;
}

/** Severity order for the group chip: the most notable MAIN state wins. */
const GROUP_ORDER: readonly DisplayState[] = [
  'ERROR',
  'WAITING_FOR_REGISTRATION',
  'WAITING_FOR_ADAPTER',
  'INITIALIZING',
  'RECONCILING',
  'ENABLED',
  'DISABLED',
  'UNKNOWN',
];

/** The group-level state the popup shows as a chip: the most notable MAIN row. */
export function mainGroupState(rows: readonly YtLayerRow[]): {
  readonly state: DisplayState;
  readonly message: string;
} {
  const main = rows.filter((row) => row.world === 'MAIN');
  if (main.length === 0) {
    return { state: 'UNKNOWN', message: displayMessage('UNKNOWN') };
  }
  const rank = (state: DisplayState): number => {
    const index = GROUP_ORDER.indexOf(state);
    return index === -1 ? GROUP_ORDER.length : index;
  };
  const picked = [...main].sort((a, b) => rank(a.state) - rank(b.state))[0]!;
  return { state: picked.state, message: picked.message };
}
