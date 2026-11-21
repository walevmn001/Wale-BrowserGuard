# PROGRESS — Điểm dừng để làm tiếp

> Trae PHẢI đọc file này đầu mỗi phiên và cập nhật trước mỗi commit.
> Ghi chú chi tiết T001–T043, B0–B5, T0 đã chuyển sang `docs/history.md` (không xoá nội dung).

## Trạng thái
- Giai đoạn hiện tại: **P4 ĐÃ XONG (T040–T043)** — tag `phase-P4-done`; **v1.0 ĐÃ PHÁT HÀNH** (tag + GitHub release `v1.0`), asset đã cập nhật lên **v1.0.2**.
- Task đã xong: T001–T004 (P0), T010–T018 (P1), T020–T025 (P2), T030–T037 (P3), T040–T043 (P4 — **nay đổi số thành T090–T093/P7**); Prompt 14 (B0–B5); Prompt 15 (B2 + G1 + D1 → `v1.0`).
- **Giai đoạn hiện tại: P5 (module YouTube) — ĐANG LÀM.** T060 ĐÃ XONG (2026-11-22): `data/youtube-config.json` + validator `src/shared/youtube-config.ts` + cờ `youtubeModule` trong settings; tổng unit 319/319, lint/typecheck/build xanh.
- **Hợp nhất tài liệu (MERGE, không đổi code)**: đồng bộ khung Spec Kit mở rộng P1–P7 từ thư mục tạm — constitution mục VI (luật YouTube/MAIN world) + dòng giai đoạn P1–P7; spec.md thêm US-8…US-17 (+US-14); plan.md thêm Phụ lục (thư mục/quyền/rủi ro); algorithm.md thêm mục H–T (Q = module YouTube 6 lớp); tasks.md thêm T005, T038–T042 (P3), P4 (T050–T058), P5 (T060–T069), P6 (T080–T082), P7 (T090–T093 — đổi số từ P4 cũ T040–T043); thêm `templates/ci.yml`, `prompts/11-youtube-module.md`, `specs/001-adblock-security/test-golden.md`; cập nhật README + `.trae/rules/project_rules.md` (mục 4b).
- Task kế tiếp: **Prompt 16 — nâng độ phủ chặn** (KHÔNG đổi giấy phép MIT, KHÔNG dùng list copyleft, KHÔNG vá theo từng domain của bài test; rule chặn chỉ tầng sub-resource):
  - **T0 ĐÃ XONG** — dọn `PROGRESS.md` (≤ ~80 dòng), chuyển chi tiết sang `docs/history.md`.
  - **B2b-1 ĐÃ XONG** — 14 rule prefix `||<prefix>.$third-party` (ads: `ads`,`ad`,`adserver`,`adx`; trackers: `analytics`,`metrics`,`telemetry`,`tracking`,`tracker`,`pixel`,`trk`,`events`,`stats`,`beacon`), không `resourceTypes` ⇒ không `main_frame`; test unit 45/45, e2e "phải cho qua" 36 host + e2e "chặn mỗi prefix" 14 host đều xanh; toàn bộ e2e 38/38, unit 282/282.
  - **B2b-2 ĐÃ XONG** — 11 host theo họ hãng (không `resourceTypes` ⇒ chỉ chặn sub-resource): ads `||an.yandex.ru^`,`||adfox.yandex.ru^`,`||adfstat.yandex.ru^`,`||bat.bing.com^`,`||gemini.yahoo.com^`; trackers `||mc.yandex.ru^`,`||an.facebook.com^`,`||udc.yahoo.com^`,`||pixel.reddit.com^`,`||tr.snapchat.com^`,`||px.ads.linkedin.com^`; test đỏ trước (unit 11 đỏ) rồi xanh; e2e tracker-host mở rộng lên 31 host × 2 (fetch+image); toàn bộ unit 293/293, e2e 38/38.
  - **B2b-3 ĐÃ XONG** — bộ vàng thêm **36 host "phải cho qua"** (`BENIGN_HOSTS` ở `tests/golden/fixtures.ts`; resolver `FIXTURE_HOSTS` map cả host chặn lẫn host benign) + test **"B2b-3 guard"** (đặt TRƯỚC AC-1.3 để nhiễu trễ không che khuất); `results.ts` thêm mục **`benignHosts`** (36/36 thăm dò, 0 bị chặn); **validate-rules**: +3 test tích hợp chạy `validateRules` trên ruleset thật (ngân sách DNR) ở `tests/unit/build-rulesets.test.ts`. Test vàng: **5 lần xanh** (delta 3.5–4.5ms) / 4 lần chỉ trượt AC-1.3 do tải host ≥4. Toàn bộ unit **296/296**.
  - Chưa làm: _(không — Prompt 16 B0–B2b xong; còn G1 bằng URL thật do người dùng điền ở mục dưới.)_
