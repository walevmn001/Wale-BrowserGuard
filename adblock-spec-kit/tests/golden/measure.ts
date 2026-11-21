/**
 * Per-page measurement for the golden suite (T018).
 *
 * One pass over a fixture page records how many *known* ad/tracker requests it
 * issued, how many were blocked (`ERR_BLOCKED_BY_CLIENT`), whether any benign
 * same-origin script failed and whether the page reported itself healthy.
 * Aggregation lives in `results.ts`.
 */

import type { Page, Request, Response } from '@playwright/test';

import { BENIGN_PATHS, isKnownHost, pagePath, type GoldenPage } from './fixtures';

export interface PageMeasurement {
  readonly slug: string;
  readonly group: string;
  readonly knownRequests: number;
  readonly blockedRequests: number;
  readonly benignFailures: number;
  readonly appLoaded: boolean;
  readonly hasMain: boolean;
}

/** A page counts as broken when a benign resource failed or it did not render. */
export function isBroken(measurement: PageMeasurement): boolean {
  return measurement.benignFailures > 0 || !measurement.appLoaded || !measurement.hasMain;
}

interface PageDetail {
  readonly appLoaded: boolean;
  readonly hasMain: boolean;
}

function readDetail(page: Page): Promise<PageDetail> {
  return page.evaluate(() => ({
    appLoaded: (window as unknown as { __appLoaded?: boolean }).__appLoaded === true,
    hasMain: document.querySelector('#main') !== null,
  }));
}

function isBenign(url: string): boolean {
  try {
    return BENIGN_PATHS.includes(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * Navigates `page` to one fixture and reports what happened to its requests.
 * A blocked request fires `request` and then `requestfailed`; an allowed one
 * fires only `request`, so the map value flips to blocked only on failure.
 */
export async function measurePage(
  page: Page,
  fixture: GoldenPage,
  baseUrl: string,
): Promise<PageMeasurement> {
  const blockedByUrl = new Map<string, boolean>();
  let benignFailures = 0;

  const onRequest = (request: Request): void => {
    if (isKnownHost(request.url())) {
      blockedByUrl.set(request.url(), false);
    }
  };
  const onFailed = (request: Request): void => {
    const url = request.url();
    if (isKnownHost(url)) {
      const text = request.failure()?.errorText ?? '';
      blockedByUrl.set(url, text.includes('ERR_BLOCKED_BY_CLIENT'));
    } else if (isBenign(url)) {
      benignFailures += 1;
    }
  };

  page.on('request', onRequest);
  page.on('requestfailed', onFailed);
  try {
    await page.goto(`${baseUrl}${pagePath(fixture)}`, { waitUntil: 'load' });
    const detail = await readDetail(page);
    const outcomes = [...blockedByUrl.values()];
    return {
      slug: fixture.slug,
      group: fixture.group,
      knownRequests: outcomes.length,
      blockedRequests: outcomes.filter(Boolean).length,
      benignFailures,
      appLoaded: detail.appLoaded,
      hasMain: detail.hasMain,
    };
  } finally {
    page.off('request', onRequest);
    page.off('requestfailed', onFailed);
  }
}

/**
 * Live per-host outcome for the benign-host guard (B2b-3). `settled` holds every
 * host the browser actually contacted; `blocked` holds those DNR stopped
 * (`ERR_BLOCKED_BY_CLIENT`).
 *
 * The `privacy` ruleset upgrades every `http` sub-resource to `https`, which the
 * offline HTTP-only fixture server cannot answer — so an *allowed* probe emits a
 * 307 for the `http` URL and then fails TLS. Reading the error text is what
 * separates the block rule we are guarding against from the upgrade that always
 * applies (same technique as `tests/e2e/allow-benign-hosts.spec.ts`).
 */
export interface BenignProbeOutcome {
  readonly settled: Set<string>;
  readonly blocked: Set<string>;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Fires a cross-host image request per host (images ignore CORS). */
export function fireBenignProbes(page: Page, hosts: readonly string[]): Promise<void> {
  return page.evaluate((targets) => {
    const { port } = new URL(window.location.href);
    for (const host of targets) {
      const image = new Image();
      image.src = `http://${host}:${port}/probe.png`;
    }
  }, hosts as string[]);
}

/** Records, per benign host, whether it was probed and whether DNR blocked it. */
export function trackBenignProbes(page: Page, hosts: readonly string[]): BenignProbeOutcome {
  const settled = new Set<string>();
  const blocked = new Set<string>();
  page.on('response', (response: Response) => {
    const host = hostnameOf(response.url());
    if (host !== null && hosts.includes(host)) settled.add(host);
  });
  page.on('requestfailed', (request: Request) => {
    const host = hostnameOf(request.url());
    if (host === null || !hosts.includes(host)) return;
    settled.add(host);
    if ((request.failure()?.errorText ?? '').includes('ERR_BLOCKED_BY_CLIENT')) blocked.add(host);
  });
  return { settled, blocked };
}
