# Phase 7 — Mẫu ghi kết quả kiểm thử trên Chrome thật

> **Trạng thái Phase 7:** `PENDING_REAL_CHROME_VALIDATION` — chưa chạy ca nào, mọi ô = `NOT_RUN`.

> **Cách dùng:** sau khi chạy từng test trong `PHASE_7_REAL_CHROME_TEST_PLAN.md`, điền `PASS`/`FAIL`/`BLOCKED`/`NOT_RUN` và dán bằng chứng vào bảng tương ứng. **Không** điền `PASS` khi chưa thực sự chạy và quan sát. Gửi lại file này (đã điền) để tiếp tục xử lý.

**Người chạy:** ___________  **Ngày chạy:** ___________  **Hệ điều hành:** ___________
**Phiên bản Chrome:** ___________  **Extension ID (WALE GUARD):** ___________
**Bản build:** WALE GUARD 1.1.1 · hash `manifest.json`: `c13a64de3a6c2185ea65abc57a76183429dddc381596b5e991d0cf6ef7a47426`
**Trạng thái engine khi kiểm thử:** ĐÃ KÍCH HOẠT (đăng ký động qua công tắc module; T004 đã chốt). **Ba cờ MAIN kỳ vọng:** READY (ENABLED/DISABLED) khi có snapshot; WAITING_FOR_ADAPTER chỉ khi chưa có snapshot hợp lệ.

> **Lưu ý (checkpoint v10):** mẫu kết quả này được soạn khi engine còn INERT; mục B ("Xác nhận engine INERT") nay đổi nghĩa thành "xác nhận engine được đăng ký và chạy" — xem banner đầu `PHASE_7_REAL_CHROME_TEST_PLAN.md`.

Trạng thái hợp lệ cho cột "Kết quả": `PASS` · `FAIL` · `BLOCKED` · `NOT_RUN`.

---

## A. Cài đặt & Smoke

| Mã | Điều kiện | Kết quả | Bằng chứng (ảnh/output) | Ghi chú |
|----|-----------|---------|--------------------------|---------|
| P7-SETUP-01 | Load unpacked, hash manifest khớp | NOT_RUN | | |
| P7-SETUP-02 | Service worker active, `version === "1.1.1"` | NOT_RUN | | |
| P7-SETUP-03 | Popup mở đầy đủ | NOT_RUN | | |

---

## B. Xác nhận engine INERT

| Mã | Điều kiện | Kết quả | Bằng chứng (ảnh/output nguyên văn) | Ghi chú |
|----|-----------|---------|-------------------------------------|---------|
| P7-INERT-01 | `typeof window.__wgYtEngine === "undefined"` | NOT_RUN | | |
| P7-INERT-02 | `getRegisteredContentScripts()` → `[]` | NOT_RUN | | |
| P7-INERT-03 | manifest không có `content_scripts` | NOT_RUN | | |
| P7-INERT-04 | Không có `__yasHooks` / hook fetch/XHR | NOT_RUN | | |
| P7-INERT-05 | `service-worker.js` không có register/youtube-main | NOT_RUN | | |

---

## C. Ba cờ MAIN luôn WAITING_FOR_ADAPTER

| Mã | Điều kiện | Kết quả | Bằng chứng | Ghi chú |
|----|-----------|---------|------------|---------|
| P7-POPUP-01 | Chip nhóm + 3 hàng MAIN = "Chờ adapter" | NOT_RUN | | |
| P7-POPUP-02 | Ghi chú "Hook đang chạy theo mặc định: bật…" | NOT_RUN | | |
| P7-POPUP-03 | Tắt JSON Pruner → vẫn "Chờ adapter", nhãn "(đã lưu, chưa áp dụng)" | NOT_RUN | | |
| P7-POPUP-04 | Lưu vào `youtubeEngineFlags`, vẫn "Chờ adapter" sau khi mở lại | NOT_RUN | | |
| P7-POPUP-05 | 3 cờ ISOLATED hiển thị theo lựa chọn (đối chứng) | NOT_RUN | | |
| P7-POPUP-06 | Không cụm cấm (`[]`) | NOT_RUN | | |

