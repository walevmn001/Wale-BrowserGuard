/**
 * Golden-test fixtures (T018 / specs/001-adblock-security/test-golden.md).
 *
 * The suite must run offline (CI has no reliable network), so instead of
 * fetching real pages it serves synthetic pages from a local HTTP server. Every
 * page pulls a few *known* ad/tracker resources — hosts covered by the packaged
 * rules — plus same-origin scripts that must keep working.
 *
 * Crucially the ad hostnames are resolved to the local server through Chromium's
 * `--host-resolver-rules`, so a request that is *not* blocked really loads. That
 * makes blocking observable as `ERR_BLOCKED_BY_CLIENT` versus a successful
 * response, instead of the indistinguishable DNS failure a fake host produces.
 *
 * The hosts below are exactly the host-anchored rules in
 * `rules/source/{ads,trackers}.txt`; path-only rules (e.g.
 * `newrelic.com/insights^`) and the allow exception are left out.
 */

/** Ad-server hosts covered by the packaged `ads` ruleset. */
export const AD_HOSTS: readonly string[] = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  '2mdn.net',
  'ads.yahoo.com',
  'adnxs.com',
  'advertising.com',
  'criteo.com',
  'criteo.net',
  'outbrain.com',
  'taboola.com',
  'adform.net',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'casalemedia.com',
  '33across.com',
  'sharethrough.com',
  'smartadserver.com',
  'media.net',
  'amazon-adsystem.com',
  'moatads.com',
  'serving-sys.com',
  'adcolony.com',
  'applovin.com',
  'unityads.unity3d.com',
  'inmobi.com',
  'mopub.com',
  'adtech.de',
  'adsafeprotected.com',
  'teads.tv',
  'spotxchange.com',
  'yieldmo.com',
  'indexexchange.com',
  'districtm.io',
  'smaato.net',
  'flashtalking.com',
  'adroll.com',
  'bidswitch.net',
  'triplelift.com',
  'zemanta.com',
  'adition.com',
  'lijit.com',
  'sovrn.com',
  'gumgum.com',
  'adsrvr.org',
  'tremorhub.com',
  'innovid.com',
  'yieldlab.net',
  '360yield.com',
  'adkernel.com',
  'adotmob.com',
  'brightcom.com',
  'conversantmedia.com',
];

/** Tracker hosts covered by the packaged `trackers` ruleset. */
export const TRACKER_HOSTS: readonly string[] = [
  'google-analytics.com',
  'analytics.google.com',
  'googletagmanager.com',
  'scorecardresearch.com',
  'quantserve.com',
  'quantcast.com',
  'hotjar.com',
  'mixpanel.com',
  'segment.io',
  'segment.com',
  'amplitude.com',
  'mouseflow.com',
  'crazyegg.com',
  'fullstory.com',
  'heapanalytics.com',
  'branch.io',
  'adjust.com',
  'appsflyer.com',
  'kochava.com',
  'chartbeat.com',
  'parsely.com',
  'cxense.com',
  'bluekai.com',
  'demdex.net',
  'omtrdc.net',
  'everesttech.net',
  'krxd.net',
  'tapad.com',
  'matomo.cloud',
  'piwik.pro',
  'statcounter.com',
  'clicky.com',
  'trak.io',
  'kissmetrics.com',
  'optimizely.com',
  'vwo.com',
  'bugsnag.com',
  'raygun.io',
  'siftscience.com',
  'adobe-analytics.com',
  'agkn.com',
];

/** Every host the packaged rules are expected to block. */
export const KNOWN_HOSTS: readonly string[] = [...AD_HOSTS, ...TRACKER_HOSTS];

/** Same-origin scripts every page loads; if any is blocked the page is "broken". */
export const BENIGN_PATHS: readonly string[] = ['/assets/app.js', '/assets/main.js'];

/** Whether a request URL targets a host the rules are meant to block. */
export function isKnownHost(url: string): boolean {
  try {
    return KNOWN_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export interface GoldenPage {
  readonly group: string;
  readonly slug: string;
  /** Ad/tracker hostnames this page pulls (empty for pages that must never break). */
  readonly ads: readonly string[];
  /** Same-origin script paths that must still load. */
  readonly benign: readonly string[];
}

/** Category sizes mirror test-golden.md §1 (news 8, video 5, shopping 6, …). */
const GROUPS: readonly { readonly group: string; readonly count: number; readonly ads: number }[] =
  [
    { group: 'news', count: 8, ads: 6 },
    { group: 'video', count: 5, ads: 5 },
    { group: 'shopping', count: 6, ads: 5 },
    { group: 'social', count: 4, ads: 4 },
    { group: 'banking', count: 5, ads: 0 },
    { group: 'tools', count: 6, ads: 4 },
    { group: 'blog', count: 6, ads: 5 },
  ];

function hostAt(index: number): string {
  const host = KNOWN_HOSTS[index % KNOWN_HOSTS.length];
  if (host === undefined) {
    throw new Error('KNOWN_HOSTS is empty');
  }
  return host;
}

/** The deterministic set of fixture pages; ad hosts rotate through KNOWN_HOSTS. */
export function goldenPages(): readonly GoldenPage[] {
  const pages: GoldenPage[] = [];
  let cursor = 0;
  for (const { group, count, ads } of GROUPS) {
    for (let index = 0; index < count; index += 1) {
      const hosts: string[] = [];
      for (let slot = 0; slot < ads; slot += 1) {
        hosts.push(hostAt(cursor));
        cursor += 1;
      }
      pages.push({
        group,
        slug: `${group}-${index + 1}`,
        ads: hosts,
        benign: [...BENIGN_PATHS],
      });
    }
  }
  return pages;
}

export function pagePath(page: GoldenPage): string {
  return `/golden/${page.slug}`;
}

/** HTML for a fixture page. Ad scripts are cross-host; benign ones same-origin. */
export function buildPageHtml(page: GoldenPage, port: number): string {
  const adScripts = page.ads
    .map((host) => `<script src="http://${host}:${port}/ad.js"></script>`)
    .join('\n    ');
  const benignScripts = page.benign.map((path) => `<script src="${path}"></script>`).join('\n    ');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${page.slug}</title>
    ${adScripts}
    ${benignScripts}
  </head>
  <body>
    <div id="main">${page.slug}</div>
    <script>window.__ready = true;</script>
  </body>
</html>`;
}
