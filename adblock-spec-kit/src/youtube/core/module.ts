/**
 * Module contract for the rebuilt YouTube engine (Phase 1 — core layer).
 *
 * A `YouTubeModule` is a self-contained unit of behaviour the engine can start
 * and stop. The contract is deliberately small so modules stay pure logic and
 * receive everything they need (flags, logger, lifecycle, registries) through a
 * `ModuleContext` at `init` time. Nothing here touches page or extension
 * globals — the world-specific wiring lives only under `main/`.
 */

import type { FeatureFlags } from '../config/flags';
import type { SelectorRegistry } from '../registry/selectors';
import type { EndpointRegistry } from '../registry/endpoints';
import type { DebugLogger } from './debug-logger';
import type { LifecycleManager } from './lifecycle-manager';

/** A snapshot of a module's health, used by diagnostics and the popup. */
export interface ModuleStatus {
  readonly name: string;
  readonly enabled: boolean;
  readonly failures: number;
  readonly lastError: string | null;
}

/** Dependencies injected into every module when it is initialised. */
export interface ModuleContext {
  readonly flags: FeatureFlags;
  readonly logger: DebugLogger;
  readonly lifecycle: LifecycleManager;
  readonly selectors: SelectorRegistry;
  readonly endpoints: EndpointRegistry;
}

export interface YouTubeModule {
  readonly name: string;
  init(ctx: ModuleContext): void | Promise<void>;
  dispose(): void | Promise<void>;
  status(): ModuleStatus;
}
