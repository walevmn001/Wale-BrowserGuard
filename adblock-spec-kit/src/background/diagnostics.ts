/**
 * Diagnostics report (Phase 9 §7).
 *
 * A pure formatter over already-gathered facts, so both the dashboard and the
 * unit tests can call it without a browser. It contains version, engine state,
 * module status and errors — never browsing history or personal URLs.
 */

export interface ModuleStatus {
  readonly id: string;
  readonly label: string;
  readonly on: boolean;
}

export interface DiagnosticsInput {
  readonly version: string;
  readonly browser: string;
  readonly enabledRuleSets: readonly string[];
  readonly disabledRuleSets: readonly string[];
  readonly lastUpdate: number | null;
  readonly storageBytes: number | null;
  readonly modules: readonly ModuleStatus[];
  readonly permissions: readonly string[];
  readonly errors: readonly string[];
}

/** Renders a human-readable, copy-pasteable report. */
export function buildDiagnostics(input: DiagnosticsInput): string {
  const lines: string[] = [
    'WALE GUARD — diagnostics',
    `version: ${input.version}`,
    `browser: ${input.browser}`,
    `enabled rulesets: ${list(input.enabledRuleSets)}`,
    `disabled rulesets: ${list(input.disabledRuleSets)}`,
    `last filter update: ${formatTime(input.lastUpdate)}`,
    `storage used: ${input.storageBytes === null ? 'unknown' : `${input.storageBytes} B`}`,
    'modules:',
    ...input.modules.map((module) => `  - ${module.id}: ${module.on ? 'on' : 'off'} (${module.label})`),
    `permissions: ${list(input.permissions)}`,
    `errors: ${input.errors.length === 0 ? 'none' : String(input.errors.length)}`,
    ...input.errors.map((error) => `  ! ${error}`),
  ];
  return lines.join('\n');
}

function list(items: readonly string[]): string {
  return items.length === 0 ? 'none' : items.join(', ');
}

function formatTime(time: number | null): string {
  return time === null ? 'never' : new Date(time).toISOString();
}
