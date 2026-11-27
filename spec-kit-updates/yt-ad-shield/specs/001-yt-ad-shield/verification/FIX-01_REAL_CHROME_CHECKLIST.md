# CHECKPOINT FIX-01 — Checklist kiểm thử thủ công trên Chrome thật

> **Trạng thái:** `PENDING REAL-CHROME VERIFICATION`. Không ca nào dưới đây đã được chạy.
> Toàn bộ kết quả trong repo hiện tại là **unit/integration test trong sandbox (vitest)** — xem
> `FIX-01_TEST_RESULTS.md`. Các bước dưới đây phải do người dùng tự chạy trên Chrome thật và điền
> `PASS`/`FAIL`/`BLOCKED`/`NOT_RUN` kèm bằng chứng nguyên văn.

**Người chạy:** ___________  **Ngày chạy:** ___________  **Chrome:** ___________
**Extension ID:** ___________  **Bản build (ZIP):** `adblock-security-1.2.0.zip` (hash ghi ở `PROGRESS.md`)

Trạng thái hợp lệ cho cột "Kết quả": `PASS` · `FAIL` · `BLOCKED` · `NOT_RUN`.

---

## Quy trình 10 bước

### Bước 1 — Cài bản ZIP mới

| Mã | Điều kiện | Kết quả | Bằng chứng | Ghi chú |
|----|-----------|---------|------------|---------|
| FIX01-01 | Giải nén `adblock-security-1.2.0.zip`, `chrome://extensions` → Load unpacked → không lỗi | NOT_RUN | | |
| FIX01-02 | `manifest.json` **không** có `content_scripts` cho engine; `version === "1.2.0"` | NOT_RUN | | |
| FIX01-03 | Service worker active, không có exception lúc khởi động | NOT_RUN | | |

### Bước 2 — Bật YouTube Module

| Mã | Điều kiện | Kết quả | Bằng chứng | Ghi chú |
|----|-----------|---------|------------|---------|
| FIX01-04 | Bật công tắc "YouTube Module" trong popup/options; giá trị lưu đúng (`youtubeModule = true`) | NOT_RUN | | |
| FIX01-05 | Sau khi bật, `chrome.scripting.getRegisteredContentScripts()` (worker console) trả **2** script: `youtube-main` (MAIN) + `youtube-isolated` (ISOLATED) | NOT_RUN | | |

### Bước 3 — Mở một tab YouTube mới

| Mã | Điều kiện | Kết quả | Bằng chứng | Ghi chú |
|----|-----------|---------|------------|---------|
| FIX01-06 | Mở `https://www.youtube.com/` ở tab mới; không lỗi console ở trang | NOT_RUN | | |
| FIX01-07 | Trên `<html>` xuất hiện `data-wg-yt-flags` (ISOLATED ghi) | NOT_RUN | | |

### Bước 4 — Kiểm tra MAIN và ISOLATED registration

| Mã | Điều kiện | Kết quả | Bằng chứng | Ghi chú |
|----|-----------|---------|------------|---------|
| FIX01-08 | MAIN world: `typeof window.__wgYtEngine !== "undefined"` | NOT_RUN | | |
| FIX01-09 | ISOLATED world: `typeof window.__wgYtIsolatedBridge !== "undefined"` | NOT_RUN | | |
| FIX01-10 | Tắt công tắc module → 2 script bị gỡ khỏi registration; bật lại → đăng ký lại (idempotent, không nhân đôi) | NOT_RUN | | |

### Bước 5 — Kiểm tra DatasetAdapter nhận snapshot

| Mã | Điều kiện | Kết quả | Bằng chứng | Ghi chú |
|----|-----------|---------|------------|---------|
| FIX01-11 | `JSON.parse(document.documentElement.getAttribute('data-wg-yt-flags'))` có `schemaVersion: 1` và 12 cờ boolean | NOT_RUN | | |
| FIX01-12 | Đổi một cờ ISOLATED trong popup → attribute cập nhật (MutationObserver nhận) | NOT_RUN | | |
| FIX01-13 | Snapshot đến **muộn** (module bật sau khi tab đã mở): tải lại trang → MAIN nhận đúng snapshot | NOT_RUN | | |

### Bước 6 — Kiểm tra ba hook có trạng thái READY thực sự

