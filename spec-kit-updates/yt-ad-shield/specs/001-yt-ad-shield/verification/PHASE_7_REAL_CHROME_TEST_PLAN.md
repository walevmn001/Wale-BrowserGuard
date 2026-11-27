# Phase 7 — Kế hoạch kiểm thử trên Chrome thật (YouTube thật)

> **Trạng thái Phase 7:** `PENDING_REAL_CHROME_VALIDATION` — HƯỚNG DẪN THỰC THI đã bàn giao, **chưa có kết quả nào được ghi**. Mọi kết quả PASS/FAIL phải do người chạy điền vào `PHASE_7_TEST_RESULTS.md`.
>
> **⚠️ CẬP NHẬT (checkpoint v10):** kế hoạch dưới đây được soạn khi engine còn **INERT**. Nay engine **ĐÃ KÍCH HOẠT** (đăng ký động qua công tắc module; T004 đã chốt — xem `../../docs/PROGRESS.md` và `../status.md` mục 17). Vì vậy:
> - **Nhóm B (mục 4 "Xác nhận engine vẫn INERT")** đổi nghĩa: thay vì kỳ vọng engine vắng mặt, cần **xác nhận engine được đăng ký và chạy** khi công tắc bật (`getRegisteredContentScripts()` trả về `youtube-main` + `youtube-isolated`, guard `__wgYtEngine` tồn tại trong MAIN world).
> - **Ba cờ MAIN** không còn luôn `WAITING_FOR_ADAPTER`: khi đã có snapshot, popup hiển thị `READY` (`ENABLED`/`DISABLED`); chỉ khi chưa có snapshot hợp lệ mới `WAITING_FOR_ADAPTER`.
> - Các nhóm còn lại (setup, bảo toàn playback A/B, regression ngoài YouTube, A-2/A-4) giữ nguyên giá trị; phần playback càng quan trọng vì engine nay đã chạy thật.
> - **Ràng buộc gốc** (giữ engine INERT, không `registerContentScripts`) **không còn hiệu lực** — nó thuộc giai đoạn trước kích hoạt.

Cập nhật: 2026-11-27 · Người soạn kế hoạch: agent (sandbox).

---

## 0. Thông tin bản build bàn giao

| Hạng mục | Giá trị |
|----------|---------|
| Tên extension | **WALE GUARD** |
| Version | **1.1.1** |
| Manifest | MV3 (`manifest_version: 3`) |
| Thư mục build (giải nén, để "Load unpacked") | `/workspace/adblock-spec-kit/dist` |
| Gói phát hành (zip) | `/workspace/adblock-spec-kit/release/adblock-security-1.1.1.zip` |
| Số file trong `dist/` | 41 file, ~600 KB |
| Bundle engine MAIN | `dist/youtube-main.js` (48 803 byte, IIFE) |

**SHA-256 artifact (dùng để xác nhận đúng bản build khi bàn giao sang Windows):**

| File | SHA-256 |
|------|---------|
| `dist/manifest.json` | `c13a64de3a6c2185ea65abc57a76183429dddc381596b5e991d0cf6ef7a47426` |
| `dist/service-worker.js` | `4a29a551187ac2650b33a7d76011a6184eec2c2ad352df1b312006d1c993bb4d` |
| `dist/popup.js` | `c2fc9d2bf46209c407b0d50bf30278fc6e0009c091a918e34ea6ab200d79c437` |
| `dist/youtube-main.js` | `154b46123f9fec84b9b1b8d7c1ba1fdfcb70316ca2ec482940db533c2d203a97` |
| `release/adblock-security-1.1.1.zip` | `b1d971634749ccb3e4b007bec4da9080591d57be2176b77d2d1018bc6d42d66d` |

> Trên Windows, sau khi giải nén, chạy `Get-FileHash .\manifest.json -Algorithm SHA256` (PowerShell) trong thư mục build để đối chiếu. Hash phải khớp.

---

## 1. Cài đặt trên Chrome Developer Mode (Windows)

