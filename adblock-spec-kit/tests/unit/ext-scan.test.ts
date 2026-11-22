import { describe, expect, it } from 'vitest';

import {
  scanExtensions,
  scoreExtension,
  type ManagementApi,
  type ScanInput,
} from '../../src/background/ext-scan';

/**
 * T080 — installed-extension scan (algorithm.md §S, AC-16.1).
 *
 * `scoreExtension` is pure, so the weighted-sum scoring is exercised directly;
 * `scanExtensions` is given a fake `management` API to check the filtering
 * (extensions only, never WALE GUARD itself) and the riskiest-first sorting.
 */

/** A neutral extension: enabled, store install, no permissions, no broad hosts. */
function input(overrides: Partial<ScanInput> = {}): ScanInput {
  return {
    id: 'abc',
    name: 'Some Extension',
    type: 'extension',
    enabled: true,
    permissions: [],
    hostPermissions: [],
    installType: 'normal',
    updateUrl: 'https://clients2.google.com/service/update2/crx',
    ...overrides,
  };
}

describe('scoreExtension', () => {
  it('scores a plain store extension with no risky permissions at zero', () => {
    const risk = scoreExtension(input());

    expect(risk.score).toBe(0);
    expect(risk.reasons).toEqual([]);
  });

  it('sums the weight of every recognised permission', () => {
    const risk = scoreExtension(input({ permissions: ['debugger', 'cookies', 'tabs'] }));

    expect(risk.score).toBe(40 + 20 + 10);
    expect(risk.reasons).toEqual([
      { kind: 'permission', permission: 'debugger' },
      { kind: 'permission', permission: 'cookies' },
      { kind: 'permission', permission: 'tabs' },
    ]);
  });

  it('ignores permissions that are not in the weight table', () => {
    const risk = scoreExtension(input({ permissions: ['storage', 'alarms'] }));

    expect(risk.score).toBe(0);
    expect(risk.reasons).toEqual([]);
  });

  it('adds the broad-host weight once for any all-sites host pattern', () => {
    const risk = scoreExtension(input({ hostPermissions: ['https://example.com/*', '<all_urls>'] }));

    expect(risk.score).toBe(30);
    expect(risk.reasons).toEqual([{ kind: 'broadHosts' }]);
  });

  it('flags an unpacked (development) install', () => {
    const risk = scoreExtension(input({ installType: 'development' }));

    expect(risk.score).toBe(20);
    expect(risk.reasons).toEqual([{ kind: 'unpacked' }]);
  });

  it('flags a sideloaded install', () => {
    const risk = scoreExtension(input({ installType: 'sideload' }));

    expect(risk.score).toBe(20);
    expect(risk.reasons).toEqual([{ kind: 'unpacked' }]);
  });

  it('flags a non-store install that has no update URL', () => {
    const risk = scoreExtension(input({ installType: 'sideload', updateUrl: '' }));

    // Sideload: unpacked (+20) and unable to auto-update (+10).
    expect(risk.score).toBe(30);
    expect(risk.reasons).toEqual([{ kind: 'unpacked' }, { kind: 'noUpdate' }]);
  });

  it('does not flag "no update" for a normal store install', () => {
    const risk = scoreExtension(input({ installType: 'normal', updateUrl: '' }));

    expect(risk.score).toBe(0);
    expect(risk.reasons).toEqual([]);
  });

  it('carries identity through unchanged', () => {
    const risk = scoreExtension(input({ id: 'xyz', name: 'Named', enabled: false }));

    expect(risk).toMatchObject({ id: 'xyz', name: 'Named', enabled: false });
  });
});

describe('scanExtensions', () => {
  it('keeps only extensions and drops WALE GUARD itself', async () => {
    const api: ManagementApi = {
      getAll: async () => [
        input({ id: 'self', name: 'WALE GUARD' }),
        input({ id: 'other', name: 'Other' }),
        input({ id: 'theme', name: 'A Theme', type: 'theme' }),
        input({ id: 'app', name: 'An App', type: 'packaged_app' }),
      ],
    };

    const risks = await scanExtensions(api, 'self');

    expect(risks.map((risk) => risk.id)).toEqual(['other']);
  });

  it('sorts the riskiest extension first', async () => {
    const api: ManagementApi = {
      getAll: async () => [
        input({ id: 'low', permissions: ['tabs'] }),
        input({ id: 'high', permissions: ['debugger', 'proxy'] }),
        input({ id: 'mid', permissions: ['cookies', 'history'] }),
      ],
    };

    const risks = await scanExtensions(api, 'self');

    expect(risks.map((risk) => risk.id)).toEqual(['high', 'mid', 'low']);
    expect(risks.map((risk) => risk.score)).toEqual([80, 40, 10]);
  });

  it('returns an empty list when only WALE GUARD is installed', async () => {
    const api: ManagementApi = { getAll: async () => [input({ id: 'self' })] };

    await expect(scanExtensions(api, 'self')).resolves.toEqual([]);
  });

  it('handles management entries that omit permission lists', async () => {
    const api: ManagementApi = {
      getAll: async () => [
        {
          id: 'minimal',
          name: 'Minimal extension',
          type: 'extension',
          enabled: true,
        },
      ],
    };

    await expect(scanExtensions(api, 'self')).resolves.toMatchObject([
      { id: 'minimal', score: 10, reasons: [{ kind: 'noUpdate' }] },
    ]);
  });
});
