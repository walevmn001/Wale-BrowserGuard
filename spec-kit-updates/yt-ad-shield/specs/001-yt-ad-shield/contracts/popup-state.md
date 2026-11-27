# Contract: Trạng thái popup và mô hình trạng thái cờ

**Trạng thái:** IMPLEMENTED. Mô hình trạng thái và cách hiển thị đã được cài trong `src/youtube/popup/yt-layers.ts` + `src/popup/popup.ts`. Adapter đang hoạt động là `DatasetAdapter` (T004 đã chốt, phương án A) nên phần reconcile đã có đường chạy thật; nhánh `WAITING_FOR_ADAPTER` giữ lại cho trường hợp chưa có snapshot hợp lệ.

## 1. Mục đích

Popup không được giả định một lựa chọn đã được áp dụng chỉ vì nó đã được lưu. Mọi trạng thái hiển thị được suy ra từ bốn giá trị tách biệt, không từ một cờ duy nhất.

## 2. Bốn giá trị tách biệt

| Giá trị | Ý nghĩa | Giá trị có thể |
|---------|---------|----------------|
| `desiredState` | Lựa chọn người dùng đã lưu trong `chrome.storage.sync` | `ON`, `OFF` |
| `effectiveState` | Trạng thái thực tế đang áp dụng trong runtime, do module báo về | `ENABLED`, `DISABLED`, `UNKNOWN` |
| `adapterState` | Trạng thái cơ chế truyền cờ | `READY`, `WAITING`, `ERROR` |
| `snapshotState` | Trạng thái snapshot cờ đã gửi sang MAIN | `AVAILABLE`, `MISSING`, `INVALID`, `STALE` |

Định nghĩa `snapshotState`:
- `AVAILABLE`: có snapshot đã được kiểm tra và đã được MAIN xác nhận.
- `MISSING`: chưa có snapshot nào.
- `INVALID`: snapshot gần nhất bị `applyRemote` từ chối.
- `STALE`: `desiredState` đã đổi sau snapshot `AVAILABLE` gần nhất và snapshot mới chưa được gửi hay xác nhận.

Định nghĩa `adapterState`:
- `READY`: adapter đã được chọn và `status().started` là true, có xác nhận hai chiều. Với `DatasetAdapter`, `READY` tương ứng trạng thái đã đăng ký (`isEngineRegistered`) và có snapshot đã ghi/đọc được.
- `WAITING`: adapter là NullAdapter hoặc chưa có snapshot hợp lệ (giữ lại cho trường hợp trang tải trước khi công tắc module bật).
- `ERROR`: adapter báo `lastError` hoặc `rejectedCount` tăng liên tục.

## 3. Trạng thái hiển thị

Các trạng thái hiển thị: `ENABLED`, `DISABLED`, `WAITING_FOR_ADAPTER`, `RECONCILING`, `ERROR`, `UNKNOWN`.

Quy tắc suy ra, thứ tự ưu tiên từ trên xuống:

| Thứ tự | Điều kiện (ba cờ MAIN) | Hiển thị |
|--------|------------------------|----------|
| 1 | `adapterState` = `ERROR` | `ERROR` |
| 2 | `adapterState` = `WAITING` (hoặc `snapshotState` = `MISSING` hoặc `INVALID`) | `WAITING_FOR_ADAPTER` |
| 3 | `snapshotState` = `STALE` | `RECONCILING` |
| 4 | `effectiveState` = `UNKNOWN` | `UNKNOWN` |
| 5 | `effectiveState` = `ENABLED` và `desiredState` = `ON` | `ENABLED` |
| 6 | `effectiveState` = `DISABLED` và `desiredState` = `OFF` | `DISABLED` |
| 7 | Còn lại (desired và effective lệch nhau sau khi đã `AVAILABLE`) | `ERROR` với lý do "không khớp" |

Ba cờ ISOLATED không dùng bảng trên. Chúng dùng `effectiveState` do module ISOLATED báo qua `status()`, và hiển thị `ENABLED`, `DISABLED`, `UNKNOWN`, `ERROR`.

## 4. Nội dung hiển thị bắt buộc

Mỗi trạng thái có nội dung tối thiểu sau. Văn bản cuối cùng có thể điều chỉnh nhưng không được đổi nghĩa.