1. Tải `adblock-security-1.1.1.zip` (hoặc copy nguyên thư mục `dist/`) về máy Windows.
2. Giải nén vào một thư mục cố định, ví dụ `C:\dev\wale-guard-1.1.1\` — **đảm bảo `manifest.json` nằm trực tiếp trong thư mục đó**, không lồng thêm một cấp.
3. Mở Chrome → thanh địa chỉ gõ `chrome://extensions` → Enter.
4. Bật công tắc **Developer mode** ở góc trên bên phải.
5. Nhấn **Load unpacked** → chọn đúng thư mục ở bước 2 (ví dụ `C:\dev\wale-guard-1.1.1`).
6. Xác nhận thẻ extension hiển thị: tên **WALE GUARD**, version **1.1.1**, không có lỗi đỏ.
7. (Tùy chọn) Ghim icon lên thanh công cụ để mở popup nhanh.
8. Ghi lại **Chrome Extension ID** hiển thị trên thẻ extension (đã cố định bằng `key` trong manifest) vào phần kết quả.

**Lưu ý khi cập nhật bản build mới:** nhấn nút **Reload** (biểu tượng mũi tên vòng) trên thẻ extension, sau đó **tải lại tab YouTube** để áp dụng.

---

## 2. Quy ước đọc kế hoạch

- **Mã test:** `P7-<NHÓM>-<số>`. Dùng đúng mã này khi điền kết quả.
- **Ký hiệu bắt buộc Chrome thật:** 🔴 = **bắt buộc chạy trên Chrome thật + YouTube thật, không được giả lập, không được suy đoán kết quả.**
- **Ký hiệu đã chạy trong sandbox:** 🟢 = đã chạy xong trong sandbox (ghi lại chỉ để tham chiếu, không cần lặp lại trên Chrome trừ khi muốn kiểm tra chéo).
- **Cách thu thập evidence (dùng chung):**
  - **Ảnh chụp (screenshot):** đặt tên `P7-<NHÓM>-<số>_<mô tả>.png`, ví dụ `P7-POPUP-01_chip-cho-adapter.png`.
  - **DevTools (trang):** mở DevTools trên tab YouTube → tab **Console** → dán đoạn lệnh trong từng test → chụp màn hình hoặc copy nguyên văn output.
  - **DevTools (service worker):** tại `chrome://extensions`, trên thẻ WALE GUARD nhấn liên kết **service worker** → cửa sổ DevTools của worker → tab **Console**.
  - **Dán kết quả:** ghi nguyên văn output vào cột "Bằng chứng" của `PHASE_7_TEST_RESULTS.md` (kèm ảnh nếu cần).
- **Trạng thái hợp lệ:** `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`. **Không** điền `PASS` khi chưa thực sự chạy và quan sát.

---

## 3. Nhóm A — Cài đặt & Smoke 🔴

### P7-SETUP-01 — Nạp extension thành công
- **Điều kiện:** bản build 1.1.1 đã giải nén; hash `manifest.json` khớp mục 0.
- **Các bước:**
  1. Thực hiện mục 1 (Load unpacked).
  2. Quan sát thẻ extension.
- **Kết quả mong đợi:** thẻ hiển thị **WALE GUARD · 1.1.1**, không có thông báo lỗi; bấm **Errors** không có lỗi.
- **Evidence:** ảnh chụp thẻ extension trên `chrome://extensions`; output `Get-FileHash` của `manifest.json`.

### P7-SETUP-02 — Service worker khởi động
- **Điều kiện:** P7-SETUP-01 PASS.
- **Các bước:**
  1. Trên thẻ extension nhấn **service worker** để mở DevTools của worker.
  2. Kiểm tra worker ở trạng thái "active", console không có lỗi đỏ.
  3. Chạy: `await chrome.runtime.getManifest().then(m => m.version)`.
- **Kết quả mong đợi:** trả về `"1.1.1"`; không có exception.
- **Evidence:** ảnh chụp console worker + output lệnh.

### P7-SETUP-03 — Popup mở được
- **Điều kiện:** P7-SETUP-01 PASS.
- **Các bước:**
  1. Mở một tab `https://www.youtube.com/` bất kỳ.
  2. Bấm icon WALE GUARD để mở popup.
