# Selector registry

Trạng thái: **IMPLEMENTED** (`src/youtube/registry/selectors.ts`), **UNVERIFIED** — không có selector nào được xác minh trên YouTube thật.

Nguồn: `adblock-spec-kit/src/youtube/registry/selectors.ts`.

- `class SelectorRegistry`: đăng ký và tra selector theo `id`, có `fallback` hẹp hơn hoặc bằng selector chính; ghi `lastVerified`.
- `skipButtonSelectors()`: danh sách selector nút skip.
- **Mọi mục dưới đây là UNVERIFIED.** Registry chưa đặt `SELECTORS_VERSION`.

| id | selector | mục đích | xác minh | lastVerified | fallback |
|----|----------|----------|----------|--------------|----------|
| movie_player | `#movie_player` | Container player | UNVERIFIED | chưa có | không |
| video_main | `video.html5-main-video` | Phần tử video | UNVERIFIED | chưa có | không |
| ad_showing | class `ad-showing` trên player | Tín hiệu quảng cáo | UNVERIFIED | chưa có | không |
| ad_interrupting | class `ad-interrupting` trên player | Tín hiệu quảng cáo | UNVERIFIED | chưa có | không |
| skip_button | danh sách trong registry | Nút bỏ qua | UNVERIFIED | chưa có | theo registry |

Quy tắc: không thêm selector mới mà không có mục đích, mức xác minh, và fallback hẹp hơn hoặc bằng selector chính.
