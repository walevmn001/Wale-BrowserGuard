# PROGRESS — Điểm dừng để làm tiếp

> Trae PHẢI đọc file này đầu mỗi phiên và cập nhật trước mỗi commit.
> Ghi chú chi tiết T001–T043, B0–B5, T0 đã chuyển sang `docs/history.md` (không xoá nội dung).

## Trạng thái
- Giai đoạn hiện tại: **P4 ĐÃ XONG (T040–T043)** — tag `phase-P4-done`; **v1.0 ĐÃ PHÁT HÀNH** (tag + GitHub release `v1.0`), asset đã cập nhật lên **v1.0.1**.
- Task đã xong: T001–T004 (P0), T010–T018 (P1), T020–T025 (P2), T030–T037 (P3), T040–T043 (P4); Prompt 14 (B0–B5); Prompt 15 (B2 + G1 + D1 → `v1.0`).
- Task kế tiếp: **Prompt 16 — nâng độ phủ chặn** (KHÔNG đổi giấy phép MIT, KHÔNG dùng list copyleft, KHÔNG vá theo từng domain của bài test; rule chặn chỉ tầng sub-resource):
  - **T0 ĐÃ XONG** — dọn `PROGRESS.md` (≤ ~80 dòng), chuyển chi tiết sang `docs/history.md`.
  - **B2b-1 ĐÃ XONG** — 14 rule prefix `||<prefix>.$third-party` (ads: `ads`,`ad`,`adserver`,`adx`; trackers: `analytics`,`metrics`,`telemetry`,`tracking`,`tracker`,`pixel`,`trk`,`events`,`stats`,`beacon`), không `resourceTypes` ⇒ không `main_frame`; test unit 45/45, e2e "phải cho qua" 36 host + e2e "chặn mỗi prefix" 14 host đều xanh; toàn bộ e2e 38/38, unit 282/282.
  - Chưa làm: **B2b-2** (theo họ hãng/Social), **B2b-3** (validate-rules + test vàng ×≥3 + báo cáo).
- Test vàng gần nhất: 2026-11-21 (B2b-1) — chặn **173/173 (100%)**, vỡ **0/40 (0%)**, trễ **+4.95ms**, restart pass, heap **0.947MB** (`tests/golden/results/2026-11-21.json`).
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
- **Phát hành `1.0.1`**: ĐÃ XONG — bump `1.0.0` → `1.0.1`, zip `release/adblock-security-1.0.1.zip` (md5 `2d0c64c9118ef327e6d4048f82724621`), cập nhật asset cho release `v1.0` (giữ nguyên tag `v1.0`).
- **Sau B2b**: nếu vẫn chưa đạt mục tiêu Toolz → người dùng quyết định (mở rộng thủ công hoặc đổi giấy phép); Trae KHÔNG tự quyết.
- **G1 bằng URL thật do người dùng điền** vẫn phải làm trước khi gắn `v1.0` (hiện có khung 40 trang offline).
- Nhật ký chi tiết (từng task + commit): `docs/history.md`.
