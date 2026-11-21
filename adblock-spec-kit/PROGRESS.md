# PROGRESS — Điểm dừng để làm tiếp

> Trae PHẢI đọc file này đầu mỗi phiên và cập nhật trước mỗi commit.

## Trạng thái
- Giai đoạn hiện tại: P1 (MVP chặn mạng)
- Task đã xong: T001–T004 (P0), T010–T012 (P1)
- Task kế tiếp: T013 (`ruleset-manager.ts`: công tắc tổng; unit + e2e tắt → không chặn)
- Commit/tag mới nhất: (T012 — đang commit)
- Test vàng gần nhất: (chưa chạy — dự kiến T018)

## Dở dang / ghi chú cho phiên sau
- T012 xong: static rulesets được khai báo trong `manifest.config.ts` (`declarative_net_request.rule_resources`, permissions `declarativeNetRequest`, host `<all_urls>`) + `scripts/static-rulesets.ts` (descriptor: id/category/source/output) + `scripts/build-rulesets.ts` (đọc `rules/source/*.txt` → converter T010 → validate T011 → JSON). Vite plugin `adblock-emit-rules` emit `dist/rules/static/*.json`. E2E `tests/e2e/block-ad-script.spec.ts`: script từ `ads.example.test` bị chặn `ERR_BLOCKED_BY_CLIENT`, script cùng origin vẫn chạy. Chạy e2e bằng `xvfb-run -a npm run test:e2e` (cần `npm run build` trước).
- **Lệch nhỏ so với task**: task ghi "bộ rule nhỏ ~1k" nhưng hiện chỉ có ~100 rule (ads 58 + trackers 42) — bộ curated viết tay, không bịa số. Pipeline đã sẵn sàng nhận list lớn (EasyList/EasyPrivacy/URLhaus) ở task `filter-updater` (P2): chỉ cần thêm file `rules/source/*.txt` + descriptor. Ghi license theo từng nguồn ở `rules/README.md`.
- T011 xong: `scripts/validate-rules.ts` (giới hạn + orchestration + report) và `scripts/lib/dnr-schema.ts` (kiểm tra schema mỗi rule). API: `validateRules(input, limits?)`, `assertValidRules` (throw `RulesValidationError` khi có lỗi), hằng `RULE_LIMITS` (MAX_RULESETS=100, MAX_ENABLED_RULESETS=50, MAX_REGEX_RULES=1000, STATIC_RULE_BUDGET=30000). Đã tách file vì bản gộp vượt trần 300 dòng (constitution §12).
- T010 xong: `scripts/build-rules.ts` = converter ABP→DNR tối giản (thuần, không CLI). API: `convertFilterList(lines, category, startId)`, `groupByCategory`, `summarize`. Cú pháp hỗ trợ theo plan §6: pattern `|`/`||`/`^`/`*`, `/regex/`, `@@`, options `third-party`/`~third-party`/`script`/`image`/`xmlhttprequest`/`~<type>`. Ngoài tập đó → bỏ có kiểm soát + ghi báo cáo (`SkipReason`). Priority lấy từ `PRIORITY` (block=500, exception=800, malware=900). File 294 dòng (sát trần 300): nếu cần thêm code, TÁCH module con.
- T004: Playwright nạp extension `dist/`. Chạy headless-CI bằng `xvfb-run -a npm run test:e2e` (bắt buộc `npm run build` trước để có `dist/`).
- T003: `StorageSchema` hiện chỉ có `enabled`; task sau mở rộng. `TypedStorage` inject area để test.
- T002/T012: manifest MV3 có `permissions: ["declarativeNetRequest"]` + `host_permissions: ["<all_urls>"]` + `declarative_net_request.rule_resources` (ads, trackers). Popup build ra `dist/src/popup/index.html`; chưa có icon.

## Quyết định đã chốt (từ clarify.md)
- Chromium v1; UI Vi+En; filter EasyList + EasyPrivacy + URLhaus.
- Converter ABP→DNR: **tự viết tối giản** trong `scripts/build-rules.ts` (không thêm dependency).
- Whitelist theo domain; rule người dùng ở P2 (≤200); tải list trực tiếp có validate; anti-fingerprint opt-in mặc định TẮT; warning có nút "Vẫn tiếp tục".
- Giấy phép code MIT; dữ liệu rule theo giấy phép từng nguồn.
- Đã duyệt thêm `@types/chrome` (type-only) vào plan §6.

## Vấn đề đã biết
(không có)

## Nhật ký
| Ngày | Task | Kết quả | Commit |
|------|------|---------|--------|
| 2026-11-21 | T001 | Khởi tạo Vite + TS strict + ESLint + Prettier + Vitest; typecheck/lint/test/build xanh | bc7b646 |
| 2026-11-21 | T002 | Manifest MV3 tối thiểu + service worker + popup rỗng; build emit `dist/manifest.json`; test xanh | 1c3de47 |
| 2026-11-21 | T003 | `src/shared/` types + constants(PRIORITY) + logger + TypedStorage; 3 unit test mock storage xanh | e03323f |
| 2026-11-21 | T004 | Playwright nạp extension `dist/`; e2e "service worker + popup nạp được" xanh (xvfb); typecheck/lint/test/build/format xanh | 67d423e |
| 2026-11-21 | T010 | `scripts/build-rules.ts` converter ABP→DNR (pattern/`@@`/options/`~`); skip có kiểm soát + báo cáo; 11 unit test (20 dòng mẫu) xanh | 12fefd4 |
| 2026-11-21 | T011 | `scripts/validate-rules.ts` + `scripts/lib/dnr-schema.ts`: kiểm tra schema DNR + giới hạn (regex/ruleset/budget), `assertValidRules` throw khi lỗi; 18 unit test xanh | 1666546 |
| 2026-11-21 | T012 | Khai báo static rulesets (ads/trackers) trong manifest + `rules/source/*.txt` (~100 rule) → `build-rulesets.ts` convert+validate → Vite emit `dist/rules/static/*.json`; e2e script quảng cáo giả bị chặn xanh | (đang commit) |
