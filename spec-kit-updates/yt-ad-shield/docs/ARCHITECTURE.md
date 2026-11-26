# Kiến trúc YT Ad Shield

Trạng thái: SPECIFIED. Chưa có code. Tài liệu này mô tả thiết kế, không mô tả hành vi đã kiểm chứng.

## Nội dung bắt buộc
- Sơ đồ module và phụ thuộc (xem `specs/001-yt-ad-shield/plan.md` mục 11 và 12).
- Luồng dữ liệu giữa MAIN world và isolated world, qua `window.postMessage` có kiểm tra cấu trúc.
- Bảng quyền ghi theo module (plan mục 12.4).
- Thứ tự nạp script trong manifest (plan mục 12.2).

## Nguyên tắc
- Module độc lập, không circular dependency.
- Cấu hình và registry là nguồn duy nhất.
- Playback được ưu tiên hơn tỷ lệ chặn.

## Ranh giới cờ MAIN/ISOLATED (T004 OPEN)
- Cờ đọc qua `FeatureFlags` (`specs/001-yt-ad-shield/contracts/feature-flags.md`).
- Truyền cờ sang MAIN qua adapter (`contracts/adapter.md`). Hiện dùng NullAdapter.
- Chỉ ba cờ MAIN phụ thuộc adapter. Module ISOLATED không cần adapter.
- Chưa chọn cơ chế truyền. Các lựa chọn A, B, C nằm ở `contracts/adapter.md` mục 6.
