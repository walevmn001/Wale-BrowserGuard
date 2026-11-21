# rules/

Filter-list data and the DNR rulesets generated from it.

## Layout

- `source/` — hand-maintained ABP filter lines committed to the repo; the build
  converts them (see `scripts/build-rules.ts`). `ads.txt`, `trackers.txt`.
- `static/` — **generated** at build time into `dist/rules/static/*.json`
  (not committed); referenced by `manifest.json`.

The list of rulesets, their source files and output paths lives in
`scripts/static-rulesets.ts` — the single source of truth shared by the manifest
and the build.

## Sources & license

The P1 starter lists are a small, curated set of well-known ad/tracker hosts,
written for this project (MIT, same as the code). They are deliberately narrow
(domain-anchored) so pages are not broken.

`trackers.txt` was extended in B2 with Social / ad-pixel / error-tracking hosts
(Facebook/Meta, TikTok, Pinterest, Twitter/X, Reddit, Sentry, LuckyOrange,
Yahoo analytics, Taboola, Outbrain). These entries are **self-authored for this
project (MIT)** and were *not* copied from any third-party list — in particular
not from the test site's domain list (NC-SA).

B2b-1 added **generic subdomain-prefix** rules of the form `||<prefix>.` with
`$third-party` — ad prefixes (`ads`, `ad`, `adserver`, `adx`) in `ads.txt`,
measurement prefixes (`analytics`, `metrics`, `telemetry`, `tracking`,
`tracker`, `pixel`, `trk`, `events`, `stats`, `beacon`) in `trackers.txt`.
These names are public ad/measurement conventions, **self-authored for this
project (MIT)**, not copied from any list. The trailing dot keeps the anchor on
a label boundary (so `||ads.` cannot match `adserver.com`); `$third-party` and
the absence of `resourceTypes` keep the rules off first-party requests and off
top-level navigation. `tests/e2e/allow-benign-hosts.spec.ts` guards against
over-blocking with a list of legitimate hosts that must never be blocked.

B2b-2 added the **vendor-specific** endpoints the `<prefix>.` convention cannot
reach (their first label is not an ad/measurement word): ad servers
(`an.yandex.ru`, `adfox.yandex.ru`, `adfstat.yandex.ru`, `bat.bing.com`,
`gemini.yahoo.com`) in `ads.txt`, and Social / measurement hosts
(`mc.yandex.ru`, `an.facebook.com`, `udc.yahoo.com`, `pixel.reddit.com`,
`tr.snapchat.com`, `px.ads.linkedin.com`) in `trackers.txt`. Same policy and
license as above — domain-anchored, no `resourceTypes`, **self-authored for this
project (MIT)**, not copied from any list.

Full third-party lists (EasyList, EasyPrivacy, URLhaus) are layered in later
tasks. Each must carry its own license note here when added, e.g.:

- EasyList / EasyPrivacy — GPLv3 / CC BY-SA 3.0 (per upstream project).
- URLhaus — CC0 / public domain (verify at time of bundling).

## E2E fixture

`tests/e2e/block-ad-script.spec.ts` depends on the line `||ads.example.test^`
in `source/ads.txt`. Do not remove it without updating the test.
