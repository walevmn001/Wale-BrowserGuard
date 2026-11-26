# Endpoint registry

Trạng thái: SPECIFIED. Không có endpoint nào được xác minh.

Nguồn: `src/registry/endpoints.js`, `ENDPOINTS_VERSION` hiện là chưa đặt.

| Endpoint | Method | Mức liên quan | Mục đích | Xác minh |
|----------|--------|---------------|----------|----------|
| `/youtubei/v1/player` | POST | Cần xác minh (AD_RELATED hoặc PLAYBACK_CRITICAL) | Dữ liệu player | UNVERIFIED |
| `/youtubei/v1/next` | POST | Cần xác minh | Dữ liệu trang xem | UNVERIFIED |
| `/youtubei/v1/browse` | POST | Cần xác minh | Trang chủ, kênh | UNVERIFIED |
| `/youtubei/v1/search` | POST | Cần xác minh | Kết quả tìm kiếm | UNVERIFIED |

Lưu ý: method trong bảng là giả định, chưa đo. Mức liên quan quảng cáo chỉ được gán khi có fixture thực tế.
Quy tắc: endpoint chưa xác minh không được dùng để mở rộng phạm vi chặn.
