/**
 * Module registry for the rebuilt YouTube engine (Phase 1 — core).
 *
 * Pure logic. Holds the engine's modules and drives their lifecycle. Init is
 * fault-isolated: each module's `init` is wrapped in its own try/catch, so one
 * failing module is recorded and skipped while the others still start. Nothing
 * here touches page or extension globals.
 */

import type { ModuleContext, ModuleStatus, YouTubeModule } from './module';

interface ModuleRecord {
  enabled: boolean;
  failures: number;
  lastError: string | null;
}

/** Best-effort message from an unknown thrown value. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return String(error);
  } catch {
    return 'unknown error';
  }
}

export class ModuleRegistry {
  private readonly modules = new Map<string, YouTubeModule>();
  private readonly records = new Map<string, ModuleRecord>();
  private disposed = false;

  /** Registers a module; throws a plain Error on a duplicate name. */
  register(module: YouTubeModule): void {
    if (this.modules.has(module.name)) {
      throw new Error(`duplicate module name: ${module.name}`);
    }
    this.modules.set(module.name, module);
    this.records.set(module.name, { enabled: true, failures: 0, lastError: null });
  }

  get(name: string): YouTubeModule | undefined {
    return this.modules.get(name);
  }

  /**
   * Initialises every module. A module that throws is isolated and recorded;
   * the remaining modules are still initialised.
   */
  async initAll(ctx: ModuleContext): Promise<void> {
    for (const module of this.modules.values()) {
      try {
        await module.init(ctx);
      } catch (error) {
        const record = this.records.get(module.name);
        if (record !== undefined) {
          record.enabled = false;
          record.failures += 1;
          record.lastError = errorMessage(error);
        }
      }
    }
  }

  /** Disposes every module once; a second call is a no-op. */
  async disposeAll(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const module of this.modules.values()) {
      try {
        await module.dispose();
      } catch {
        // A faulty module must not stop the rest of the teardown.
      }
    }
  }

  /** A status snapshot per module, with registry-recorded failures overlaid. */
  statusAll(): readonly ModuleStatus[] {
    const statuses: ModuleStatus[] = [];
    for (const module of this.modules.values()) {
      let base: ModuleStatus;
      try {
        base = module.status();
      } catch {
        base = { name: module.name, enabled: false, failures: 0, lastError: null };
      }
      const record = this.records.get(module.name);
      statuses.push({
        name: module.name,
        enabled: record !== undefined ? record.enabled : base.enabled,
        failures: record !== undefined ? record.failures : base.failures,
        lastError: record !== undefined ? record.lastError : base.lastError,
      });
    }
    return statuses;
  }
}
