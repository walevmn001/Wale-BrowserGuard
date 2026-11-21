# PROGRESS — Điểm dừng để làm tiếp

> Trae PHẢI đọc file này đầu mỗi phiên và cập nhật trước mỗi commit.

## Trạng thái
- Giai đoạn hiện tại: P0 (khung dự án)
- Task đã xong: T001, T002, T003
- Task kế tiếp: T004
- Commit/tag mới nhất: 1c3de47 (T002)
- Test vàng gần nhất: (chưa chạy)

## Dở dang / ghi chú cho phiên sau
- T003 tạo `src/shared/{types,constants,logger,storage}.ts`. `StorageSchema` hiện chỉ có `enabled`; task sau mở rộng. `PRIORITY` theo algorithm.md §A. `TypedStorage` inject area để test.
- T002: manifest MV3 tối thiểu (chưa `permissions`); popup build ra `dist/src/popup/index.html`; chưa có icon.
- T004 sẽ cấu hình Playwright nạp extension `dist/` + e2e "extension load được".

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
| 2026-11-21 | T003 | `src/shared/` types + constants(PRIORITY) + logger + TypedStorage; 3 unit test mock storage xanh | (đang commit) |