- **Kết quả mong đợi:** popup hiển thị đầy đủ (trạng thái bảo vệ, thống kê, danh sách module, **thẻ engine YouTube**), không trắng trang, không lỗi console.
- **Evidence:** ảnh chụp toàn bộ popup.

---

## 4. Nhóm B — Xác nhận engine vẫn **INERT** 🔴

> Mục tiêu: chứng minh trên Chrome thật rằng MAIN engine **chưa được đăng ký** và **chưa chạy** trong trang. Đây là bằng chứng runtime độc lập với bằng chứng tĩnh trong sandbox.

### P7-INERT-01 — Không có guard engine trên window (trang MAIN world)
- **Điều kiện:** đã nạp extension; đang ở tab YouTube đã tải xong.
- **Các bước:**
  1. Trên tab YouTube, mở DevTools → Console.
  2. Chạy: `typeof window.__wgYtEngine`.
  3. Chạy: `Object.prototype.hasOwnProperty.call(window, '__wgYtEngine')`.
- **Kết quả mong đợi:** `"undefined"` và `false`. Engine guard **không** tồn tại ⇒ `bootYouTubeEngine` chưa từng chạy.
- **Thu thập evidence:** copy nguyên văn hai output; chụp ảnh.

> Lưu ý: guard phải được kiểm tra trong **ngữ cảnh trang (MAIN world)**. Nếu DevTools console mặc định là ISOLATED, guard vẫn phải là `undefined`; đây là kết quả mong đợi. (Việc đo chính xác MAIN/ISOLATED được làm ở P7-INERT-04 bằng snippet tường minh.)

### P7-INERT-02 — Không có content script MAIN nào được đăng ký (service worker)
- **Điều kiện:** P7-SETUP-02 PASS (đang ở console service worker).
- **Các bước:**
  1. Trong console service worker chạy: `await chrome.scripting.getRegisteredContentScripts()`.
  2. Chạy tiếp: `await chrome.scripting.getRegisteredContentScripts({ ids: ['wg-youtube-engine-main'] })`.
- **Kết quả mong đợi:** cả hai lệnh trả về mảng **rỗng** `[]`. Không có `wg-youtube-engine-main` ⇒ seam `syncEngineRegistration` chưa được gọi.
- **Evidence:** copy nguyên văn hai output (mảng rỗng).

### P7-INERT-03 — Manifest không khai báo `content_scripts` 🟢/🔴
- **Điều kiện:** bản build 1.1.1.
- **Các bước:**
  1. Mở `chrome://extensions` → WALE GUARD → xem chi tiết; hoặc kiểm tra file `manifest.json` trong thư mục build.
  2. Tìm khóa `content_scripts`.
- **Kết quả mong đợi:** **không có** khóa `content_scripts`; manifest không tham chiếu `youtube-main.js`. (🟢 sandbox đã xác nhận: 0 match.)
- **Evidence:** ảnh chụp manifest; hoặc output lệnh sandbox đã ghi.

### P7-INERT-04 — Không có hook mạng/JSON-pruner nào được cài
- **Điều kiện:** tab YouTube đã tải xong.
- **Các bước:**
  1. Trên tab YouTube, mở DevTools → Console.
  2. Chạy: `typeof window.__yasHooks`.
  3. Chạy: `window.fetch.toString().length` và `window.fetch.name`.
  4. Chạy: `typeof window.XMLHttpRequest.prototype.open.toString` (kiểm tra nhanh) và tìm chuỗi nhận diện wrapper của engine (nếu có).
- **Kết quả mong đợi:** `window.__yasHooks` là `"undefined"`; `fetch`/`XHR` là bản gốc của trình duyệt/YouTube, **không** chứa wrapper của engine. Không có dấu hiệu engine can thiệp `fetch`/`XHR`/`ytInitialPlayerResponse`.
- **Evidence:** copy output; mô tả ngắn nhận định.
- **Ghi chú:** test này kiểm tra **gián tiếp**; nếu muốn kiểm tra tường minh trong MAIN world, có thể dùng extension thử nghiệm A-4 (P7-A4) để đọc đúng ngữ cảnh.

