/**
 * Aggregates golden measurements into the AC-1.1…AC-1.4 baseline and writes
 * `tests/golden/results/<date>.json` (specs/001-adblock-security/test-golden.md
 * §2 and §4).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isBroken, type PageMeasurement } from './measure';

/** AC-1.1 — minimum share of known ad/tracker requests that must be blocked. */
export const BLOCK_RATE_THRESHOLD = 0.95;
/** AC-1.2 — maximum share of pages allowed to break. */
export const BREAK_RATE_THRESHOLD = 0.02;
/** AC-1.3 — maximum median navigation-time increase, in milliseconds. */
export const LATENCY_THRESHOLD_MS = 5;
/** Constitution 15 / test-golden §2 — maximum extension memory, in megabytes. */
export const MEMORY_THRESHOLD_MB = 100;

const RESULTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'results');

interface RateResult {
  readonly total: number;
  readonly hits: number;
  readonly rate: number;
  readonly threshold: number;
  readonly pass: boolean;
}

interface LatencyResult {
  readonly withExtensionMs: number;
  readonly withoutExtensionMs: number;
  readonly deltaMs: number;
  readonly thresholdMs: number;
  readonly pass: boolean;
}

interface RestartResult {
  readonly blockedAfterRestart: boolean;
  readonly pass: boolean;
}

interface MemoryResult {
  /** Service-worker JS heap in MB, or `null` when it could not be read. */
  readonly serviceWorkerHeapMb: number | null;
  readonly thresholdMb: number;
  readonly pass: boolean;
}

/** B2b-3 guard: legitimate third-party hosts the rules must not block. */
interface BenignResult {
  readonly total: number;
  readonly blocked: number;
  readonly pass: boolean;
}

export interface GoldenResults {
  readonly date: string;
  readonly generatedAt: string;
  readonly pages: number;
  readonly blockRate: RateResult;
  readonly breakRate: RateResult;
  readonly navigationLatency: LatencyResult;
  readonly restart: RestartResult;
  readonly memory: MemoryResult;
  readonly benignHosts: BenignResult;
}

/** Paired navigation samples: each page measured with and without the extension. */
export interface LatencySamples {
  readonly withExtensionMs: readonly number[];
  readonly withoutExtensionMs: readonly number[];
  /** Per-page `with - without`; its median cancels slow drift on a noisy box. */
  readonly deltas: readonly number[];
}

export function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function summarize(
  measured: readonly PageMeasurement[],
  latency: LatencySamples,
  restartPassed: boolean,
  memoryMb: number | null = null,
  benign: { readonly total: number; readonly blocked: number } = { total: 0, blocked: 0 },
): GoldenResults {
  const total = measured.reduce((sum, page) => sum + page.knownRequests, 0);
  const blocked = measured.reduce((sum, page) => sum + page.blockedRequests, 0);
  const blockRate = total === 0 ? 0 : blocked / total;
  const broken = measured.filter(isBroken).length;
  const breakRate = measured.length === 0 ? 0 : broken / measured.length;
  const withExtensionMs = median(latency.withExtensionMs);
  const withoutExtensionMs = median(latency.withoutExtensionMs);
  const deltaMs = median(latency.deltas);
  const now = new Date();
  return {
    date: now.toISOString().slice(0, 10),
    generatedAt: now.toISOString(),
    pages: measured.length,
    blockRate: {
      total,
      hits: blocked,
      rate: round(blockRate),
      threshold: BLOCK_RATE_THRESHOLD,
      pass: blockRate >= BLOCK_RATE_THRESHOLD,
    },
    breakRate: {
      total: measured.length,
      hits: broken,
      rate: round(breakRate),
      threshold: BREAK_RATE_THRESHOLD,
      pass: breakRate <= BREAK_RATE_THRESHOLD,
    },
    navigationLatency: {
      withExtensionMs: round(withExtensionMs),
      withoutExtensionMs: round(withoutExtensionMs),
      deltaMs: round(deltaMs),
      thresholdMs: LATENCY_THRESHOLD_MS,
      pass: deltaMs < LATENCY_THRESHOLD_MS,
    },
    restart: {
      blockedAfterRestart: restartPassed,
      pass: restartPassed,
    },
    memory: {
      serviceWorkerHeapMb: memoryMb === null ? null : round(memoryMb),
      thresholdMb: MEMORY_THRESHOLD_MB,
      pass: memoryMb !== null && memoryMb < MEMORY_THRESHOLD_MB,
    },
    benignHosts: {
      total: benign.total,
      blocked: benign.blocked,
      pass: benign.total > 0 && benign.blocked === 0,
    },
  };
}

/** Writes the baseline JSON and returns the path it was written to. */
export function writeResults(results: GoldenResults): string {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const file = resolve(RESULTS_DIR, `${results.date}.json`);
  writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  return file;
}
