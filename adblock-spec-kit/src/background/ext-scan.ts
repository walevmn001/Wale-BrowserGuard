/**
 * T080 — optional installed-extension scan (algorithm.md §S, US-16 / AC-16.1).
 *
 * The extension can only see *other* installed extensions when the user grants
 * the optional `management` permission, asked for when they press "Scan". The
 * scan only **reports**: risk is a transparent weighted sum of the permissions
 * an extension holds plus a nudge for unpacked / self-updating-off installs.
 * It never disables or removes anything (AC-16.1) — the user decides.
 *
 * `scoreExtension` is pure (no `chrome`) so the scoring is unit-tested; the
 * `management` API is injected so tests can pass a fake.
 */

/** Permission → risk points. A permission absent from the table scores 0. */
const PERMISSION_WEIGHTS: Readonly<Record<string, number>> = {
  debugger: 40,
  proxy: 40,
  nativeMessaging: 35,
  webRequest: 30,
  webRequestBlocking: 30,
  management: 25,
  cookies: 20,
  history: 20,
  clipboardRead: 15,
  downloads: 10,
  tabs: 10,
  geolocation: 10,
};

/** Broad host access (any site) is a strong signal on its own. */
const BROAD_HOST_WEIGHT = 30;
/** Unpacked / sideloaded extensions bypass store review. */
const UNPACKED_WEIGHT = 20;
/** An install that cannot auto-update from the store misses security fixes. */
const NO_UPDATE_WEIGHT = 10;

const BROAD_HOSTS = new Set(['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*']);

/** The subset of `chrome.management.ExtensionInfo` the scan reads. */
export interface ScanInput {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly enabled: boolean;
  readonly permissions: readonly string[];
  readonly hostPermissions: readonly string[];
  readonly installType: string;
  readonly updateUrl?: string;
}

/** Why an extension scored what it did — mapped to a label by the UI. */
export type RiskReason =
  | { readonly kind: 'permission'; readonly permission: string }
  | { readonly kind: 'broadHosts' }
  | { readonly kind: 'unpacked' }
  | { readonly kind: 'noUpdate' };

export interface ExtensionRisk {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly score: number;
  readonly reasons: readonly RiskReason[];
}

/** Scores one extension and records each contributing reason (pure). */
export function scoreExtension(input: ScanInput): ExtensionRisk {
  const reasons: RiskReason[] = [];
  let score = 0;

  for (const permission of input.permissions) {
    const weight = PERMISSION_WEIGHTS[permission];
    if (weight !== undefined) {
      score += weight;
      reasons.push({ kind: 'permission', permission });
    }
  }

  if (input.hostPermissions.some((host) => BROAD_HOSTS.has(host))) {
    score += BROAD_HOST_WEIGHT;
    reasons.push({ kind: 'broadHosts' });
  }

  if (input.installType === 'development' || input.installType === 'sideload') {
    score += UNPACKED_WEIGHT;
    reasons.push({ kind: 'unpacked' });
  }

  if (input.installType !== 'normal' && (input.updateUrl ?? '') === '') {
    score += NO_UPDATE_WEIGHT;
    reasons.push({ kind: 'noUpdate' });
  }

  return { id: input.id, name: input.name, enabled: input.enabled, score, reasons };
}

/** The slice of `chrome.management` the scanner needs (injected for tests). */
export interface ManagementApi {
  getAll(): Promise<readonly ScanInput[]>;
}

/** Scores every other installed extension, riskiest first (AC-16.1). */
export async function scanExtensions(
  api: ManagementApi,
  selfId: string,
): Promise<readonly ExtensionRisk[]> {
  const all = await api.getAll();
  return all
    .filter((entry) => entry.type === 'extension' && entry.id !== selfId)
    .map(scoreExtension)
    .sort((a, b) => b.score - a.score);
}
