/**
 * Local, non-throwing debug logger for the YouTube engine (Phase 1 — core).
 *
 * Pure logic: it keeps a bounded in-memory ring buffer and performs no I/O — no
 * console, no storage, no network — so it is safe to call from the hot path and
 * trivial to unit-test. Nothing is recorded while `enabled` is false (the
 * default), so a shipped build pays nothing unless debugging is switched on.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly level: LogLevel;
  readonly scope: string;
  readonly message: string;
  readonly data?: unknown;
  readonly at: number;
}

export interface LoggerStatus {
  readonly enabled: boolean;
  readonly size: number;
}

export class DebugLogger {
  private readonly maxEntries: number;
  private readonly now: () => number;
  private buffer: LogEntry[] = [];
  private isEnabled = false;

  constructor(maxEntries = 200, now: () => number = Date.now) {
    this.maxEntries = Math.max(0, Math.floor(maxEntries));
    this.now = now;
  }

  get enabled(): boolean {
    return this.isEnabled;
  }

  set enabled(value: boolean) {
    this.isEnabled = value === true;
  }

  /** Records a line. No-op while disabled or when the buffer size is zero. */
  log(level: LogLevel, scope: string, message: string, data?: unknown): void {
    try {
      if (!this.isEnabled || this.maxEntries === 0) {
        return;
      }
      const entry: LogEntry =
        data === undefined
          ? { level, scope, message, at: this.now() }
          : { level, scope, message, data, at: this.now() };
      this.buffer.push(entry);
      while (this.buffer.length > this.maxEntries) {
        this.buffer.shift();
      }
    } catch {
      // Never throw out of the logger.
    }
  }

  debug(scope: string, message: string, data?: unknown): void {
    this.log('debug', scope, message, data);
  }

  info(scope: string, message: string, data?: unknown): void {
    this.log('info', scope, message, data);
  }

  warn(scope: string, message: string, data?: unknown): void {
    this.log('warn', scope, message, data);
  }

  error(scope: string, message: string, data?: unknown): void {
    this.log('error', scope, message, data);
  }

  /** A defensive copy of the buffered lines, oldest first. */
  entries(): readonly LogEntry[] {
    return [...this.buffer];
  }

  status(): LoggerStatus {
    return { enabled: this.isEnabled, size: this.buffer.length };
  }
}