### P7-INERT-05 — Luồng đăng ký không xuất hiện trong bundle worker
- **Điều kiện:** có quyền truy cập file build.
- **Các bước:**
  1. Xác nhận `dist/service-worker.js` **không** chứa `registerContentScripts`, `unregisterContentScripts`, hay `youtube-main`.
- **Kết quả mong đợi:** 0 lần xuất hiện. (🟢 sandbox đã xác nhận: 0 match.)
- **Evidence:** output lệnh đã ghi (sandbox) hoặc ảnh chụp tìm kiếm trong file.

---

## 5. Nhóm C — Ba cờ MAIN luôn `WAITING_FOR_ADAPTER` 🔴

> Mục tiêu: trên Chrome thật, thẻ engine trong popup phải cho thấy **cả ba cờ MAIN** (JSON Pruner, Fetch Hook, XHR Hook) ở trạng thái **"Chờ adapter"**, kể cả sau khi người dùng lưu lựa chọn. Tuyệt đối không hiển thị "Đã tắt"/"thành công" cho ba cờ này.

### P7-POPUP-01 — Trạng thái nhóm MAIN là "Chờ adapter"
- **Điều kiện:** P7-SETUP-03 PASS; đang ở tab YouTube.
- **Các bước:**
  1. Mở popup.
  2. Tìm thẻ **engine YouTube**; đọc chip trạng thái `#yt-engine-state`.
  3. Đọc ba hàng MAIN (JSON Pruner / Fetch Hook / XHR Hook) — mỗi hàng có một chip riêng.
- **Kết quả mong đợi:** chip nhóm và cả ba chip MAIN hiển thị **"Chờ adapter"** (tone vàng/warn).
- **Evidence:** ảnh chụp thẻ engine; copy nội dung `#yt-engine-state` (`document.getElementById('yt-engine-state').textContent`).

### P7-POPUP-02 — Ghi chú mặc định BẬT
- **Điều kiện:** P7-POPUP-01.
- **Các bước:**
  1. Trong popup, đọc `#yt-engine-note`.
- **Kết quả mong đợi:** nội dung bắt đầu bằng **"Hook đang chạy theo mặc định: bật. Cơ chế truyền cờ chưa hoàn tất, nên lựa chọn tắt/bật của bạn chưa được áp dụng."** + ghi chú "Có hiệu lực sau khi tải lại trang."
- **Evidence:** copy `document.getElementById('yt-engine-note').textContent`.

### P7-POPUP-03 — Tắt một cờ MAIN không hiển thị "Đã tắt"
- **Điều kiện:** P7-POPUP-01.
- **Các bước:**
  1. Trong popup, gạt công tắc **JSON Pruner** sang OFF.
  2. Quan sát chip nhóm và chip của hàng đó; quan sát nhãn phụ của hàng.
  3. Kiểm tra nội dung văn bản **không** chứa các cụm cấm: `đã tắt`, `đã cập nhật`, `thành công`, `đã áp dụng`.
- **Kết quả mong đợi:** chip vẫn là **"Chờ adapter"**; hàng JSON Pruner hiện nhãn phụ **"(đã lưu, chưa áp dụng)"**; **không** có dấu tích xanh; **không** xuất hiện bất kỳ cụm cấm nào.
- **Evidence:** ảnh chụp sau khi gạt; copy toàn bộ `#yt-engine-note` + `#yt-layers`. Có thể kiểm tra tự động bằng: `document.getElementById('yt-layers').textContent.toLowerCase()`.

### P7-POPUP-04 — Lựa chọn được lưu nhưng vẫn chờ adapter (persist)
- **Điều kiện:** P7-POPUP-03 (đã tắt JSON Pruner).
- **Các bước:**
  1. Trong console service worker chạy: `await chrome.storage.sync.get('youtubeEngineFlags')`.
  2. Đóng popup rồi mở lại.
  3. Quan sát vị trí công tắc JSON Pruner và chip trạng thái.
- **Kết quả mong đợi:** `youtubeEngineFlags.ENABLE_JSON_PRUNER === false` (đã lưu `desiredState`); công tắc giữ vị trí OFF sau khi mở lại; chip nhóm và chip hàng vẫn **"Chờ adapter"** (chưa hề hiển thị "Đã tắt").
- **Evidence:** output `chrome.storage.sync.get`; ảnh chụp popup sau khi mở lại.

