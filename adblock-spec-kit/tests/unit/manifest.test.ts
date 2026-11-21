import { describe, expect, it } from 'vitest';

import { createManifest } from '../../manifest.config';

describe('manifest', () => {
  it('is a Manifest V3 manifest', () => {
    expect(createManifest().manifest_version).toBe(3);
  });

  it('declares a service worker and a popup', () => {
    const manifest = createManifest();

    expect(manifest.background.service_worker).toBe('service-worker.js');
    expect(manifest.action.default_popup).toBe('src/popup/index.html');
  });

  it('declares no permissions until a task needs them', () => {
    expect('permissions' in createManifest()).toBe(false);
    expect('host_permissions' in createManifest()).toBe(false);
  });
});