- Test vàng gần nhất: 2026-11-21 (B2b-3) — chặn **173/173 (100%)**, vỡ **0/40 (0%)**, trễ **+4.5ms**, restart pass, heap **1.235MB**, host benign **36/36 không bị chặn** (`tests/golden/results/2026-11-21.json`).
- **Mốc Toolz (Kiwi, chỉ số phụ)**: tắt ~10% → trước sửa ~36% → sau B1/B3/B4 ~52% → sau B2 **69/135 (~51%)**; theo nhóm Ads 16/20, Analytics 26/30, Error 5/6, **Social 7/20**, Mix 8/20, OEM 3/35, **bỏ-OEM 62/96 (~65%)**.
- Mục tiêu v1 (chỉ số phụ): bỏ-OEM ≥80%, tổng ≥55%, **Social ≥80%**, Ads/Analytics/Error ≥80%. **Tiêu chí thật: vỡ trang ≤2%.**
- Baseline v1 & 4 lỗi gốc: `docs/diagnose-baseline.md` §6.

## Quyết định đã chốt
- Chromium v1; UI Vi+En; giấy phép code **MIT**; danh sách rule **tự soạn** (KHÔNG dùng EasyList/EasyPrivacy/URLhaus hay list NC-SA của trang test).
- Converter ABP→DNR tự viết (`scripts/build-rules.ts`); whitelist theo domain; warning có nút "Vẫn tiếp tục"; anti-fingerprint + WebRTC opt-in mặc định TẮT.
- Rule chặn **chỉ áp sub-resource**: KHÔNG đặt `resourceTypes` → không khớp `main_frame` (T033) → người dùng vẫn mở được trang của hãng.
- Không chặn domain dùng chung/đăng nhập/thanh toán/CDN (`amazonaws.com`, `cloudfront.net`, `googleapis.com`, `gstatic.com`, `cloudflare*`, `akamai*`, `fbcdn.net`, `accounts.*`, `login.*`, `pay.*`, `checkout.*`…).
- Đếm chặn dùng `declarativeNetRequestFeedback` + `getMatchedRules` (không dùng `onRuleMatchedDebug`).

## Vấn đề đã biết
- **AC-1.3 nhạy nhiễu** dưới tải host (`nproc=2`): có thể phải chạy lại vài lần mới xanh; chặn/vỡ/restart/bộ nhớ luôn ổn định.
- `Freshworks/Freshmarketer` tracker host: `TODO(verify)`, chưa thêm (tránh chặn nhầm `fw-cdn` dùng chung).
- `filter-updater` (T023) mới validate/lưu mô tả list tải về, **chưa** biến thành rule chặn — việc giai đoạn sau.

## Dở dang / việc kế tiếp
- **P5 (module YouTube) — T060 ĐÃ XONG (2026-11-22)**: `data/youtube-config.json` (schema `{version, enabled, layers{network,prune,cosmetic,skip,health}, adFields, endpoints, selectors, skipSelectors}` — mọi giá trị TODO(verify) với trang thật), validator `src/shared/youtube-config.ts` (`isYouTubeConfig`, có giới hạn kích thước theo Constitution 9), cờ `youtubeModule` trong `StorageSchema` + `src/background/youtube-settings.ts` (mặc định TẮT). Test `tests/unit/youtube-config.test.ts` 23 test; tổng unit **319/319**, lint/typecheck/build xanh. **Task kế tiếp: T061 — trang mock YouTube cho e2e.** Lưu ý: `data/youtube-config.json` CHƯA được emit vào `dist/` (việc phát hành/đóng gói thuộc T062/T067).
- **Phát hành `1.0.2`**: ĐÃ XONG — bump `1.0.1` → `1.0.2` (`package.json` + `EXTENSION_VERSION`), zip `release/adblock-security-1.0.2.zip` (32 file, md5 `81c00bc2010ccd704de2fcc215a521d4`, sha256 `ad4e75380819e2710def77e121f65c29ceaaedbf49c69c684a7cd5f757535bf2`), cập nhật asset cho release `v1.0` (giữ nguyên tag `v1.0`). (Trước đó: `1.0.1` = B2b-1, `1.0.0` = v1.0.)
- **Sau B2b**: nếu vẫn chưa đạt mục tiêu Toolz → người dùng quyết định (mở rộng thủ công hoặc đổi giấy phép); Trae KHÔNG tự quyết.
- **G1 bằng URL thật do người dùng điền** vẫn phải làm trước khi gắn `v1.0` (hiện có khung 40 trang offline).
- Nhật ký chi tiết (từng task + commit): `docs/history.md`.
