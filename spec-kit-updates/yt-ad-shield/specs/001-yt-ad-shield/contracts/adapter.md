# Contract: Communication Adapter (MAIN ↔ ISOLATED)

**Trạng thái:** IMPLEMENTED. Cơ chế truyền **đã chốt (T004 RESOLVED)** = phương án A: thuộc tính `dataset` trên `document.documentElement`.
**Phạm vi:** chỉ truyền snapshot cờ bật/tắt. Không truyền dữ liệu response, không truyền lệnh thực thi.

## 1. Ranh giới

```
ISOLATED world                         MAIN world
chrome.storage.sync                    
   │                                   
settings.js ──► adapter.publish() ═══ [attr data-wg-yt-flags trên <html>] ═══► adapter.onReceive()
                                                          │
                                                    FeatureFlags.applyRemote()
                                                          │
                                                    module MAIN đọc get(name)
```

Đoạn `═══` đã chốt cơ chế (T004): một attribute JSON `data-wg-yt-flags` trên `<html>`, do ISOLATED ghi và MAIN đọc (+ `MutationObserver` cho lần ghi sau). Mọi thứ khác là cố định.

## 2. Phạm vi module phụ thuộc adapter

Chỉ các module chạy ở MAIN world cần cờ từ adapter:
- `initial-response.js` (ENABLE_JSON_PRUNER)
- `fetch-filter.js` (ENABLE_FETCH_HOOK)
- `xhr-filter.js` (ENABLE_XHR_HOOK)

Các module ISOLATED đọc `chrome.storage.sync` trực tiếp qua `settings.js`, **không cần adapter**. Vì vậy T004 chỉ ảnh hưởng ba cờ trên, và không ảnh hưởng ENABLE_DNR (chạy trong trình duyệt) hay cờ của các module ISOLATED.

## 3. Giao diện adapter (áp dụng cho mọi cơ chế)

Adapter là object có:

| Thành viên | Phía | Mô tả |
|-----------|------|-------|
| `name` | cả hai | Chuỗi định danh cơ chế. `"null"` khi chưa chọn. |
| `publish(snapshot)` | ISOLATED | Gửi snapshot đã kiểm tra. Trả về `{ok}`. Không ném lỗi. |
| `onReceive(callback)` | MAIN | Đăng ký nhận. Callback nhận dữ liệu thô, phải đưa qua `applyRemote`. Trả về hàm huỷ. |
| `start()` | cả hai | Bắt đầu lắng nghe hoặc gửi. Idempotent. |
| `dispose()` | cả hai | Gỡ listener. Idempotent. |
| `status()` | cả hai | `{name, started, deliveredCount, rejectedCount, lastError}` |

## 4. Quy tắc bắt buộc

- Adapter **không** tin dữ liệu nhận được: mọi message đi qua `FeatureFlags.applyRemote` trước khi dùng.
- Adapter **không** thực thi nội dung message (không `eval`, không `new Function`, không chèn `<script>`).
- Adapter **không** ném lỗi ra ngoài. Lỗi được đếm trong `rejectedCount` và `lastError`.
- MAIN world **không** gọi `chrome.*`.
- Adapter không thêm quyền manifest ngoài những quyền đã khai báo, trừ khi T004 quyết định rõ và được ghi vào `COMPATIBILITY.md`.
- Adapter không ghi vào DOM ngoài đúng thuộc tính hoặc kênh đã chọn.

## 5. NullAdapter (giữ làm adapter trung tính cho test)

> **Cập nhật T004:** từ khi chốt phương án A, adapter **đang hoạt động** là `DatasetAdapter` (`src/youtube/adapter/dataset-adapter.ts`). `NullAdapter` **không còn** là cơ chế chạy thật — nó được giữ như một adapter hợp lệ về contract, dùng cho test và làm mặc định "chưa có cờ từ ISOLATED".

Đặc điểm:
- `name = "null"`.
- `publish` không làm gì, trả `{ok: true, deliveredCount: 0}`.
- `onReceive` không bao giờ được gọi.
- MAIN world dùng mặc định từ `features.js`.