| Trạng thái | Nhãn | Thông điệp bắt buộc |
|------------|------|---------------------|
| `WAITING_FOR_ADAPTER` | Chờ adapter | "Hook đang chạy theo mặc định: bật. Cơ chế truyền cờ chưa hoàn tất, nên lựa chọn tắt/bật của bạn chưa được áp dụng." |
| `RECONCILING` | Đang áp dụng | "Đã gửi cấu hình mới sang trang. Đang chờ xác nhận." |
| `ENABLED` | Đang bật | "Đang hoạt động trong trang." |
| `DISABLED` | Đã tắt | "Đã tắt trong trang." |
| `ERROR` | Lỗi | "Không áp dụng được. Lý do: {reason}." |
| `UNKNOWN` | Chưa rõ | "Chưa nhận được xác nhận từ trang. Tải lại trang YouTube để kiểm tra." |

Nội dung **không được** dùng các cụm sau cho ba cờ MAIN khi trạng thái là `WAITING_FOR_ADAPTER`: "đã tắt", "đã cập nhật", "thành công", "đã áp dụng".

## 5. Hành vi khi người dùng thao tác

### 5.1 Ba cờ MAIN khi `WAITING_FOR_ADAPTER`

- Công tắc vẫn cho thao tác để lưu `desiredState`. Không khóa hoàn toàn, vì lưu lựa chọn là an toàn và giúp reconcile sau này.
- Ngay sau thao tác, hiển thị thông báo: "Đã lưu lựa chọn. Lựa chọn này chưa được áp dụng vì cơ chế truyền cờ chưa hoàn tất."
- Không hiển thị dấu tích xanh, không hiển thị "thành công".
- Công tắc hiển thị vị trí theo `desiredState` nhưng có nhãn phụ "(đã lưu, chưa áp dụng)" nếu `desiredState` khác hiệu lực mặc định (bật).
- Hiệu lực vẫn là BẬT. Thông điệp phải nói rõ điều này.

### 5.2 Khi adapter chuyển sang `READY`

- Popup chuyển sang `RECONCILING`.
- Gửi snapshot từ `desiredState`.
- Chờ xác nhận `effectiveState` từ MAIN, trong thời gian `RECONCILE_TIMEOUT_MS` (đề xuất, UNVERIFIED).
- Khi có xác nhận khớp: hiển thị `ENABLED` hoặc `DISABLED`.
- Khi hết thời gian mà không có xác nhận: hiển thị `UNKNOWN`, không hiển thị thành công.
- Khi xác nhận không khớp: hiển thị `ERROR` với lý do "không khớp".

### 5.3 Thao tác khi `adapterState` = `ERROR`

- Công tắc cho lưu `desiredState` như mục 5.1.
- Thông báo: "Không áp dụng được. Lý do: {reason}." Lý do lấy từ `adapter.status().lastError`.

### 5.4 Ba cờ ISOLATED

- Thao tác áp dụng qua `chrome.storage.sync` và được module ISOLATED đọc lại.
- Hiển thị trạng thái theo `effectiveState` do module báo về sau khi đổi.
- Nếu module chưa báo về trong thời gian chờ ngắn, hiển thị `UNKNOWN`, không hiển thị `ENABLED` hay `DISABLED` theo `desiredState`.

## 6. Ghi nhận trạng thái thật

- Popup không đọc `desiredState` để hiển thị "đang bật" hay "đang tắt". Phải đọc `effectiveState` hoặc suy ra từ bảng mục 3.
- Mỗi thay đổi lưu chỉ là thay đổi `desiredState`. Không có thay đổi nào được gọi là "đã áp dụng" trước khi `effectiveState` xác nhận.

## 7. Acceptance

- Khi `snapshotState` = `MISSING`, ba cờ MAIN hiển thị `WAITING_FOR_ADAPTER` dù `desiredState` là gì.
- Không có thông báo thành công cho ba cờ MAIN khi `adapterState` là `WAITING` hay `ERROR`.
- Khi `desiredState` = OFF và `adapterState` = `WAITING`, popup không hiển thị "Đã tắt".
- Khi adapter chuyển sang READY và xác nhận khớp, popup hiển thị trạng thái thực tế và không dùng thông báo cũ.
- Mọi trạng thái trong mục 3 có ít nhất một test (unit cho bảng suy ra, integration thủ công cho hiển thị).
- Trạng thái: IMPLEMENTED (unit). Phần hiển thị trên popup thật chờ Phase 7.

## 8. Phụ thuộc

- Bảng suy ra (mục 3) và các acceptance mục 7 không phụ thuộc T004: vẫn có thể kiểm thử bằng `adapter-null` và adapter giả.
- Reconcile thực tế (mục 5.2): T004 **đã chốt** (phương án A), `DatasetAdapter` đã có đường chạy; phần xác minh trên Chrome thật thuộc Phase 7.