| Mã | Điều kiện | Kết quả | Bằng chứng | Ghi chú |
|----|-----------|---------|------------|---------|
| FIX01-14 | `<html>` có `data-wg-yt-status` (MAIN phát ra), `schemaVersion: 1`, chứa `modules` với `json-pruner`/`fetch-interceptor`/`xhr-interceptor` | NOT_RUN | | |
| FIX01-15 | Popup: Player JSON Pruner hiển thị **Đang bật** (không còn "Chờ adapter") | NOT_RUN | | |
| FIX01-16 | Popup: Fetch Hook hiển thị **Đang bật** | NOT_RUN | | |
| FIX01-17 | Popup: XHR Hook hiển thị **Đang bật** | NOT_RUN | | |
| FIX01-18 | `chrome.storage.session.get('wgYtStatus:<tabId>')` có bản ghi trạng thái mới (worker relay) | NOT_RUN | | |

> **Không** kết luận quảng cáo đã bị chặn chỉ vì hook READY — READY chỉ nghĩa là hook đã cài, không chứng minh chặn.

### Bước 7 — Mở nhiều video và kiểm tra playback

| Mã | Video / loại | Kết quả | Bằng chứng (ảnh/console) | Ghi chú |
|----|--------------|---------|--------------------------|---------|
| FIX01-19 | Video thường: phát liên tục 60s, không stall/dừng bất thường | NOT_RUN | | |
| FIX01-20 | Pause/resume nhiều lần → không màn hình đen, không mất tiếng | NOT_RUN | | |
| FIX01-21 | Tua (seek) tiến/lùi → video tiếp tục | NOT_RUN | | |
| FIX01-22 | Chuyển video (click video khác) → không màn hình đen | NOT_RUN | | |
| FIX01-23 | Chuyển trang SPA (Home → Watch → Home) → engine không nhân đôi, playback OK | NOT_RUN | | |
| FIX01-24 | Video có quảng cáo: quan sát quảng cáo có bị chặn/bỏ qua hay không | NOT_RUN | | |
| FIX01-25 | Kiểm tra audio/video **không** dừng bất thường; không xuất hiện màn hình đen | NOT_RUN | | |

### Bước 8 — Bật/tắt từng flag

| Mã | Thao tác | Kết quả | Bằng chứng | Ghi chú |
|----|----------|---------|------------|---------|
| FIX01-26 | Tắt cả 3 cờ MAIN → sau reload tab, `data-wg-yt-status.flags` đều `false`; popup hiển thị "Đã tắt" | NOT_RUN | | |
| FIX01-27 | Bật riêng từng cờ → chỉ hook tương ứng bật; 2 hook kia vẫn tắt | NOT_RUN | | |
| FIX01-28 | Bật cả 3 → cả 3 READY | NOT_RUN | | |
| FIX01-29 | Đổi ON→OFF khi tab đang mở, reload → hiệu lực thật (không còn WAITING vô thời hạn) | NOT_RUN | | |
| FIX01-30 | Đổi OFF→ON khi tab đang mở, reload → hiệu lực thật | NOT_RUN | | |

### Bước 9 — Reload tab và kiểm tra trạng thái

| Mã | Điều kiện | Kết quả | Bằng chứng | Ghi chú |
|----|-----------|---------|------------|---------|
| FIX01-31 | Reload tab: trạng thái popup quay lại INITIALIZING rồi tới READY (không kẹt) | NOT_RUN | | |
| FIX01-32 | Đóng tab → `wgYtStatus:<tabId>` bị xóa khỏi `storage.session` | NOT_RUN | | |
| FIX01-33 | Restart browser → module giữ nguyên lựa chọn; tab YouTube mới hoạt động lại | NOT_RUN | | |

### Bước 10 — Kiểm tra website ngoài YouTube

| Mã | Điều kiện | Kết quả | Bằng chứng | Ghi chú |
|----|-----------|---------|------------|---------|
| FIX01-34 | 5 trang thường (vd example.com, wikipedia.org, github.com, news site, shop) không hư hại, không lỗi console do engine | NOT_RUN | | |
| FIX01-35 | Không có `data-wg-yt-flags`/`data-wg-yt-status` trên `<html>` của trang ngoài YouTube | NOT_RUN | | |
| FIX01-36 | Block counter vẫn tăng bình thường, không lỗi DNR | NOT_RUN | | |

---

## Tổng kết

| Chỉ số | Giá trị |
|--------|---------|
| Tổng số mục | 36 |
| PASS | |
| FAIL | |
| BLOCKED / NOT_RUN | |
| Ba hook còn WAITING vô thời hạn? (Y/N) | |
| Popup từng báo READY giả? (Y/N) | |

**Mục FAIL (mã + mô tả):** _______________________________________________

**Mục BLOCKED (mã + lý do):** ____________________________________________

**Kết luận về chặn quảng cáo (chỉ ghi khi có bằng chứng):** __________________

**Người chạy ký xác nhận:** _______________  **Ngày:** ___________