### P7-POPUP-05 — Ba cờ ISOLATED hiển thị theo lựa chọn (đối chứng)
- **Điều kiện:** P7-SETUP-03.
- **Các bước:**
  1. Trong popup, tìm ba hàng ISOLATED (DNR, Runtime Guard, CSS Hider).
  2. Gạt một hàng sang OFF rồi ON; quan sát chip.
  3. Kiểm tra `chrome.storage.sync.get('youtubeEngineFlags')` trong console worker.
- **Kết quả mong đợi:** ba hàng ISOLATED hiển thị **"Đang bật"/"Đã tắt"** theo lựa chọn (không dùng bảng WAITING); giá trị được lưu vào `youtubeEngineFlags`. Điều này chứng minh nhóm MAIN **khác biệt** nhóm ISOLATED (đúng thiết kế).
- **Evidence:** ảnh chụp; output `chrome.storage.sync.get`.

### P7-POPUP-06 — Cụm cấm không xuất hiện (kiểm tra tổng hợp)
- **Điều kiện:** đã tắt ít nhất một cờ MAIN (P7-POPUP-03).
- **Các bước:**
  1. Trong popup, chạy trong console của popup (chuột phải vào popup → Inspect):
     ```
     (() => {
       const txt = document.getElementById('yt-layers').textContent.toLowerCase();
       const banned = ['đã tắt','đã cập nhật','thành công','đã áp dụng'];
       return banned.filter(p => txt.includes(p));
     })()
     ```
- **Kết quả mong đợi:** trả về mảng rỗng `[]`.
- **Evidence:** copy output.

---

## 6. Nhóm D — Bảo toàn playback (A/B: bật vs tắt extension) 🔴

> Đây là tiêu chí an toàn số một (Constitution III/VIII: playback ưu tiên hơn tỷ lệ chặn). Vì engine hiện **INERT**, kỳ vọng cơ bản là **không có khác biệt** giữa hai lần chạy — tức extension không gây hại playback. Test vẫn phải chạy thật để có bằng chứng.

Với **mỗi** test P7-PLAY-01…05, chạy hai lượt (A: extension **đang bật**; B: extension **đã tắt** bằng công tắc tổng trong popup hoặc `chrome://extensions`). Ghi lại cả hai.

- **Điều kiện:** tab YouTube, video ổn định, mạng ổn định; đã ghi lại ID video + loại quảng cáo (trước/giữa/không có).
- **Các bước (chung):**
  1. Lượt A: bật extension → mở video → xem **tối thiểu 60 giây** (hoặc hết video ngắn).
  2. Quan sát: video phát, âm thanh, chất lượng, có/tắt tiếng bất thường, sự kiện `pause`/`stalled`, lỗi console.
  3. Lượt B: tắt extension → tải lại cùng video → lặp lại quan sát.
  4. So sánh A với B.
- **Kết quả mong đợi:** hành vi playback của A **giống** B; không xuất hiện lỗi/stall/đen hình/kẹt tiếng do extension; video phát trơn tru ở cả hai lượt.

| Mã | Tiêu chí quan sát (US liên quan) |
|----|----------------------------------|
| P7-PLAY-01 | Trang chủ YouTube tải bình thường, không vỡ layout (US-1). |
| P7-PLAY-02 | Video có **quảng cáo trước** vẫn phát được và tự chuyển sang nội dung (US-2). |
| P7-PLAY-03 | Video có **quảng cáo giữa chừng**: nội dung tiếp tục phát sau quảng cáo (US-3). |
| P7-PLAY-04 | Trang xem video không bị "mất" các phần tử UI do ẩn nhầm (US-4). |
| P7-PLAY-05 | Bật/tắt các công tắc trong popup → video không bị gián đoạn khi thao tác (US-5). |

- **Evidence:** ảnh chụp trình phát ở cả hai lượt; video quay màn hình ngắn (nếu có); copy console (không có lỗi liên quan playback); ghi rõ ID video và loại quảng cáo.

---

## 7. Nhóm E — Regression ngoài YouTube 🔴

