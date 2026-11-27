/**
 * Dataset flag adapter (Phase 1 — adapter layer; T004 decision: a DOM attribute).
 *
 * This is the concrete transport chosen for T004 (adapter.md §6, option A): a
 * single JSON attribute on the root element. The ISOLATED side `publish`es the
 * validated snapshot by writing that attribute; the MAIN side `onReceive`s it by
 * reading the attribute once and then observing it for later writes. It adds no
 * manifest permission and writes nothing but the one attribute (adapter.md §4).
 *
 * Pure logic: the element and the observer factory are injected, so this module
 * never touches a page or extension global itself — the same code runs unchanged
 * in the page and in a test (architecture test).
 *
 * Ordering note (A-4): the two worlds may start in any order. When the MAIN side
 * starts before the attribute exists it simply keeps the A-3 defaults (all ON)
 * and applies the snapshot as soon as the ISOLATED side publishes it, so a late
 * snapshot can only ever *reduce* protection through an explicit choice.
 */

import type { AdapterStatus, FlagAdapter } from './adapter';
import type { FlagSnapshot } from '../config/flags';

/** Root-element attribute that carries the JSON snapshot (both worlds). */
export const FLAG_DATASET_ATTRIBUTE = 'data-wg-yt-flags';

/** The only element operations the adapter needs: the chosen attribute. */
export interface AttributeTarget {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

/** The observer the MAIN side drives; injected so tests avoid a real one. */
export interface AttributeObserver {
  observe(target: Node, options: MutationObserverInit): void;
  disconnect(): void;
}

export interface DatasetEnv {
  /** The element the snapshot rides on. */
  readonly target: AttributeTarget;
  createObserver(callback: () => void): AttributeObserver;
}

/** Best-effort message from an unknown thrown value. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown';
}

export class DatasetAdapter implements FlagAdapter {
  readonly name = 'dataset';
  private readonly env: DatasetEnv;
  private receiver: ((raw: unknown) => void) | undefined;
  private observer: AttributeObserver | undefined;
  private started = false;
  private delivered = 0;
  private rejected = 0;
  private lastError: string | null = null;
  private lastSeen: string | null = null;

  constructor(env: DatasetEnv) {
    this.env = env;
  }

  /** ISOLATED: writes the snapshot as one JSON attribute. Never throws. */
  publish(snapshot: FlagSnapshot): { readonly ok: boolean } {
    try {
      this.env.target.setAttribute(FLAG_DATASET_ATTRIBUTE, JSON.stringify(snapshot));
      return { ok: true };
    } catch (error) {
      this.lastError = errorText(error);
      return { ok: false };
    }
  }

  /** MAIN: registers the receiver; returns a detach function. */
  onReceive(callback: (raw: unknown) => void): () => void {
    this.receiver = callback;
    return () => {
      if (this.receiver === callback) {
        this.receiver = undefined;
      }
    };
  }

  /** MAIN: reads the current value, then watches for later writes. Idempotent. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.deliver();
    try {
      const observer = this.env.createObserver(() => this.deliver());
      observer.observe(this.env.target as unknown as Node, {
        attributes: true,
        attributeFilter: [FLAG_DATASET_ATTRIBUTE],
      });
      this.observer = observer;
    } catch (error) {
      this.lastError = errorText(error);
    }
  }

  /** MAIN: stops watching. Idempotent. */
  dispose(): void {
    this.started = false;
    try {
      this.observer?.disconnect();
    } catch {
      // fail-open
    }
    this.observer = undefined;
    this.receiver = undefined;
  }

  status(): AdapterStatus {
    return {
      name: this.name,
      started: this.started,
      deliveredCount: this.delivered,
      rejectedCount: this.rejected,
      lastError: this.lastError,
    };
  }

  /** Reads the attribute and hands a *new* raw value to the receiver. */
  private deliver(): void {
    try {
      const raw = this.env.target.getAttribute(FLAG_DATASET_ATTRIBUTE);
      if (raw === null || raw === this.lastSeen) {
        return;
      }
      this.lastSeen = raw;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        this.rejected += 1;
        return;
      }
      this.delivered += 1;
      this.receiver?.(parsed);
    } catch (error) {
      this.lastError = errorText(error);
    }
  }
}
