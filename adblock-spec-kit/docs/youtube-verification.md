# Kiểm chứng module YouTube trên trang thật (T069)

> Prompt 11, quy tắc 4: mọi giá trị trong module này là **dữ liệu** (`data/youtube-config.json`,
> `src/content/youtube/ad-skip.ts`) và được phát triển/test bằng **trang mock**. Các giá trị
> đánh dấu `TODO(verify)` **phải được người dùng kiểm chứng trên trang thật** — Trae không
> truy cập được YouTube thật nên không đoán. Tài liệu này liệt kê chính xác những gì cần
> kiểm tra bằng DevTools, dấu hiệu **sai**, và **sửa ở đâu**.

## 0. Cách làm chung

1. Nạp extension đã build: `npm run build`, rồi Chrome → `chrome://extensions` →
   *Load unpacked* → chọn thư mục `dist/`.
2. Mở **Options → YouTube**, bật công tắc module (mặc định TẮT — AC-15.1).
3. Mở video thật: `https://www.youtube.com/watch?v=<id>`; mở **DevTools (F12)**.
4. Kiểm từng mục dưới đây; đánh dấu ☑ nếu đúng, hoặc ghi giá trị đúng vào cột "Giá trị thật".
5. Khi một giá trị sai: sửa **đúng một nơi** — `data/youtube-config.json` (endpoints /
   adFields / selectors / skipSelectors) hoặc `src/content/youtube/ad-skip.ts`
   (`YOUTUBE_AD_SKIP_OPTIONS.adClassName`) — rồi chạy lại `npm run build`, nạp lại extension
   và lặp lại.
6. **Không được** chặn endpoint phát video (`/youtubei/v1/player`, host `googlevideo`) — mục A.

> Mẹo: quảng cáo thật khó gặp theo ý muốn; dùng DevTools → *Network* với filter `media`/`xhr`
> khi xem vài video có gắn quảng cáo (video mới/kiếm tiền), hoặc tạm tắt adblock khác và
> tua vài video để gặp ad break.

---

## A. Q1 — Endpoint mạng (Network)

Nguồn: `data/youtube-config.json` → `endpoints[]`. Rule sinh ra **chỉ tầng sub-resource**
(không `resourceTypes` ⇒ không khớp `main_frame`), nên mở được `youtube.com` là điều kiện đầu.

| # | Giá trị cấu hình | Cần kiểm gì | Cách kiểm (DevTools) | Dấu hiệu SAI |
|---|---|---|---|---|
| A1 | `/pagead/` | Bị chặn, và **không** ảnh hưởng phát video | Network → filter `pagead` | Không thấy request nào ⇒ có thể path đã đổi (tìm request quảng cáo thật) |
| A2 | `/api/stats/ads` | Bị chặn, video vẫn phát | Network → filter `stats` | Chặn nhầm ⇒ **bỏ mục này** khỏi `endpoints` |
| A3 | `/api/stats/atr` | Bị chặn, video vẫn phát | Network → filter `atr` | Chặn nhầm ⇒ **bỏ mục này** |
| A4 | `/pcs/activeview` | Bị chặn, video vẫn phát | Network → filter `activeview` | Chặn nhầm ⇒ **bỏ mục này** |
| A5 | `/youtubei/v1/player/ad_break` | Bị chặn, **video bình thường vẫn phát** | Network → filter `ad_break`; xem `#movie_player` khi chuyển video | Nếu video **không phát được** ⇒ dừng ngay, đổi/bỏ mục này |

**Bắt buộc đúng (algorithm.md §Q1):** `/youtubei/v1/player` và host `googlevideo` **không bao giờ**
bị chặn (đã được `isProtectedEndpoint` bảo vệ kép trong `scripts/youtube-rules.ts`).
Kiểm: sau khi bật module, mở vài video bình thường và xác nhận request `…/youtubei/v1/player`
trả **status 200** và video vẫn phát mượt.

- [ ] A1 `/pagead/`
- [ ] A2 `/api/stats/ads`
- [ ] A3 `/api/stats/atr`
- [ ] A4 `/pcs/activeview`
- [ ] A5 `/youtubei/v1/player/ad_break`
- [ ] (bắt buộc) `/youtubei/v1/player` **không** bị chặn, phát được
- [ ] (bắt buộc) host `googlevideo` **không** bị chặn

---

## B. Q2 — Xoá trường quảng cáo (prune MAIN world)

Nguồn: `data/youtube-config.json` → `adFields[]`. Trang thật giữ player response trong biến
toàn cục `ytInitialPlayerResponse` (và các response `/youtubei/v1/player` sau đó).

Cách kiểm (trước khi bật module, hoặc tab Ẩn danh không có extension):
1. Console: `Object.keys(ytInitialPlayerResponse)` và tìm các khoá liên quan quảng cáo.
2. Ghi lại **tên khoá hiện hành**. So với cấu hình:

| # | Giá trị cấu hình | Cần kiểm gì |
|---|---|---|
| B1 | `adPlacements` | Đúng tên khoá hiện hành chứa quảng cáo trong `ytInitialPlayerResponse` |
| B2 | `playerAds` | Đúng tên khoá hiện hành |
| B3 | `adSlots` | Đúng tên khoá hiện hành |

- [ ] B1 `adPlacements`
- [ ] B2 `playerAds`
- [ ] B3 `adSlots`

> Nếu tên khoá khác: sửa `adFields` trong `data/youtube-config.json`. Giữ **chỉ** khoá quảng cáo;
> tuyệt đối không thêm khoá nội dung (prune xoá sâu ≤ 6 tầng — Constitution VI).

---

## C. Q3 — Selector CSS ẩn khối quảng cáo (Elements)