### P7-REG-01 — Trang thường không hư hại
- **Điều kiện:** extension đang bật.
- **Các bước:** mở lần lượt 5 trang phổ biến (ví dụ một trang tin, một trang bán hàng, một trang có form đăng nhập, một trang PDF, một trang phát video khác).
  1. Quan sát layout, console, khả năng tương tác.
- **Kết quả mong đợi:** không vỡ layout, không lỗi console do extension, các chức năng chính hoạt động.
- **Evidence:** danh sách URL + ảnh chụp; console của mỗi trang.

### P7-REG-02 — Chặn quảng cáo/tracker vẫn hoạt động (không hồi quy)
- **Điều kiện:** extension đang bật.
- **Các bước:**
  1. Mở một trang có quảng cáo hiển thị; quan sát bộ đếm chặn trong popup.
  2. Kiểm tra tại `chrome://extensions` → WALE GUARD → **Errors** không có lỗi DNR.
- **Kết quả mong đợi:** bộ đếm tăng; không lỗi ruleset DNR (trừ ruleset `youtube` vẫn `enabled: false` như thiết kế).
- **Evidence:** ảnh chụp popup (số liệu) + trang Errors.

### P7-REG-03 — Ruleset YouTube vẫn tắt
- **Điều kiện:** bản build 1.1.1.
- **Các bước:** kiểm tra trong `manifest.json` mục `declarative_net_request.rule_resources` với id `youtube`.
- **Kết quả mong đợi:** `youtube` có `enabled: false` (đúng như build hiện tại; engine chưa kích hoạt).
- **Evidence:** ảnh chụp manifest.

---

## 8. Nhóm F — T066: Thí nghiệm A-2 (MAIN có đọc được `chrome.storage`?) 🔴

> **Cần một extension thử nghiệm RIÊNG** (không phải WALE GUARD production), theo đúng quy trình tại `verification/A-2-main-storage-access.md` mục 3–5. **Không** chèn mã thử nghiệm vào build production.
>
> **Đã dựng sẵn:** `verification/experiments/a2-storage-probe/` (Load unpacked thư mục này). Hướng dẫn đọc kết quả: `verification/experiments/README.md`.

### P7-A2-01 — Chạy thí nghiệm A-2
- **Điều kiện:** extension thử nghiệm đã dựng sẵn tại `verification/experiments/a2-storage-probe/` (một content script MAIN + một ISOLATED, `run_at: document_start`, quyền `storage`); Chrome thật.
- **Các bước:** theo `A-2-main-storage-access.md` mục 4 (đặt giá trị trong `chrome.storage.sync` từ ISOLATED; mở YouTube mới ≥3 lần; đọc `window.__a2Probe`; lặp 1 lần qua SPA).
- **Kết quả mong đợi:** ghi lại `typeof chrome` / `typeof chrome.storage` / lỗi gọi storage trong MAIN. **Không phán đoán trước.**
- **Điền kết quả vào:** mục 5 (bảng) và mục 7 (kết luận) của `A-2-main-storage-access.md`, và dòng P7-A2-01 trong `PHASE_7_TEST_RESULTS.md`.
- **Evidence:** ảnh chụp `window.__a2Probe` mỗi lần; phiên bản Chrome; hệ điều hành.

---

## 9. Nhóm G — T067: Instrumentation A-4 (thứ tự chạy MAIN/ISOLATED) 🔴

> **Cần instrumentation riêng** theo `verification/A-4-document-start-order.md` mục 3–5. Không tích hợp vào production.
>
> **Đã dựng sẵn:** `verification/experiments/a4-start-order/` (Load unpacked thư mục này). Bật/tắt "snapshot" và cách đọc `window.__a4Log`: `verification/experiments/README.md`.

