# Changelog

## [Chưa phát hành] — 2026-11-27 — engine Phase 1–3 (IMPLEMENTED / TESTED)
- Module thay đổi: engine YouTube mới ở `adblock-spec-kit/src/youtube/**` (config, registry, core, adapter, state, main, isolated, testing). **Chưa kích hoạt** trong worker.
- Nguyên nhân: bắt đầu tái triển khai module YouTube theo speckit `yt-ad-shield` (Phase 0–3).
- Tác động playback: engine mới **fail-open**, chưa được nạp → **không** thay đổi hành vi hiện tại của extension; module YouTube cũ vẫn là đường chạy.
- Registry: `SELECTORS_VERSION` chưa đặt (mọi selector UNVERIFIED), `ENDPOINTS_VERSION` chưa đặt, `RULES_VERSION` chưa đặt.
- Kiểm thử: unit 563 pass / 563 (50 file, gồm 14 file `tests/unit/youtube/*`); `tsc --noEmit` pass; `npm run build` pass, sinh `dist/youtube-main.js` (25.08 kB).
- Git tag: chưa tạo.

## [Chưa phát hành] — 2026-11-26
- Trạng thái: đặc tả v3, chưa có code.
- Module thay đổi: không có (chỉ tài liệu và đặc tả).
- Nguyên nhân: bổ sung yêu cầu bảo trì và cập nhật lâu dài.
- Tác động playback: chưa có (chưa có code).
- Kiểm thử: không áp dụng.

## [Chưa phát hành] — đặc tả v4
- Module thay đổi: không có code. Thêm contract `feature-flags.md` và `adapter.md`.
- Nguyên nhân: T004 OPEN, cần cô lập để không chặn registry.
- Tác động playback: chưa có.
- Kiểm thử: không áp dụng.

## Mẫu mục mới
```
## [X.Y.Z] — YYYY-MM-DD
- Module thay đổi: ...
- Nguyên nhân: ... (kèm bằng chứng nếu sửa selector hoặc endpoint)
- Tác động playback: ...
- Registry: SELECTORS_VERSION, ENDPOINTS_VERSION, RULES_VERSION
- Kiểm thử: unit / integration / regression / playback, kết quả
- Git tag: vX.Y.Z (checkpoint trước: <hash>, sau: <hash>)
```

## Quy trình rollback
1. Xác định tag ổn định gần nhất.
2. `git checkout vX.Y.Z` (hoặc tạo nhánh từ tag).
3. Kiểm tra migration cấu hình: phiên bản cũ phải bỏ qua khóa không nhận ra (FR-042).
4. Chạy checklist playback trước khi phát hành lại.