NullAdapter không phải cơ chế truyền. Nó là trạng thái rõ ràng "chưa có cờ từ ISOLATED". Đây là một adapter hợp lệ về mặt contract, cho phép toàn bộ registry và module được kiểm thử.

## 6. Các lựa chọn cho T004 — **đã chốt phương án A**

| Lựa chọn | Ưu điểm | Rủi ro cần kiểm tra | Quyết định |
|---------|---------|---------------------|-----------|
| A. Thuộc tính `dataset` trên `document.documentElement` | Đồng bộ, đọc được ngay | Thứ tự chạy giữa hai world ở `document_start` chưa được đảm bảo; đã xử lý bằng mặc định A-3 + `MutationObserver` chờ root | **CHỌN** |
| B. `window.postMessage` | Không đổi DOM, có sự kiện | Bất đồng bộ; cần kiểm tra MAIN có nhận kịp trước khi YouTube đọc response đầu tiên không | Không chọn |
| C. `CustomEvent` trên `window` hoặc `document` | Tương tự B | Cần xác minh event detail có đi qua được giữa hai world không | Không chọn |

Ràng buộc chung cho mọi lựa chọn: cờ mặc định phải có hiệu lực khi chưa nhận snapshot (mục 5). Không lựa chọn nào được phép chặn việc cài hook.

**Lý do chọn A:** đọc **đồng bộ** ngay khi MAIN khởi động (không phải chờ message async), không cần thêm quyền manifest, không tạo kênh `postMessage`/event lộ ra trang. Rủi ro A-4 (thứ tự hai world) được hạ xuống vô hại vì MAIN chạy mặc định A-3 (bật) đến khi attribute xuất hiện, rồi mới `applyRemote`. Snapshot chỉ có thể **giảm** bảo vệ theo lựa chọn rõ ràng, không bao giờ tự tắt engine.

## 7. Nghiệm thu khi T004 được chốt (đã chốt — phương án A)

T004 đã chốt; các artifact đã tạo/đổi (đúng phạm vi cho phép):
- Adapter cụ thể: `src/youtube/adapter/dataset-adapter.ts` (`DatasetAdapter`, thuộc tính `data-wg-yt-flags`).
- Integration test: `tests/unit/youtube/dataset-adapter.test.ts`.
- Bảng quyết định: `docs/ARCHITECTURE.md` mục 4 (đã cập nhật).
- Phía ISOLATED: `src/youtube/isolated/content-entry.ts`; phía MAIN: nối trong `src/youtube/main/main.ts`.

Không thay đổi: registry, config schema, FeatureFlags, các module logic, hay contract của `feature-flags.md`.

Bộ **contract test chung** cho adapter (đã phủ bởi `dataset-adapter.test.ts` + `adapter-null.test.ts`):
1. `publish` snapshot hợp lệ, MAIN nhận và `get` trả đúng giá trị. ✅
2. Snapshot sai schemaVersion bị từ chối, giá trị cũ giữ nguyên. ✅ (`FeatureFlags.applyRemote` all-or-nothing)
3. Snapshot thiếu khóa bị từ chối toàn bộ. ✅
4. `dispose` gỡ listener, `publish` sau dispose không gây lỗi. ✅
5. `start` gọi hai lần không tạo listener trùng. ✅
6. Snapshot đến trước khi MAIN cài hook: hook áp dụng từ lần xử lý đầu tiên sau đó. ✅ (mặc định A-3 + `deliver()` đọc lần đầu trong `start`)
7. Snapshot đến sau khi hook đã chạy: hook áp dụng từ lần xử lý tiếp theo, không cần cài lại. ✅ (`MutationObserver` gọi lại `deliver`)

## 8. Giả định và phụ thuộc chưa giải quyết

