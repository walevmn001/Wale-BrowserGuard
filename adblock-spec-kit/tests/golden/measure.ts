/**
 * Per-page measurement for the golden suite (T018).
 *
 * One pass over a fixture page records how many *known* ad/tracker requests it
 * issued, how many were blocked (`ERR_BLOCKED_BY_CLIENT`), whether any benign
 * same-origin script failed and whether the page reported itself healthy.
 * Aggregation lives in `results.ts`.
 */

import type { Page, Request } from '@playwright/test';

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
