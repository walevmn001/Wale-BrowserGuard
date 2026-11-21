import { describe, expect, it } from 'vitest';

import { createManifest } from '../../manifest.config';
import { STATIC_RULESETS } from '../../scripts/static-rulesets';

describe('manifest', () => {
  it('is a Manifest V3 manifest', () => {
    expect(createManifest().manifest_version).toBe(3);
  });

  it('declares a service worker and a popup', () => {
    const manifest = createManifest();

    expect(manifest.background.service_worker).toBe('service-worker.js');
    expect(manifest.background.type).toBe('module');
    expect(manifest.action.default_popup).toBe('src/popup/index.html');
  });

  it('declares the network-blocking permissions from plan.md §3', () => {
    const manifest = createManifest();

    expect(manifest.permissions).toContain('declarativeNetRequest');
    expect(manifest.permissions).toContain('declarativeNetRequestFeedback');
    expect(manifest.permissions).toContain('storage');
    expect(manifest.host_permissions).toContain('<all_urls>');
  });

  it('declares every static ruleset with a matching path', () => {
    const manifest = createManifest();

    expect(manifest.declarative_net_request.rule_resources).toEqual(
      STATIC_RULESETS.map(({ id, enabled, output }) => ({ id, enabled, path: output })),
    );
    expect(manifest.declarative_net_request.rule_resources.length).toBeGreaterThan(0);
  });
});
