# PROGRESS — Điểm dừng để làm tiếp

> Trae PHẢI đọc file này đầu mỗi phiên và cập nhật trước mỗi commit.

## Trạng thái
- Giai đoạn hiện tại: P1 (MVP chặn mạng)
- Task đã xong: T001–T004 (P0), T010, T011 (P1)
- Task kế tiếp: T012 (khai báo static rulesets + bộ rule nhỏ ~1k + build integration)
- Commit/tag mới nhất: (T011 — đang commit)
- Test vàng gần nhất: (chưa chạy — dự kiến T018)

## Dở dang / ghi chú cho phiên sau
- T011 xong: `scripts/validate-rules.ts` (giới hạn + orchestration + report) và `scripts/lib/dnr-schema.ts` (kiểm tra schema mỗi rule). API: `validateRules(input, limits?)`, `assertValidRules` (throw `RulesValidationError` khi có lỗi), hằng `RULE_LIMITS` (MAX_RULESETS=100, MAX_ENABLED_RULESETS=50, MAX_REGEX_RULES=1000, STATIC_RULE_BUDGET=30000). Đã tách file vì bản gộp vượt trần 300 dòng (constitution §12).
- T010 xong: `scripts/build-rules.ts` = converter ABP→DNR tối giản (thuần, không CLI). API: `convertFilterList(lines, category, startId)`, `groupByCategory`, `summarize`. Cú pháp hỗ trợ theo plan §6: pattern `|`/`||`/`^`/`*`, `/regex/`, `@@`, options `third-party`/`~third-party`/`script`/`image`/`xmlhttprequest`/`~<type>`. Ngoài tập đó → bỏ có kiểm soát + ghi báo cáo (`SkipReason`). Priority lấy từ `PRIORITY` (block=500, exception=800, malware=900).
- T011 CHƯA ghép vào build/CLI: `validate-rules.ts` mới là hàm thuần. T012 cần: khai báo static rulesets trong manifest + sinh JSON rule + gọi `assertValidRules` để build fail khi vượt giới hạn. `build-rules.ts` 294 dòng (sát ngưỡng 300): nếu T012 cần thêm code, TÁCH module con (vd. `scripts/lib/parse-abp.ts`).
- T004: Playwright nạp extension `dist/`. Chạy headless-CI bằng `xvfb-run -a npm run test:e2e` (bắt buộc `npm run build` trước để có `dist/`).
- T003: `StorageSchema` hiện chỉ có `enabled`; task sau mở rộng. `TypedStorage` inject area để test.
- T002: manifest MV3 tối thiểu (chưa `permissions`); popup build ra `dist/src/popup/index.html`; chưa có icon.

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
| 2026-11-21 | T011 | `scripts/validate-rules.ts` + `scripts/lib/dnr-schema.ts`: kiểm tra schema DNR + giới hạn (regex/ruleset/budget), `assertValidRules` throw khi lỗi; 18 unit test xanh | (đang commit) |
