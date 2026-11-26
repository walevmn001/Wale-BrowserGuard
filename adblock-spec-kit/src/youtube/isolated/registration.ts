/**
 * ISOLATED-world registration seam for the rebuilt MAIN engine (Phase 5 prep).
 *
 * The rebuilt engine runs as a MAIN-world content script at `document_start`.
 * This module owns the `chrome.scripting.registerContentScripts` call so the
 * registration can be driven by the module switch without the worker reaching
 * into `chrome.*` directly (keeps the call unit-testable with a fake API).
 *
 * It is deliberately **not wired into the worker yet**: activating a second
 * engine next to the existing YouTube module is an integration step (Phase 5)
 * and must not ship before the new engine is verified on real Chrome
 * (Constitution VIII — playback first). Until then this seam is inert.
 *
 * Every function is fail-open: a registration failure returns a result object
 * and never throws, so a scripting error can never take down the worker.
 */

/** The shape of one content-script registration (mirrors the Chrome API). */
export interface ContentScriptRegistration {
  readonly id: string;
  readonly matches: readonly string[];
  readonly js: readonly string[];
  readonly runAt: 'document_start';
  readonly world: 'MAIN';
  readonly persistAcrossSessions: boolean;
}

/** The subset of `chrome.scripting` this seam needs; injected for tests. */
export interface ScriptingApi {
  getRegisteredContentScripts(
    filter?: { readonly ids?: readonly string[] },
  ): Promise<readonly { readonly id: string }[]>;
  registerContentScripts(scripts: readonly ContentScriptRegistration[]): Promise<void>;
  unregisterContentScripts(filter?: { readonly ids?: readonly string[] }): Promise<void>;
}

/** Stable id so registration is idempotent across worker restarts. */
export const ENGINE_SCRIPT_ID = 'wg-youtube-engine-main';
/** The bundle emitted by `vite.youtube.config.ts`. */
export const ENGINE_SCRIPT_FILE = 'youtube-main.js';

export interface SyncResult {
  readonly ok: boolean;
  readonly reason?: string;
}

/** The registration descriptor for the engine's MAIN content script. */
export function engineRegistration(): ContentScriptRegistration {
  return {
    id: ENGINE_SCRIPT_ID,
    matches: ['*://*.youtube.com/*'],
    js: [ENGINE_SCRIPT_FILE],
    runAt: 'document_start',
    world: 'MAIN',
    persistAcrossSessions: true,
  };
}

async function isRegistered(api: ScriptingApi): Promise<boolean> {
  const scripts = await api.getRegisteredContentScripts({ ids: [ENGINE_SCRIPT_ID] });
  return scripts.some((script) => script.id === ENGINE_SCRIPT_ID);
}

/**
 * Brings the engine registration in line with `enabled`. Idempotent: enabling
 * when already registered (and disabling when already absent) is a no-op.
 */
export async function syncEngineRegistration(
  api: ScriptingApi,
  enabled: boolean,
): Promise<SyncResult> {
  try {
    const registered = await isRegistered(api);
    if (enabled && !registered) {
      await api.registerContentScripts([engineRegistration()]);
    } else if (!enabled && registered) {
      await api.unregisterContentScripts({ ids: [ENGINE_SCRIPT_ID] });
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'unknown' };
  }
}
