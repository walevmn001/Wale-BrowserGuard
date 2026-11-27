# Extension thử nghiệm Phase 7 (A-2, A-4)

Hai extension **tách biệt** phục vụ các thí nghiệm cần Chrome thật trong Phase 7:

| Thư mục | Test | Verification doc |
|---------|------|------------------|
| `a2-storage-probe/` | P7-A2-01 (T066) | `../../A-2-main-storage-access.md` |
| `a4-start-order/` | P7-A4-01 (T067) | `../../A-4-document-start-order.md` |

> **Không** phải code sản phẩm và **không** đụng tới build WALE GUARD. Engine production vẫn **INERT**. Hai extension này chỉ **đo lường**; chúng không kích hoạt engine, không chặn quảng cáo, không sửa `registration.ts` và không đổi `WAITING_FOR_ADAPTER`.

Cả hai extension dùng chung cấu trúc: một content script `world: "ISOLATED"` + một content script `world: "MAIN"`, `matches: *://*.youtube.com/*`, `run_at: document_start`, quyền `storage`. Không có service worker, không có quyền mạng.

---

## Cài đặt (chung)

1. `chrome://extensions` → bật **Developer mode** → **Load unpacked**.
2. Chọn lần lượt thư mục `a2-storage-probe/` và `a4-start-order/` (mỗi cái là một extension).
3. Ghi lại **phiên bản Chrome** và **hệ điều hành** — bắt buộc cho cả hai thí nghiệm.
4. Sau khi chạy xong một thí nghiệm, có thể **Remove** extension đó để tránh ảnh hưởng lẫn nhau.

Gợi ý: nên chạy **A-2 trước**, gỡ ra, rồi mới chạy **A-4** — để hai bộ content script không cùng chạy trên một tab.

---

## A-2 — MAIN có đọc được `chrome.storage`?

Chạy theo `../../A-2-main-storage-access.md` §4. Đọc kết quả trong DevTools của tab YouTube (Console của **ngữ cảnh trang / MAIN world**):

```js
copy(JSON.stringify(window.__a2Probe, null, 2))
```

Đối chiếu phía ISOLATED — hai cách:

- Chọn ngữ cảnh **WALE... (extension isolated)** trong dropdown context của Console rồi đọc `window.__a2ProbeIsolated`; hoặc
- Đọc ngay từ MAIN (DOM dùng chung): `document.documentElement.dataset.a2IsolatedProbe`.

Cần ghi:

- `records[].typeofChrome`, `records[].typeofChromeStorage`, `records[].storageSyncGet` (mỗi lần tải lại).
- Bản ghi thứ hai (`label: "spa_navigate"`) khi chuyển video bằng SPA.
- Giá trị ISOLATED đã ghi (`a2Marker`) và `wroteMarker`.

Chạy tối thiểu 3 lần điều hướng mới + 1 lần SPA, điền bảng §5 và kết luận §7 của doc A-2.

> Không tự phán verdict. Chỉ ghi VERIFIED khi đủ điều kiện ở §5; nếu khác nhau giữa các lần → `INCONSISTENT`.

---

## A-4 — Thứ tự chạy MAIN / ISOLATED ở `document_start`

Chạy theo `../../A-4-document-start-order.md` §4.

### Bật/tắt "snapshot"

Trong console (**ISOLATED context** của tab, hoặc service worker của extension):

```js
// CÓ snapshot:
chrome.storage.sync.set({ a4SnapshotWrite: true });
// KHÔNG snapshot:
chrome.storage.sync.remove('a4SnapshotWrite');
```

- **Có snapshot** → ISOLATED đọc xong `chrome.storage.sync` rồi ghi thuộc tính `data-yas-layers` (sự kiện `attribute_written`).
- **Không snapshot** → ISOLATED **không** ghi thuộc tính.

### Đọc kết quả

Trong Console của **ngữ cảnh trang (MAIN world)**, sau khi trang tải xong:

```js
// Toàn bộ, đã gộp cả hai world (MAIN gom bản ISOLATED qua DOM):
copy(JSON.stringify(window.__a4Log, null, 2))

// Chỉ dòng sự kiện, để đọc thứ tự nhanh:
window.__a4Log.main.concat(window.__a4Log.isolated)
  .sort((a, b) => a.t - b.t)
  .map(r => [r.t.toFixed(1), r.world, r.event, JSON.stringify(r.detail)].join('  '))
```

`window.__a4Log` có: `navType`, `main[]` (MAIN), `isolated[]` (bản gương của ISOLATED, đọc từ `document.documentElement.dataset.a4Isolated`). Bản thô phía ISOLATED nằm ở `dataset.a4Isolated` và `window.__a4LogIsolated` (trong ISOLATED context).

### Schema bản ghi

Mỗi bản ghi: `{ seq, world, event, t, readyState, navigationType, detail }`. `seq` là **cục bộ theo từng world**; sắp thứ tự chéo world bằng `t` (`performance.now()` — cùng time origin vì chung document).

Sự kiện:

| `event` | World | Ý nghĩa |
|---------|-------|---------|
| `script_start` | cả hai | đầu file script của world |
| `snapshot_available` | MAIN | thời điểm MAIN kiểm tra snapshot (`detail.present`) |
| `hook_installed_initialresponse` | MAIN | đã cài accessor `ytInitialPlayerResponse` |
| `hook_installed_fetch` | MAIN | đã cài wrapper `fetch` (passthrough) |
| `youtube_read_initial_response` | MAIN | YouTube đọc `ytInitialPlayerResponse` **lần đầu** |
| `storage_read_done` | ISOLATED | đọc xong `chrome.storage.sync` (`detail.writeSnapshot`) |
| `attribute_written` | ISOLATED | đã ghi thuộc tính snapshot lên `documentElement` |
| `spa_navigate` | MAIN | YouTube chuyển video trong-app (`yt-navigate-finish`) |
| `hook_install_failed_*`, `hook_install_skipped_*`, `attribute_write_failed`, `storage_read_failed` | — | chẩn đoán khi bước tương ứng lỗi/không áp dụng |

### Quy trình

1. ≥20 điều hướng **mới** (mở `https://www.youtube.com/watch?v=<id>` ở tab mới / hard reload).
2. ≥20 chuyển video bằng **SPA** (không tải lại trang).
3. Lặp cho cả **có snapshot** và **không snapshot**.
4. Điền bảng §5 và kết luận §7 của doc A-4.

Ghi rõ **có dùng DevTools mở hay không** — DevTools có thể làm lệch thời điểm.

---

## Ràng buộc (không được vi phạm)

- Không kích hoạt engine, không sửa `registration.ts`, không đổi `manifest.json` của WALE GUARD, giữ ba cờ MAIN ở `WAITING_FOR_ADAPTER`.
- Không trộn mã thử nghiệm vào build production.
- Instrumentation không được gọi `fetch` thật, không đổi thứ tự cài hook, không chờ đồng bộ làm lệch thời điểm sự kiện.
- Mọi kết quả PASS/FAIL chỉ ghi sau khi **thực sự chạy và quan sát**.
