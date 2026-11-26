# Selector registry

Trạng thái: SPECIFIED. Không có selector nào được xác minh.

Nguồn: `src/registry/selectors.js`, `SELECTORS_VERSION` hiện là chưa đặt.

| id | selector | mục đích | xác minh | lastVerified | fallback |
|----|----------|----------|----------|--------------|----------|
| movie_player | `#movie_player` | Container player | UNVERIFIED | chưa có | không |
| video_main | `video.html5-main-video` | Phần tử video | UNVERIFIED | chưa có | không |
| ad_showing | class `ad-showing` trên player | Tín hiệu quảng cáo | UNVERIFIED | chưa có | không |
| ad_interrupting | class `ad-interrupting` trên player | Tín hiệu quảng cáo | UNVERIFIED | chưa có | không |
| skip_button | danh sách trong registry | Nút bỏ qua | UNVERIFIED | chưa có | theo registry |

Quy tắc: không thêm selector mới mà không có mục đích, mức xác minh, và fallback hẹp hơn hoặc bằng selector chính.
