# Kiểm thử

Trạng thái: SPECIFIED. Chưa có test nào đã chạy.

## Thứ tự chạy mỗi lần cập nhật
1. Lint và kiểm tra phụ thuộc (`scripts/lint-deps.js`).
2. Manifest validation.
3. DNR rules validation (khớp `rules.js`, không chặn domain bảo vệ).
4. Unit test.
5. Integration test (checklist thủ công bên dưới).
6. Regression test R01 đến R18 (`spec.md` mục 11.18).
7. Playback preservation test (`spec.md` mục 11.19).
8. Build và kiểm tra artifact, nếu có.

## Baseline
Mỗi bản stable lưu kết quả vào `test/baseline/<version>.json`.

## Kết quả các lần chạy
| Ngày | Phiên bản | Bước | Kết quả | Môi trường | Ghi chú |
|------|-----------|------|---------|------------|---------|
| — | — | — | Chưa có lần chạy nào | — | — |

## Checklist thủ công
- [ ] Video thường phát được.
- [ ] Video có quảng cáo trước.
- [ ] Video có quảng cáo giữa.
- [ ] Chuyển video liên tục bằng SPA.
- [ ] Tắt từng module, các module khác vẫn chạy.

## Contract test của adapter (không cần T004)
- Chạy bằng adapter giả và `adapter-null`.
- Bảy mục theo `contracts/adapter.md` mục 7.
- Kết quả ghi trong bảng "Kết quả các lần chạy", kèm tên adapter.
