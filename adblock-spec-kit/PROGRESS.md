# PROGRESS — Điểm dừng để làm tiếp

> Trae PHẢI đọc file này đầu mỗi phiên và cập nhật trước mỗi commit.

## Trạng thái
- Giai đoạn hiện tại: P0 (khung dự án)
- Task đã xong: T001, T002
- Task kế tiếp: T003
- Commit/tag mới nhất: bc7b646 (T001)
- Test vàng gần nhất: (chưa chạy)

## Dở dang / ghi chú cho phiên sau
- T002 tạo manifest MV3 tối thiểu (chưa có `permissions`/`host_permissions`; thêm ở task cần). Popup build ra `dist/src/popup/index.html` (đường dẫn lồng theo cấu trúc `src/`).
- Chưa có icon cho extension (Chrome dùng icon mặc định). Bổ sung ở task polish/P4.
- T003 sẽ tạo `src/shared/` (types, constants priority, logger, storage wrapper) + unit test mock `chrome.storage`.

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
| 2026-11-21 | T002 | Manifest MV3 tối thiểu + service worker + popup rỗng; build emit `dist/manifest.json`; test xanh | (đang commit) |
