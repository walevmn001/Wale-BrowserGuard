# PROGRESS — Điểm dừng để làm tiếp

> Trae PHẢI đọc file này đầu mỗi phiên và cập nhật trước mỗi commit.

## Trạng thái
- Giai đoạn hiện tại: P0 (khung dự án) — đã hoàn tất
- Task đã xong: T001, T002, T003, T004
- Task kế tiếp: T010 (P1) — CHỜ người dùng duyệt mới bắt đầu
- Commit/tag mới nhất: e03323f (T003)
- Test vàng gần nhất: (chưa chạy)

## Dở dang / ghi chú cho phiên sau
- T004 xong: Playwright nạp extension `dist/`. `playwright.config.ts` (serial, 1 worker), `tests/e2e/extension-load.spec.ts` (service worker + popup nạp được). Script `test:e2e`. Chạy headless-CI bằng `xvfb-run -a npm run test:e2e` (bắt buộc `npm run build` trước để có `dist/`).
- Đã thêm `@types/node` (type-only) vào tsconfig `types`; đã ghi vào plan.md §6.
- Kết thúc Giai đoạn 0 → theo START-HERE.md PHẢI DỪNG chờ duyệt trước khi sang P1.
- T003: `StorageSchema` hiện chỉ có `enabled`; task sau mở rộng. `PRIORITY` theo algorithm.md §A. `TypedStorage` inject area để test.
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
| 2026-11-21 | T004 | Playwright nạp extension `dist/`; e2e "service worker + popup nạp được" xanh (xvfb); typecheck/lint/test/build/format xanh | (đang commit) |
