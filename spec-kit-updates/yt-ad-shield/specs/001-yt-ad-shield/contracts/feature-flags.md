# Contract: Feature Flag Interface (world-independent)

**Trạng thái:** SPECIFIED. Không phụ thuộc T004.
**Vị trí dự kiến trong code:** `src/core/feature-flags.js` (logic thuần, không gọi `window`, `chrome` hay `document`).

## 1. Mục đích

Cung cấp một nguồn đọc cờ bật/tắt duy nhất cho mọi module, không quan tâm cờ được truyền từ đâu. Module chỉ biết interface này. Cơ chế truyền giữa MAIN world và ISOLATED world nằm sau adapter (xem `adapter.md`), và có thể thay đổi khi T004 được chốt.

## 2. Tên cờ (khóa cố định)

Lấy từ `src/config/features.js`:

ENABLE_JSON_PRUNER, ENABLE_FETCH_HOOK, ENABLE_XHR_HOOK, ENABLE_DNR, ENABLE_RUNTIME_GUARD, ENABLE_PLAYBACK_WATCHDOG, ENABLE_RECOVERY, ENABLE_CSS_HIDER, ENABLE_AD_STATE_MACHINE, ENABLE_SPA_NAVIGATION, ENABLE_DOM_OBSERVER, ENABLE_DEBUG_LOGGER.

Tổng cộng 12 cờ. Thêm cờ mới phải tăng `FLAG_SCHEMA_VERSION` và cập nhật `CONFIGURATION.md`.

## 3. Snapshot

```
{
  schemaVersion: <số nguyên, = FLAG_SCHEMA_VERSION>,
  flags: { <tên cờ>: <boolean>, ... }   // đủ 12 khóa, không thiếu, không thừa
}
```

Snapshot không đầy đủ hoặc có khóa lạ bị từ chối toàn bộ, không áp dụng từng phần.

## 4. API

| Hàm | Đầu vào | Đầu ra | Hành vi |
|-----|---------|--------|---------|
| `get(name)` | tên cờ | boolean | Trả về giá trị hiện hành. Nếu chưa có snapshot nào được chấp nhận, trả về mặc định từ `features.js`. Tên không tồn tại: trả `false` và ghi `UNKNOWN_FLAG` một lần. Không ném lỗi. |
| `applyRemote(snapshot)` | object | `{ok: boolean, reason?: string}` | Kiểm tra schemaVersion, đủ khóa, kiểu boolean. Hợp lệ thì thay toàn bộ giá trị và phát thông báo nếu có thay đổi. Không hợp lệ thì giữ giá trị cũ, trả `ok: false` với `reason`. |
| `snapshot()` | — | `{schemaVersion, flags, source, receivedAt}` | `source` là `"default"` hoặc `"adapter"`. Dùng cho log và popup. |
| `subscribe(handler)` | hàm | hàm huỷ đăng ký | `handler(changedNames)` chỉ được gọi khi có cờ thực sự đổi giá trị. |
| `dispose()` | — | — | Huỷ mọi subscription. Idempotent. |

## 5. Quy tắc đọc cờ của module

- Module đọc cờ **tại thời điểm thực hiện** (mỗi lần xử lý response, mỗi tick), không chỉ lúc `init`. Nhờ vậy snapshot đến muộn vẫn có hiệu lực từ lần xử lý tiếp theo.
- Module có thể đăng ký `subscribe` để dispose khi cờ của nó tắt. Đây là tùy chọn, không thay thế việc kiểm tra tại thời điểm thực hiện.
- Khi cờ tắt, module không tạo tài nguyên mới (FR-015). Tài nguyên đã tạo được dọn qua Lifecycle Manager.

## 6. Ràng buộc

- Không chứa `chrome.*`, `window.postMessage`, `document.*`. Mọi I/O thuộc adapter.
- Không tự gọi adapter. Adapter gọi `applyRemote`.
- Không lưu cờ vào `localStorage` hay `sessionStorage` (trùng với các ràng buộc đã nêu trong constitution I và II).
- Hàm thuần, kiểm thử được bằng Node không cần trình duyệt.

## 7. Nghiệm thu (không phụ thuộc T004)

- `get` trả mặc định trước khi có snapshot.
- `applyRemote` từ chối snapshot thiếu khóa, thừa khóa, sai kiểu, sai schemaVersion, và giữ giá trị cũ.
- `subscribe` không được gọi khi snapshot không đổi giá trị.
- `get` với tên lạ trả `false` và không ném lỗi.
- Trạng thái: SPECIFIED.
