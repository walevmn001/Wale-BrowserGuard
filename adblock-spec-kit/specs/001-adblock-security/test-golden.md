# Bộ test vàng (Golden Test Suite)

Đo khách quan "chặn đúng" và "không vỡ trang". Chạy sau mỗi giai đoạn và trước release.

## 1. Danh sách trang (điền 30–50 URL thật)
| Nhóm | Số trang | Loại |
|------|----------|------|
| Báo/tin tức nhiều quảng cáo | 8 | báo điện tử VN & quốc tế |
| Video/streaming | 5 | trang xem video |
| Mua sắm | 6 | sàn thương mại điện tử |
| Mạng xã hội | 4 | feed, đăng nhập |
| Ngân hàng/thanh toán (KHÔNG được vỡ) | 5 | đăng nhập, thanh toán |
| Công cụ/Docs/Email | 6 | ứng dụng web phức tạp |
| Blog/diễn đàn nhỏ | 6 | nhiều script bên thứ ba |

## 2. Chỉ số
| Chỉ số | Cách đo | Ngưỡng |
|--------|---------|--------|
| Tỉ lệ chặn | request quảng cáo/tracker đã biết bị chặn / tổng | ≥ 95% |
| Tỉ lệ vỡ trang | trang lỗi chức năng/layout | ≤ 2% |
| Độ trễ điều hướng | trung vị load có/không extension | tăng < 5ms |
| Bộ nhớ | extension với bộ rule mặc định | < 100MB |
| CPU cosmetic | khi trang đứng yên 30s | < 5% |

## 3. Kịch bản mỗi trang
1. Mở trang, chờ load xong.
2. Chụp ảnh; kiểm tra chức năng chính (nút chính, video phát được).
3. Ghi số request bị chặn.
4. Bật whitelist → trang trở lại như gốc.

## 4. Quy tắc
- Lưu kết quả vào `tests/golden/results/<ngày>.json`.
- Tụt chỉ số nào so với lần trước → không merge.
- Trang bị vỡ → ghi rule gây lỗi → sửa/thêm ngoại lệ → chạy lại.
