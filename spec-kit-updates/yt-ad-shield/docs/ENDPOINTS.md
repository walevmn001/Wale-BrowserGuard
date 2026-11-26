# Endpoint registry

Trạng thái: **IMPLEMENTED** (`src/youtube/registry/endpoints.ts`), **UNVERIFIED** — không có endpoint nào được xác minh trên YouTube thật.

Nguồn: `adblock-spec-kit/src/youtube/registry/endpoints.ts`.

- `PROTECTED_PLAYER_PATH = '/youtubei/v1/player'` — endpoint player (bị interceptor soi, không bị chặn).
- `PROTECTED_HOST_FRAGMENT = 'googlevideo'` — host media phát video, **không bao giờ** bị DNR chặn.
- `isProtected(url)`: trả `true` cho các URL playback-critical, dùng để loại trừ khỏi DNR (FR-032, chống chặn nhầm).
- Registry chưa đặt `ENDPOINTS_VERSION`.

| Endpoint | Method | Mức liên quan | Mục đích | Xác minh |
|----------|--------|---------------|----------|----------|
| `/youtubei/v1/player` | POST | Bảo vệ (PROTECTED_PLAYER_PATH) | Dữ liệu player | UNVERIFIED |
| `/youtubei/v1/next` | POST | Cần xác minh | Dữ liệu trang xem | UNVERIFIED |
| `/youtubei/v1/browse` | POST | Cần xác minh | Trang chủ, kênh | UNVERIFIED |
| `/youtubei/v1/search` | POST | Cần xác minh | Kết quả tìm kiếm | UNVERIFIED |

Lưu ý: method trong bảng là giả định, chưa đo. Mức liên quan quảng cáo chỉ được gán khi có fixture thực tế.
Quy tắc: endpoint chưa xác minh không được dùng để mở rộng phạm vi chặn.
