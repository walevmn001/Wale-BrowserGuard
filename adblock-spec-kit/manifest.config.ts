/**
 * Manifest V3 definition for the AdBlock Security extension.
 *
 * Kept as a typed module so the build can emit `dist/manifest.json` and so the
 * shape can be unit-tested. Only the minimum for T002 (load unpacked, empty
 * worker, empty popup) is declared here; permissions are added by the tasks
 * that actually need them (see plan.md §3).
 */
export interface ManifestV3 {
  readonly manifest_version: 3;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly background: {
    readonly service_worker: string;
  };
  readonly action: {
    readonly default_title: string;
    readonly default_popup: string;
  };
}

export const EXTENSION_NAME = 'AdBlock Security';
export const EXTENSION_VERSION = '0.1.0';

export function createManifest(): ManifestV3 {
  return {
    manifest_version: 3,
    name: EXTENSION_NAME,
    version: EXTENSION_VERSION,
    description:
      'Blocks ads, trackers and malicious sites without breaking pages or collecting user data.',
    background: {
      service_worker: 'service-worker.js',
    },
    action: {
      default_title: EXTENSION_NAME,
      default_popup: 'src/popup/index.html',
    },
  };
}