| Mã | Giả định / phụ thuộc | Trạng thái | Cách kiểm tra |
|----|---------------------|-----------|---------------|
| A-1 | Chỉ ba cờ MAIN cần adapter | Giả định, dựa trên kiến trúc v3 | Rà lại khi thêm module MAIN mới |
| A-2 | MAIN world không đọc được `chrome.storage` | UNVERIFIED. Chỉ là giả định theo kiến trúc. Không được đánh VERIFIED khi chưa có kết quả trong `verification/A-2-main-storage-access.md`. | Thực hiện thủ tục A-2 trên Chrome mục tiêu |
| A-3 | Khi chưa có snapshot hợp lệ, ba cờ MAIN có hiệu lực là bật (mặc định từ `features.js`) | Quyết định có chủ đích. Phải ghi trong README và popup. Popup không được hiển thị ba cờ này là TẮT khi hiệu lực đang là BẬT. Xem `popup-state.md`. | Kiểm tra README và popup theo acceptance của `popup-state.md` |
| A-4 | Thứ tự chạy giữa hai world ở `document_start` | UNVERIFIED. Không giả định world nào chạy trước. Phải đo theo `verification/A-4-document-start-order.md` trên Chrome mục tiêu, cho cả điều hướng mới và SPA, trước khi chọn cơ chế. | Thực hiện thủ tục A-4 |
| A-5 | Cơ chế được chọn không yêu cầu quyền mới | **ĐÚNG** — phương án A không thêm quyền nào; `scripting` + `<all_urls>` đã khai báo sẵn (T021) | Đối chiếu `manifest.config.ts` sau khi chọn |
| D-1 | T004 chốt cơ chế truyền | **CLOSED** — phương án A (`DatasetAdapter`, attribute `data-wg-yt-flags`) | Xem mục 6–7 |
| D-2 | Popup hiển thị trạng thái "chờ adapter" cho ba cờ MAIN | Đã triển khai (Phase 6) — hiển thị `ENABLED`/`DISABLED` khi engine đã đăng ký, `WAITING_FOR_ADAPTER` khi chưa | Xem `popup-state.md`, `popup/yt-layers.ts` |


## 9. Ranh giới lưu trữ (A-2)

- Mọi truy cập `chrome.storage` của extension nằm ở ISOLATED world, thông qua `src/isolated/settings.js`.
- Module MAIN không gọi `chrome.*` trực tiếp. Chúng chỉ đọc `FeatureFlags`, và `FeatureFlags` chỉ được cập nhật qua adapter.
- Nếu A-2 được xác minh là sai (MAIN có thể đọc `chrome.storage`), việc đổi này không làm thay đổi registry hay module logic. Chỉ adapter được thay đổi cách lấy snapshot. Điều này là cách làm giảm rủi ro khi giả định sai.

## 10. Trạng thái và hành vi mặc định (A-3)

Khi không có snapshot hợp lệ (`snapshotState` = MISSING hoặc INVALID):

- Ba cờ MAIN có hiệu lực là BẬT.
- `desiredState` vẫn được lưu nếu người dùng thao tác, nhưng không được coi là hiệu lực.
- Popup hiển thị trạng thái WAITING_FOR_ADAPTER, không hiển thị là TẮT (xem `popup-state.md`).
- README phải ghi cùng hành vi này (xem `README.md` mục "Hành vi chờ adapter").

Mô hình trạng thái đầy đủ (desiredState, effectiveState, adapterState, snapshotState) nằm ở `popup-state.md` mục 2. Adapter không tự định nghĩa lại các trạng thái này.

## 11. Đồng bộ với README

Các mệnh đề sau phải giống nhau trong `README.md`, `contracts/adapter.md` và `contracts/popup-state.md`:

1. Ba cờ MAIN chưa tắt được qua popup trước khi T004 chốt.
2. Khi chưa có snapshot, ba cờ MAIN chạy theo mặc định bật.
3. Popup hiển thị WAITING_FOR_ADAPTER cho ba cờ này, không hiển thị ENABLED hay DISABLED khi chưa áp dụng.
4. A-2 và A-4 là UNVERIFIED cho đến khi có kết quả thử nghiệm.

Nếu một trong bốn mệnh đề này thay đổi, phải cập nhật cả ba tài liệu trong cùng thay đổi.