**Ghi lại giá trị thực tế (dán nguyên văn):**
- `#yt-engine-state`.textContent = ______________________
- `#yt-engine-note`.textContent = ______________________
- `chrome.storage.sync.get('youtubeEngineFlags')` = ______________________
- Kết quả kiểm cụm cấm (P7-POPUP-06) = ______________________

---

## D. Bảo toàn playback (A/B: bật vs tắt extension)

| Mã | Video ID / loại quảng cáo | Lượt A (extension BẬT) | Lượt B (extension TẮT) | Giống nhau? | Kết quả | Bằng chứng |
|----|---------------------------|-------------------------|-------------------------|-------------|---------|------------|
| P7-PLAY-01 (US-1) | | | | | NOT_RUN | |
| P7-PLAY-02 (US-2, pre-roll) | | | | | NOT_RUN | |
| P7-PLAY-03 (US-3, mid-roll) | | | | | NOT_RUN | |
| P7-PLAY-04 (US-4) | | | | | NOT_RUN | |
| P7-PLAY-05 (US-5) | | | | | NOT_RUN | |

**Mô tả quan sát A vs B** (lỗi console, stall, âm thanh, chất lượng):
_______________________________________________________________________

---

## E. Regression ngoài YouTube

| Mã | Điều kiện | Kết quả | Bằng chứng | Ghi chú |
|----|-----------|---------|------------|---------|
| P7-REG-01 | 5 trang thường không hư hại | NOT_RUN | | |
| P7-REG-02 | Bộ đếm chặn tăng, không lỗi DNR | NOT_RUN | | |
| P7-REG-03 | Ruleset `youtube` vẫn `enabled: false` | NOT_RUN | | |

---

## F. T066 — Thí nghiệm A-2 (MAIN & `chrome.storage`)

| Mã | Kết quả | Bằng chứng | Đã ghi vào `A-2-main-storage-access.md`? |
|----|---------|------------|-------------------------------------------|
| P7-A2-01 | NOT_RUN | | ☐ mục 5 ☐ mục 7 |

**Bảng kết quả A-2 (điền, tham chiếu mục 5 file A-2):**

| Lần | Điều hướng | typeof chrome (MAIN) | typeof chrome.storage (MAIN) | Lỗi gọi storage (MAIN) | Giá trị đọc từ ISOLATED |
|-----|-----------|----------------------|------------------------------|------------------------|--------------------------|
| 1 | mới | | | | |
| 2 | mới | | | | |
| 3 | mới | | | | |
| 4 | SPA | | | | |

---

## G. T067 — Instrumentation A-4 (thứ tự MAIN/ISOLATED)

| Mã | Kết quả | Bằng chứng | Đã ghi vào `A-4-document-start-order.md`? |
|----|---------|------------|--------------------------------------------|
| P7-A4-01 | NOT_RUN | | ☐ mục 5 ☐ mục 7 |

**Bảng kết quả A-4 (điền, tham chiếu mục 5 file A-4):**

| Nhóm | Số lần | MAIN trước ISOLATED | ISOLATED trước MAIN | Không xác định | Ghi chú |
|------|--------|---------------------|---------------------|----------------|---------|
| Điều hướng mới, có snapshot | | | | | |
| Điều hướng mới, không snapshot | | | | | |
| SPA | | | | | |

---

## H. Tổng kết

| Chỉ số | Giá trị |
|--------|---------|
| Tổng số test | 24 |
| PASS | |
| FAIL | |
| BLOCKED / NOT_RUN | |
| Engine còn INERT? (Y/N) | |
| Ba cờ MAIN còn WAITING_FOR_ADAPTER? (Y/N) | |

**Test FAIL (mã + mô tả ngắn):**
_______________________________________________________________________

**Test BLOCKED (mã + lý do):**
_______________________________________________________________________

**Giới hạn / phát hiện mới cần xử lý tiếp:**
_______________________________________________________________________

**Người chạy ký xác nhận:** _______________  **Ngày:** ___________
