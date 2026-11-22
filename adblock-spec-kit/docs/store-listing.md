# Store listing — AdBlock Security

Copy and metadata for publishing on the Chrome Web Store (and Edge/Brave, which
reuse the same package). Values marked **TODO(verify)** must be filled in before
submitting.

## Basics

| Field | Value |
|-------|-------|
| Name (≤ 45 chars) | AdBlock Security |
| Version to publish | matches `dist/manifest.json` (built from `manifest.config.ts`) |
| Category | Privacy & Security |
| Languages | English, Tiếng Việt |
| Default locale | English |
| Privacy policy URL | TODO(verify) — host `docs/privacy-policy.md` and link it here |
| Support URL | TODO(verify) — repository issues page or a contact page |
| Homepage URL | TODO(verify) |

## Short description (≤ 132 chars)

**EN:** Blocks ads, trackers and malicious sites — fast, private, no data
collection.

**VI:** Chặn quảng cáo, tracker và trang độc hại — nhanh, riêng tư, không thu
thập dữ liệu.

## Detailed description

**EN:**

> AdBlock Security keeps pages fast, clean and safe without breaking them or
> watching you.
>
> • **Blocks ads and trackers** at the browser's network layer, so blocking is
> fast and stable.
> • **Hides leftover ad placeholders** (cosmetic filtering) so layouts look whole.
> • **Warns about malicious and phishing sites** and lets you step back.
> • **Extra privacy options**: upgrade to HTTPS, strip tracking parameters (utm_,
> fbclid, gclid, …), trim Referer, block WebRTC IP leaks, and a basic
> anti-fingerprinting mode — all opt-in, off by default.
> • **Local-only statistics**: see how many requests were blocked; nothing leaves
> your device. There is no account and no telemetry.
> • Bilingual UI (English / Tiếng Việt).
>
> Open the popup to pause on the current site or turn everything off, and the
> options page to tune each list.

**VI:**

> AdBlock Security giữ trang web nhanh, sạch và an toàn — mà không làm vỡ trang và
> không theo dõi bạn.
>
> • **Chặn quảng cáo và trình theo dõi** ở tầng mạng của trình duyệt nên chặn
> nhanh và ổn định.
> • **Ẩn khung quảng cáo còn sót** (cosmetic) để bố cục trang trông vẹn toàn.
> • **Cảnh báo trang độc hại/phishing** và cho bạn quay lại.
> • **Tuỳ chọn riêng tư thêm**: nâng cấp HTTPS, bỏ tham số theo dõi (utm_, fbclid,
> gclid, …), cắt Referer, chặn rò IP qua WebRTC, và chế độ chống fingerprint cơ
> bản — đều là opt-in, mặc định TẮT.
> • **Thống kê chỉ cục bộ**: xem số request đã chặn; không gì rời khỏi máy bạn.
> Không tài khoản, không telemetry.
> • Giao diện song ngữ (English / Tiếng Việt).
>
> Mở popup để tạm dừng trên trang hiện tại hoặc tắt toàn bộ; mở trang options để
> tinh chỉnh từng nhóm list.

## Permission justifications (required by the review form)

| Permission | Justification |
|------------|---------------|
| `declarativeNetRequest` | Block and redirect ad, tracker and malware requests using static and dynamic rules. |
| `declarativeNetRequestFeedback` | Read which rules matched so the popup can show a local per-tab and total block count. |
| `storage` | Save settings, the whitelist and the local block counters on the user's device. |
| `scripting` | Inject the cosmetic CSS that hides leftover ad placeholders. |
| `alarms` | Refresh the filter lists on a schedule. |
| `privacy` | Apply the opt-in WebRTC IP-handling policy when the user enables it. |
| `notifications` | Show local desktop notifications (filter-list updates, security blocks, YouTube auto-degrade). Every kind is off by default until the user enables it. |
| `host_permissions: <all_urls>` | Blocking rules must apply on every site to be effective. Rules run in the network layer; no page content is read or transmitted. |

Optional permissions (requested only when the matching feature is turned on):

| Permission | Justification |
|------------|---------------|
| `management` (optional) | List the user's installed extensions with a risk score when they open the "Advanced" page and press Scan. The extension never disables or removes anything (AC-16.1). |

## Data usage disclosures (review form)

- **Does the extension collect user data?** No. Select "This item has no data
  collection" (nothing is transmitted off the device).
- **Remote code:** No. The extension loads only **data** (filter lists), never
  code. This satisfies the "no remote code" policy.
- **Data sold to third parties:** No.

## Chrome Web Store policy review (T093)

A self-review against the CWS program policies, focused on the part reviewers
scrutinize most: the **MAIN-world scripts** in the YouTube module.

| Policy | How we comply |
|--------|---------------|
| **Single purpose** | One purpose: block ads/trackers/malware and the optional privacy protections. The YouTube module is a *separate, opt-in* switch, clearly presented as best-effort and off by default, so the core purpose stays narrow. |
| **Remote code use** | Prohibited: we run **no remote code**. Filter lists and the YouTube config are **data** (JSON), never executed. All injected functions are bundled in the package and shipped as source (`chrome.scripting.executeScript({ func })`), so no string is ever `eval`'d or fetched. |
| **Use of injected scripts** | We use `chrome.scripting` (not the `chrome.userScripts` API), so no user-script permission flow is involved. MAIN-world injection is limited to the **opt-in** YouTube module and the **opt-in** anti-fingerprinting mode. |
| **Minimum permissions** | Broad permissions (`management`) are **optional** and requested only in-window when the user presses Scan. See the justifications above. |
| **Data usage / privacy** | No data collection, no sale, no transmission. The privacy policy says so plainly; the review form selects "no data collection". |

**TODO(verify) — MAIN-world scripts.** The YouTube module (Q2/Q4) and the
opt-in anti-fingerprinting mode inject functions into the page's MAIN world via
`chrome.scripting.executeScript({ world: 'MAIN' })`. This is a **supported,
documented API** and is *not* remote code — but MAIN-world injection is a common
review trigger. Before submitting:

- Confirm the current CWS wording on `scripting`-injected scripts and
  `world: 'MAIN'` (see [Chrome docs: executeScript](https://developer.chrome.com/docs/extensions/reference/api/scripting#method-executeScript)
  and the [program policies](https://developer.chrome.com/docs/webstore/program-policies/)).
- Keep the module **off by default** and behind the explicit risk banner it
  already shows, so injection only happens after a deliberate user opt-in.
- If a reviewer objects, the fallback is to ship without the MAIN-world layers
  (network DNR + cosmetic CSS still work) — document this in the release notes.

## Graphic assets (TODO(verify) — produce before submitting)

- Store icon 128×128 PNG.
- At least one screenshot 1280×800 (popup + options).
- Small promo tile 440×280 PNG.

## Pre-submission checklist

- [ ] `npm run build` succeeds and `dist/manifest.json` version is bumped.
- [ ] `npm run package` produces `release/adblock-security-<version>.zip`.
- [ ] Privacy policy hosted and URL set above.
- [ ] All `TODO(verify)` items resolved.
- [ ] Screenshots and promo assets uploaded.