Nguồn: `data/youtube-config.json` → `selectors[]`. Sinh ra `rules/cosmetic/youtube.json`.

Cách kiểm: DevTools → **Elements** → `Ctrl+F`, dán từng selector **trong lúc trang có quảng cáo**
(với video có ad/banner). Selector đúng ⇒ có element khớp.

| # | Selector | Cần khớp phần tử quảng cáo |
|---|---|---|
| C1 | `.ytp-ad-module` | Lớp quảng cáo trong player |
| C2 | `.ytp-ad-overlay-container` | Overlay quảng cáo |
| C3 | `.ytp-ad-text-overlay` | Text overlay quảng cáo |
| C4 | `ytd-ad-slot-renderer` | Ad slot trong feed |
| C5 | `ytd-display-ad-renderer` | Display ad |
| C6 | `ytd-promoted-sparkles-web-renderer` | Promoted sparkles |
| C7 | `ytd-promoted-video-renderer` | Promoted video |
| C8 | `ytd-in-feed-ad-layout-renderer` | In-feed ad |
| C9 | `ytd-banner-promo-renderer` | Banner promo |
| C10 | `ytd-statement-banner-renderer` | Statement banner |
| C11 | `#masthead-ad` | Masthead ad |

- [ ] C1…C11 (mục nào không khớp ⇒ bỏ/đổi trong `selectors`; KHÔNG thêm selector chung chung dễ ẩn nhầm nội dung)

---

## D. Q4 — Bỏ qua/tua quảng cáo (ad-skip)

Nguồn: `src/content/youtube/ad-skip.ts` → `YOUTUBE_AD_SKIP_OPTIONS`.

Cách kiểm: khi một ad break đang chạy, chọn `#movie_player` trong **Elements** và xem `classList`.
Ngoài ra dùng **Console** (MAIN world) để xác nhận nút bỏ qua:

| # | Giá trị | Cần kiểm gì | Cách kiểm | Dấu hiệu SAI |
|---|---|---|---|---|
| D1 | `adClassName: 'ad-showing'` | Class gắn trên `#movie_player` **trong lúc đang chạy quảng cáo** | Elements → `#movie_player` → `classList` khi có ad | Không thấy `ad-showing` ⇒ cập nhật `adClassName` |
| D2 | `.ytp-ad-skip-button` | Nút "Bỏ qua quảng cáo" | Elements `Ctrl+F` khi ad sắp hết (nút hiện) | Không khớp ⇒ đổi selector |
| D3 | `.ytp-ad-skip-button-modern` | Biến thể nút bỏ qua | như trên | đổi/bỏ |
| D4 | `.ytp-skip-ad-button` | Biến thể khác | như trên | đổi/bỏ |

Kiểm hành vi (với ad thật có thể bỏ qua): video phải tự nhảy qua ad, tiếng/tốc độ/vị trí của bạn
được **khôi phục** sau khi hết ad; tối đa 3 lần thử/ad (không "giật" vô hạn).

- [ ] D1 `ad-showing`
- [ ] D2 `.ytp-ad-skip-button`
- [ ] D3 `.ytp-ad-skip-button-modern`
- [ ] D4 `.ytp-skip-ad-button`
- [ ] Hành vi: bỏ qua được ad + khôi phục tiếng/tốc độ/vị trí, không vòng lặp

---

## E. Q6 — URL phát hành config (kill-switch)

Nguồn: `src/background/youtube-config-updater.ts` → `YOUTUBE_CONFIG_URL`.

- [ ] E1 URL hiện tại: `https://raw.githubusercontent.com/walevmn001/Wale-BrowserGuard/main/adblock-spec-kit/data/youtube-config.json`
      — mở bằng trình duyệt/`curl`: phải trả **JSON hợp lệ** (schema như `data/youtube-config.json`).
- [ ] E2 Nếu phát hành ở nơi khác (CDN/Pages…): cập nhật `YOUTUBE_CONFIG_URL` cho đúng.
- [ ] E3 Kill-switch: đẩy một bản có `"enabled": false` cùng `version` lớn hơn → sau lần cập nhật kế tiếp module phải tắt cho mọi người (không cần kiểm hàng ngày, chỉ xác nhận khi phát hành).

---

## F. Số liệu cơ sở YouTube (5–10 video)

Chạy 5–10 video thật (đủ loại: có ad in-stream, feed có ad, video ngắn) với module **bật** và
**tắt**, ghi lại:

- Tỉ lệ **ad bị chặn/bỏ qua** (ad in-stream, ad trong feed, banner…).
- Tỉ lệ **video phát lỗi/đứng hình** (mục tiêu: **0** — Constitution VI; Q5 tự hạ cấp nếu có).
- Ghi chú bất thường (âm thanh, tốc độ, phụ đề, seek…).

Ghi kết quả vào `tests/golden/results/youtube-baseline.<YYYY-MM-DD>.json` theo mẫu
`tests/golden/results/youtube-baseline.template.json` (điền số thật, không bịa).

---

## G. Chốt T069

- [ ] Mọi mục A–E đã kiểm; giá trị sai đã sửa vào `data/youtube-config.json` / `ad-skip.ts`.
- [ ] `npm run build` + `npm test` + e2e YouTube xanh sau khi sửa.
- [ ] `TODO(verify)` trong `data/youtube-config.json`, `ad-skip.ts`, `youtube-config-updater.ts`,
      `scripts/youtube-rules.ts` đã xử lý (xoá hoặc ghi rõ đã xác nhận).
- [ ] Số liệu F đã ghi.
- [ ] Gỡ cờ `TODO(verify)` và (nếu P5 đủ điều kiện) gắn tag `phase-P5-done`.