### P7-A4-01 — Chạy instrumentation A-4
- **Điều kiện:** instrumentation đã dựng sẵn tại `verification/experiments/a4-start-order/` (hai world ghi log theo schema ở `A-4-document-start-order.md` mục 3); Chrome thật.
- **Các bước:** theo `A-4-document-start-order.md` mục 4: ≥20 điều hướng mới + ≥20 chuyển video SPA; chạy cả có snapshot và không snapshot.
- **Kết quả mong đợi:** thu được bảng thứ tự tại mục 5 của file đó; ghi rõ số lần MAIN trước / ISOLATED trước / không xác định.
- **Điền kết quả vào:** mục 5 + mục 7 của `A-4-document-start-order.md`, và dòng P7-A4-01 trong `PHASE_7_TEST_RESULTS.md`.
- **Evidence:** bảng tổng hợp + ảnh chụp `window.__a4Log` (mẫu đại diện).

---

## 10. Tổng hợp — Test nào BẮT BUỘC Chrome thật

| Nhóm | Mã test | Bắt buộc Chrome thật? | Ghi chú |
|------|---------|-----------------------|---------|
| Setup | P7-SETUP-01..03 | 🔴 Có | Cài đặt & smoke |
| INERT | P7-INERT-01, 02, 04 | 🔴 Có | Bằng chứng runtime trong trang/worker |
| INERT | P7-INERT-03, 05 | 🟢/🔴 | Đã xác nhận tĩnh trong sandbox; xác nhận chéo trên Chrome nếu muốn |
| Popup | P7-POPUP-01..06 | 🔴 Có | Hiển thị thực tế + cụm cấm |
| Playback | P7-PLAY-01..05 | 🔴 Có | A/B trên video thật |
| Regression | P7-REG-01, 02 | 🔴 Có | Trang ngoài YouTube |
| Regression | P7-REG-03 | 🟢/🔴 | Kiểm tra tĩnh manifest |
| A-2 (T066) | P7-A2-01 | 🔴 Có | Cần extension thử nghiệm riêng |
| A-4 (T067) | P7-A4-01 | 🔴 Có | Cần instrumentation riêng |

**Tuyệt đối không giả lập kết quả** cho bất kỳ mã nào ở cột "🔴 Có". Mọi PASS phải kèm evidence quan sát được.

---

## 11. Xác nhận INERT và WAITING_FOR_ADAPTER — tóm tắt một chỗ

**Engine INERT khi và chỉ khi (tất cả đúng):**
1. `typeof window.__wgYtEngine === "undefined"` trên tab YouTube (P7-INERT-01).
2. `await chrome.scripting.getRegisteredContentScripts()` trả `[]` (P7-INERT-02).
3. `manifest.json` không có `content_scripts`; không tham chiếu `youtube-main.js` (P7-INERT-03).
4. Không có hook `fetch`/`XHR`/`__yasHooks` do engine cài (P7-INERT-04).
5. `dist/service-worker.js` không chứa `registerContentScripts`/`youtube-main` (P7-INERT-05).

**Ba cờ MAIN vẫn WAITING_FOR_ADAPTER khi (tất cả đúng):**
1. Thẻ engine hiển thị chip **"Chờ adapter"**; cả ba hàng MAIN cùng trạng thái (P7-POPUP-01).
2. Ghi chú nói rõ "Hook đang chạy theo mặc định: bật…" (P7-POPUP-02).
3. Sau khi tắt một cờ MAIN, chip **vẫn** "Chờ adapter", hàng hiện "(đã lưu, chưa áp dụng)", không dấu tích xanh (P7-POPUP-03).
4. Lựa chọn được lưu trong `youtubeEngineFlags` nhưng không được hiển thị là đã áp dụng (P7-POPUP-04).
5. Không cụm cấm nào xuất hiện cho ba cờ MAIN (P7-POPUP-06).

---

## 12. Ràng buộc thực thi Phase 7 (bắt buộc)

1. **Không** kích hoạt engine, **không** thêm import/gọi `syncEngineRegistration`, **không** sửa `registration.ts`.
2. **Không** bật bất kỳ cờ MAIN nào thành có hiệu lực; giữ nguyên `WAITING_FOR_ADAPTER`.
3. **Không** đổi `manifest.json` của bản build (đặc biệt không thêm `content_scripts`).
4. Thí nghiệm A-2/A-4 dùng **extension thử nghiệm tách biệt**, không trộn vào build production.
5. Điền kết quả trung thực vào `PHASE_7_TEST_RESULTS.md`; dùng `BLOCKED`/`NOT_RUN` khi chưa chạy được.
