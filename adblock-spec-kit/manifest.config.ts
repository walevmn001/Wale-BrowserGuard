/**
 * Manifest V3 definition for the AdBlock Security extension.
 *
 * Kept as a typed module so the build can emit `dist/manifest.json` and so the
 * shape can be unit-tested. T012 adds the P1 network-blocking surface: the
 * `declarativeNetRequest` permission, `<all_urls>` host permission (so rules
 * apply on every site) and the static rulesets produced by the build
 * (see `STATIC_RULESETS`). T021 adds the `scripting` permission so the worker
 * can inject cosmetic element-hiding CSS (algorithms §D). T023 adds `alarms` so
 * the filter lists refresh on a schedule (algorithm §E). T024 adds the options
 * page (per-group toggles, manual update). T030 adds the `web_accessible_resources`
 * entry for the malware warning page (the malware ruleset's redirect target).
 * T031 adds `key`, which fixes the extension id so the malware rule can embed a
 * `chrome-extension://` redirect URL that carries the blocked host.
 * All of these are justified in plan.md §3.
 */
import { EXTENSION_KEY } from './scripts/extension-key.ts';
import { STATIC_RULESETS } from './scripts/static-rulesets.ts';

export interface RuleResource {
  readonly id: string;
  readonly enabled: boolean;
  readonly path: string;
}

export interface ManifestV3 {
  readonly manifest_version: 3;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly background: {
    readonly service_worker: string;
    /**
     * The worker is emitted as an ES module (it shares chunks with the popup),
     * so the manifest must declare it as one — a classic worker cannot `import`.
     */
    readonly type: 'module';
  };
  readonly action: {
    readonly default_title: string;
    readonly default_popup: string;
  };
  readonly options_ui: {
    readonly page: string;
    readonly open_in_tab: boolean;
  };
  /**
   * Base64 DER public key. Fixes the extension id so DNR rules can embed
   * `chrome-extension://<id>/…` redirect URLs (T031).
   */
  readonly key: string;
  readonly permissions: readonly string[];
  readonly host_permissions: readonly string[];
  readonly web_accessible_resources: readonly {
    readonly resources: readonly string[];
    readonly matches: readonly string[];
  }[];
  readonly declarative_net_request: {
    readonly rule_resources: readonly RuleResource[];
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
      type: 'module',
    },
    action: {
      default_title: EXTENSION_NAME,
      default_popup: 'src/popup/index.html',
    },
    options_ui: {
      page: 'src/options/index.html',
      open_in_tab: true,
    },
    key: EXTENSION_KEY,
    permissions: [
      'declarativeNetRequest',
      'declarativeNetRequestFeedback',
      'storage',
      'scripting',
      'alarms',
    ],
    host_permissions: ['<all_urls>'],
    // T030: the malware ruleset redirects a blocked top-level navigation to the
    // warning page, so that page must be reachable from a web-initiated
    // navigation.
    web_accessible_resources: [
      {
        resources: ['src/warning/warning.html'],
        matches: ['<all_urls>'],
      },
    ],
    declarative_net_request: {
      rule_resources: STATIC_RULESETS.map(({ id, enabled, output }) => ({
        id,
        enabled,
        path: output,
      })),
    },
  };
}
