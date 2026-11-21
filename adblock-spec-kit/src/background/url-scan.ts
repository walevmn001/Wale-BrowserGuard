/**
 * Local URL scanner (Phase 7).
 *
 * A pure, dependency-free heuristic that never performs a network request and
 * never sends the URL anywhere (Constitution 13). It looks for the patterns
 * phishing pages lean on — punycode, IP-literal hosts, `user@host` tricks,
 * brand names in the wrong place, suspicious TLDs, risky schemes.
 *
 * It deliberately does NOT claim a URL is safe: the best it reports is "no
 * suspicious signs found", because absence from a local list proves nothing.
 */

export type ScanSeverity = 'info' | 'warning' | 'danger';
export type ScanVerdict = 'safe' | 'suspicious' | 'dangerous' | 'unknown';

export interface ScanFinding {
  /** Stable id the UI maps to a localised explanation. */
  readonly id: string;
  readonly severity: ScanSeverity;
}

export interface ScanResult {
  readonly verdict: ScanVerdict;
  readonly host: string;
  readonly findings: readonly ScanFinding[];
}

/** Free/abused TLDs and popular phishing suffixes. */
const SUSPICIOUS_TLDS = new Set([
  'zip',
  'mov',
  'tk',
  'ml',
  'ga',
  'cf',
  'gq',
  'top',
  'xyz',
  'click',
  'country',
  'kim',
  'work',
  'cam',
  'rest',
  'surf',
  'mom',
]);

/** Brands frequently impersonated; a hit outside the registrable domain is a flag. */
const BRANDS = [
  'paypal',
  'google',
  'gmail',
  'facebook',
  'apple',
  'icloud',
  'microsoft',
  'outlook',
  'netflix',
  'amazon',
  'binance',
  'telegram',
  'whatsapp',
];

const RISKY_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:']);

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function labels(host: string): string[] {
  return host.split('.').filter((label) => label !== '');
}

/** Analyses one raw URL string. Never throws; bad input yields `unknown`. */
export function scanUrl(raw: string): ScanResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { verdict: 'unknown', host: '', findings: [] };
  }
  const scheme = `${trimmed.slice(0, trimmed.indexOf(':') + 1).toLowerCase()}`;
  if (RISKY_SCHEMES.has(scheme)) {
    return { verdict: 'dangerous', host: '', findings: [{ id: 'riskyScheme', severity: 'danger' }] };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    try {
      url = new URL(`https://${trimmed}`);
    } catch {
      return { verdict: 'unknown', host: '', findings: [] };
    }
  }

  const host = url.hostname.toLowerCase();
  const parts = labels(host);
  const findings: ScanFinding[] = [];
  const tld = parts.at(-1) ?? '';

  if (host.startsWith('xn--') || parts.some((label) => label.startsWith('xn--'))) {
    findings.push({ id: 'punycode', severity: 'danger' });
  }
  if (IPV4_RE.test(host) || host.startsWith('[')) {
    findings.push({ id: 'ipHost', severity: 'warning' });
  }
  if (url.username !== '' || url.password !== '') {
    findings.push({ id: 'userinfo', severity: 'danger' });
  }
  if (host.length > 40) {
    findings.push({ id: 'longHost', severity: 'warning' });
  }
  if (parts.length >= 5) {
    findings.push({ id: 'manySubdomains', severity: 'warning' });
  }
  if ((host.match(/-/g)?.length ?? 0) >= 4) {
    findings.push({ id: 'manyHyphens', severity: 'warning' });
  }
  if (SUSPICIOUS_TLDS.has(tld)) {
    findings.push({ id: 'suspiciousTld', severity: 'warning' });
  }
  // A brand keyword that is NOT the registrable domain (last two labels) is a
  // classic impersonation ("paypal.com.secure-login.example").
  const registrable = parts.slice(-2).join('.');
  if (parts.length > 2 && BRANDS.some((brand) => host.includes(brand) && !registrable.startsWith(brand))) {
    findings.push({ id: 'brandImpersonation', severity: 'danger' });
  }
  if (trimmed.length > 200) {
    findings.push({ id: 'veryLong', severity: 'warning' });
  }

  const unique = findings.filter(
    (finding, index) => findings.findIndex((other) => other.id === finding.id) === index,
  );
  return { verdict: verdictFor(unique), host, findings: unique };
}

function verdictFor(findings: readonly ScanFinding[]): ScanVerdict {
  if (findings.some((finding) => finding.severity === 'danger')) {
    return 'dangerous';
  }
  if (findings.some((finding) => finding.severity === 'warning')) {
    return 'suspicious';
  }
  return 'safe';
}
