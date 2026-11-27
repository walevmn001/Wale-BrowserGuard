# FIX-01 — Checklist kiểm thử trên Chrome thật (Phase E)

> **Trạng thái:** `PENDING REAL-CHROME VERIFICATION`. Checklist này **chưa được chạy** trên Chrome/YouTube thật.
> Mọi kết quả quan sát được ghi vào cột **Kết quả** (`PASS` / `FAIL` / `BLOCKED` / `NOT_RUN`) cùng bằng chứng nguyên văn.
> **Không** điền `PASS` khi chưa thực sự chạy và quan sát.

**Người chạy:** ___________  **Ngày:** ___________  **Chrome:** ___________  **Extension ID:** ___________
**Bản build:** WALE GUARD 1.2.1 · hash `dist/youtube-main.js` = `84c75fb469f7d9dacc26c6119c367f2296b3d3642258c499f86d35a59d6a37d0`
**ZIP:** `release/adblock-security-1.2.1.zip` (42 entry; gồm `manifest.json`, `youtube-main.js`, `youtube-isolated.js`, `service-worker.js`, `popup.js`, rulesets).

Trạng thái chuẩn của một thành phần (FIX-01): `DISABLED` · `WAITING_FOR_REGISTRATION` · `WAITING_FOR_ADAPTER` · `INITIALIZING` · `READY` · `ERROR`.

---

## Các bước kiểm thử (10 bước)

| # | Bước | Cách kiểm | Kỳ vọng | Kết quả | Bằng chứng |
|---|------|-----------|---------|---------|------------|
| 1 | Cài bản ZIP mới | `chrome://extensions` → Load unpacked (giải nén ZIP) hoặc cài `adblock-security-1.2.1.zip` | Extension nạp, không lỗi manifest | NOT_RUN | |
| 2 | Bật YouTube Module | Popup → bật công tắc module YouTube (mặc định OFF) | Công tắc bật; service worker gọi `applyYouTubeEngineRegistration` | NOT_RUN | |
| 3 | Mở tab YouTube mới | Mở `https://www.youtube.com/` ở tab mới (không phải tab đang có từ trước) | Trang tải bình thường, không màn hình trắng/đen | NOT_RUN | |
| 4 | Kiểm MAIN + ISOLATED registration | Console service worker: `chrome.scripting.getRegisteredContentScripts()` | Trả về **cả hai** id: `wg-youtube-engine-main`, `wg-youtube-engine-isolated`, `runAt: document_start` | NOT_RUN | |
| 5 | Kiểm DatasetAdapter nhận snapshot | Trên tab YouTube: `document.documentElement.getAttribute('data-wg-yt-flags')` | Là JSON có `schemaVersion` + 12 cờ; `flags.ENABLE_JSON_PRUNER` v.v. phản ánh lựa chọn đã lưu | NOT_RUN | |
| 6 | Kiểm ba hook `READY` thật | Popup: ba hàng MAIN (JSON Pruner / Fetch Hook / XHR Hook) | Hiển thị `READY` (`ENABLED`/`DISABLED`) **theo lựa chọn**, không kẹt `WAITING`. Đối chiếu `document.documentElement.getAttribute('data-wg-yt-status')` | NOT_RUN | |
| 7 | Mở nhiều video, kiểm playback | Phát liên tục, pause/resume, tua, chuyển video, chuyển trang SPA | Không stall, không mất tiếng, không màn hình đen, video phát bình thường | NOT_RUN | |
| 8 | Bật/tắt từng flag | Trong popup, tắt/bật lần lượt JSON Pruner, Fetch Hook, XHR Hook (OFF→ON→OFF) | Trạng thái cập nhật đúng; `data-wg-yt-status` đổi tương ứng; OFF thì hành vi request gốc giữ nguyên | NOT_RUN | |
| 9 | Reload tab và kiểm trạng thái | `F5` tab YouTube sau khi đổi flag | Trạng thái giữ đúng lựa chọn đã lưu; không quay về `WAITING_FOR_ADAPTER` vô hạn | NOT_RUN | |
| 10 | Kiểm website không phải YouTube | Mở một số trang thường (tin tức, blog, web app) | Không bị ảnh hưởng; popup báo ba hàng MAIN là `WAITING_FOR_REGISTRATION`/`DISABLED` một cách trung thực (không `READY` giả) | NOT_RUN | |

---

## Ghi chú đối chiếu trạng thái

- **`WAITING_FOR_ADAPTER` không còn vô hạn** khi adapter đã nhận snapshot hợp lệ: sau bước 4–5, ba hàng MAIN phải chuyển sang `READY` (theo lựa chọn). Nếu vẫn `WAITING_FOR_ADAPTER` → kiểm `data-wg-yt-status` có tồn tại và parse được không.
- **Popup không báo `READY` giả:** ngoài tab YouTube (bước 10) hoặc khi module OFF, ba hàng MAIN **không** được hiển thị `READY`.
- **Không kết luận "đã chặn quảng cáo"** chỉ vì hook `READY`: cần quan sát thực tế ở bước 7 với video có quảng cáo (pre-roll/mid-roll).

## Phân loại bằng chứng

- `Xác minh bằng Chrome thật`: bước 1–10 (khi có kết quả thật).
- `Xác minh bằng unit/integration tests` (sandbox, đã có): feature flags, registration, hook, popup state, playback-regression fixtures — xem `tests/unit/youtube/**` và `docs/TESTING.md`.

## Tổng kết

| Chỉ số | Giá trị |
|--------|---------|
| Tổng số bước | 10 |
| PASS | |
| FAIL | |
| BLOCKED / NOT_RUN | |
| Ba cờ MAIN hết `WAITING` khi adapter hoạt động? (Y/N) | |
| Popup còn `READY` giả? (Y/N) | |
| Quảng cáo bị chặn trên Chrome thật? (Y/N) | |

**Phát hiện mới cần xử lý:** _______________________________________________________________________
