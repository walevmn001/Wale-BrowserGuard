/**
 * YouTube engine layer rows for the popup (Phase 6 — T017 / T071).
 *
 * Pure mapping from the stored desired state, the module switch, the script
 * registration and the MAIN engine's runtime status to the six rows the popup
 * paints. It is deliberately free of DOM and storage so it can be unit-tested
 * directly.
 *
 * The three MAIN rows no longer assume "registered ⇒ applied" (the FIX-01 bug):
 * each resolves through the six-state runtime model (`resolveComponentState`),
 * so a hook only reads `ENABLED`/`DISABLED` once the MAIN engine has *confirmed*
 * it is installed and matches the saved choice. The three ISOLATED rows reflect
 * the stored choice directly, since they are applied from the extension's own
 * storage and need no adapter.
 */

import type { FlagName } from '../youtube/config/flags';
import { ISOLATED_LAYERS, MAIN_LAYERS, type LayerWorld } from '../youtube/config/layers';
import {
  resolveComponentState,
  type ComponentRuntimeState,
  type EngineRuntimeStatus,
  type MainHookFlagName,
} from '../youtube/state/engine-status';
import { displayMessage } from '../youtube/state/messages';
import type { DisplayState } from '../youtube/state/toggle-state';
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

/** Everything the six rows depend on, gathered by the popup page script. */
export interface YtLayerInputs {
  /** The saved per-layer choice. */
  readonly desired: Readonly<Record<FlagName, boolean>>;
  /** The YouTube module switch (master on/off for the engine). */
  readonly moduleEnabled: boolean;
  /** True when both engine content scripts are registered for the tab. */
  readonly registered: boolean;
  /** The MAIN engine's confirmed runtime status, or `undefined` when silent. */
  readonly status: EngineRuntimeStatus | undefined;
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

/** Maps a six-state component runtime to the popup's display state. */
function componentDisplayState(state: ComponentRuntimeState, desiredOn: boolean): DisplayState {
  switch (state) {
    case 'READY':
      return desiredOn ? 'ENABLED' : 'DISABLED';
    case 'DISABLED':
      return 'DISABLED';
    case 'WAITING_FOR_REGISTRATION':
      return 'WAITING_FOR_REGISTRATION';
    case 'WAITING_FOR_ADAPTER':
      return 'WAITING_FOR_ADAPTER';
    case 'INITIALIZING':
      return 'INITIALIZING';
    case 'ERROR':
      return 'ERROR';
  }
}

/** True for a display state that means "not confirmed applied yet". */
function isTransient(state: DisplayState): boolean {
  return (
    state === 'WAITING_FOR_REGISTRATION' ||
    state === 'WAITING_FOR_ADAPTER' ||
    state === 'INITIALIZING' ||
    state === 'RECONCILING'
  );
}

/** Builds the six rows, MAIN first, from the desired flags and live status. */
export function buildYtLayers(input: YtLayerInputs): readonly YtLayerRow[] {
  const rows: YtLayerRow[] = [];

  for (const layer of MAIN_LAYERS) {
    const on = input.desired[layer.flag];
    const state = componentDisplayState(
      resolveComponentState({
        moduleEnabled: input.moduleEnabled,
        registered: input.registered,
        status: input.status,
        flag: layer.flag as MainHookFlagName,
        desiredOn: on,
      }),
      on,
    );
    rows.push({
      flag: layer.flag,
      labelKey: labelKeyFor(layer.flag),
      world: layer.world,
      desired: on,
      state,
      message: displayMessage(state),
      savedNotApplied: isTransient(state) && !on,
    });
  }

  for (const layer of ISOLATED_LAYERS) {
    const on = input.desired[layer.flag];
    const state: DisplayState = !input.moduleEnabled ? 'DISABLED' : on ? 'ENABLED' : 'DISABLED';
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

/** The group-level state the popup shows as a chip: the three MAIN rows agree. */
export function mainGroupState(rows: readonly YtLayerRow[]): {
  readonly state: DisplayState;
  readonly message: string;
} {
  const main = rows.find((row) => row.world === 'MAIN');
  return main === undefined
    ? { state: 'UNKNOWN', message: displayMessage('UNKNOWN') }
    : { state: main.state, message: main.message };
}
