# Trạng thái và báo cáo cập nhật Speckit: YT Ad Shield

**Phiên bản đặc tả:** v2
**Trạng thái định nghĩa:** SPECIFIED, IMPLEMENTED, TESTED, VERIFIED

## 1. Bằng chứng hiện có

Không có hạng mục nào ở trạng thái IMPLEMENTED, TESTED hoặc VERIFIED. Không có source code, không có test đã chạy, không có kiểm thử trên YouTube thật. Mọi hạng mục dưới đây đều là SPECIFIED.

## 2. Sáu thuật toán ban đầu (giữ nguyên, không xóa)

| # | Thuật toán | FR liên quan | Trạng thái | Ghi chú |
|---|-----------|--------------|------------|---------|
| 1 | Lọc JSON (prune) | FR-004, FR-005 | SPECIFIED | Đã có. Bổ sung bảo vệ khóa playback ở FR-020 |
| 2 | Hook ytInitialPlayerResponse | FR-002 | SPECIFIED | Đã có. Bổ sung chống cài trùng ở FR-019 |
| 3 | Hook fetch | FR-003, FR-006 | SPECIFIED | Đã có. Viết lại theo FR-021 |
| 4 | Chặn request (DNR) | FR-008 | SPECIFIED | Đã có. Bổ sung nhóm, rollback, chống chặn nhầm ở FR-032 |
| 5 | Runtime guard | FR-009 đến FR-012 | SPECIFIED | Đã có. Tách thành nhiều module ở v2 |
| 6 | CSS hider | FR-013 | SPECIFIED | Đã có, không thay đổi |

## 3. Hạng mục v2 (18 hạng mục từ đặc tả bổ sung)

| Mục | Hạng mục | Trạng thái nội dung trước v2 | Hành động v2 | FR mới | Trạng thái |
|-----|----------|------------------------------|--------------|--------|-----------|
| 7 | Hook XHR | Không có | Thêm mới | FR-018 | SPECIFIED |
| 8 | Hook Main World sớm | Một phần (FR-001, FR-002) | Bổ sung chống trùng, giao tiếp có kiểm tra | FR-019 | SPECIFIED |
| 9 | Phân loại response | Không có | Thêm mới, có danh sách khóa bảo vệ | FR-020 | SPECIFIED |
| 10 | Bảo toàn Response API | Một phần (FR-006) | Mở rộng loại trừ status và type | FR-021 | SPECIFIED |
| 11 | Ad State Machine | Không có | Thêm mới, có bảng chuyển đổi | FR-022 | SPECIFIED |
| 12 | Phát hiện đa tín hiệu | Một phần (class ad-showing) | Mở rộng, thêm phân loại buffering | FR-023 | SPECIFIED |
| 13 | Quyền sở hữu âm thanh | Một phần (FR-012) | Mở rộng snapshot và cờ ourChange | FR-024 | SPECIFIED |
| 14 | Skip an toàn | Một phần (FR-011) | Mở rộng điều kiện, cooldown, seek một lần | FR-025 | SPECIFIED |
| 15 | Playback Watchdog | Không có | Thêm mới | FR-026 | SPECIFIED |
| 16 | Playback Recovery | Không có | Thêm mới, bốn cấp | FR-027 | SPECIFIED |
| 17 | SPA Navigation | Một phần (mục biên) | Thêm sự kiện và quy trình reset | FR-028 | SPECIFIED |
| 18 | MutationObserver | Không có | Thêm mới, có debounce và disconnect | FR-029 | SPECIFIED |
| 19 | Lifecycle Manager | Không có | Thêm mới | FR-030 | SPECIFIED |
| 20 | Fail-open toàn hệ thống | Một phần (FR-005, constitution III) | Thêm error boundary và ngưỡng vô hiệu hóa | FR-031 | SPECIFIED |
| 21 | DNR an toàn | Một phần (FR-008) | Mở rộng nhóm, rollback, test chặn nhầm | FR-032 | SPECIFIED |
| 22 | Debug Logger | Một phần (FR-017, cờ DEBUG) | Mở rộng nội dung, ring buffer | FR-033 | SPECIFIED |
| 23 | Regression tests | Không có | Thêm 18 ca R01 đến R18 | FR-034 | SPECIFIED |
| 24 | Kiểm thử bảo toàn playback | Không có | Thêm A/B checklist | FR-035 | SPECIFIED |
| + | Chẩn đoán màn hình đen | Không có | Thêm bảng tín hiệu và nguyên nhân | FR-036 | SPECIFIED |
| + | Kiến trúc và quyền module | Một phần (plan.md mục 2) | Thêm bảng 17 module và quy tắc | FR-037 | SPECIFIED |
| + | Nguyên tắc bảo toàn playback | Không có | Thêm | FR-038 | SPECIFIED |

## 4. Nội dung đã tồn tại và được giữ lại

- Toàn bộ FR-001 đến FR-017, US-1 đến US-5, mục 6 đến 10 của `spec.md` v1.
- Toàn bộ cấu trúc thư mục và thiết kế manifest trong `plan.md` mục 1 đến 10.
- Toàn bộ `constitution.md` mục I đến VII.
- Các tác vụ T001 đến T022 trong `tasks.md`.

## 5. Nội dung đã điều chỉnh

| Vị trí | Trước | Sau | Lý do |
|--------|-------|-----|-------|
| FR-010 | Tua tới cuối khi `duration` hợp lệ | Tua tối đa một lần mỗi quảng cáo, khi đã xác nhận và an toàn | Mục 14: không seek liên tục, không seek khi không có quảng cáo |
| US-3 | Tua tới cuối trong 2 giây | Tua tối đa một lần, có điều kiện | Tương tự FR-010 |
| Trạng thái spec | Bản nháp | Bản nháp v2 | Cập nhật phiên bản |
| Constitution | I đến VII | Thêm VIII (bảo toàn playback), IX (trạng thái có bằng chứng), X (quyền module) | Yêu cầu mục 1 và 5 |
| plan.md mục 4 | Chưa quyết định cờ MAIN/isolated | Giữ nguyên là câu hỏi mở | Chưa có bằng chứng để chọn |

## 6. Nội dung mâu thuẫn hoặc cần lưu ý

- FR-011 v1 chỉ kiểm tra `offsetParent`. FR-025 v2 bổ sung nhiều điều kiện hơn. Đây là mở rộng, không mâu thuẫn.
- Quyết định cờ MAIN/isolated (T004) vẫn chưa chốt và ảnh hưởng đến FR-019.
- Plan v1 mục 7.1 cho phép tắt tiếng khi quảng cáo mà không theo dõi snapshot. FR-024 v2 thay thế bằng snapshot. Đây là điều chỉnh có chủ đích.

## 7. Các vấn đề chưa thể xác minh

- Tên khóa quảng cáo, đường dẫn trong JSON, endpoint thực sự là quảng cáo.
- Sự kiện `yt-navigate-finish` và `yt-page-data-updated`.
- Selector ad module, nút skip, và thuộc tính player liên quan quảng cáo.
- Ngưỡng số: mọi giá trị trong spec v2 là đề xuất, chưa đo.
- Giới hạn số rule DNR trên Chrome mục tiêu.
- Hành vi `world: "MAIN"` và thứ tự chạy với YouTube trên phiên bản Chrome thực tế.
- Hành vi chặn request video khi rule mới được áp dụng (FR-032).

## 8. Giới hạn kỹ thuật của Chrome MV3 cần ghi nhớ

- MAIN world không đọc được `chrome.storage`, phải đi qua `dataset` hoặc `postMessage`.
- Không có service worker chạy liên tục trong thiết kế này, trạng thái mất khi đóng tab.
- DNR chặn theo mẫu URL, không đọc được nội dung response. Chặn theo nội dung phải dùng hook JS.
- Không có `webRequest` blocking trong bản này.

## 9. Bước tiếp theo đề xuất

1. Chốt T004 (cờ MAIN/isolated).
2. Kiểm tra các điểm mục 11.5 trong `plan.md` trên YouTube thật, ghi kết quả vào mục 7 ở trên.
3. Triển khai theo giai đoạn 8 của `tasks.md` (T023 đến T041), cập nhật trạng thái sau từng bước có bằng chứng.

---

## 10. Cập nhật v3: bảo trì và cập nhật lâu dài

**Trạng thái định nghĩa:** SPECIFIED. Không có hạng mục nào IMPLEMENTED, TESTED hay VERIFIED.

| Mục | Hạng mục | FR | Trạng thái | Ghi chú |
|-----|----------|----|-----------|---------|
| 1 | Modular architecture | FR-039 | SPECIFIED | Interface module ở plan mục 12.3 |
| 2 | Cấu hình tập trung | FR-040 | SPECIFIED | Ba nhóm: bảo mật, hiệu năng, hành vi |
| 3 | Selector, endpoint, rule registry | FR-041 | SPECIFIED | `selectors.js`, `endpoints.js`, `rules.js` |
| 4 | Versioning và compatibility | FR-042 | SPECIFIED | Version extension, schema, registry; migration |
| 5 | Feature flags | FR-043 | SPECIFIED | Cờ theo module, ba nguồn ưu tiên |
| 6 | Compatibility và fallback | FR-046 | SPECIFIED | Kiểm tra API và DOM trước khi cài |
| 7 | Regression và compatibility test | FR-044 | SPECIFIED | Thứ tự 8 bước, baseline |
| 8 | Update và rollback | FR-045 | SPECIFIED | Changelog, Git checkpoint, tag |
| 9 | Documentation | FR-047 | SPECIFIED | Tám file trong `docs/` đã có khung |
| 10 | Maintenance principle | mục 12.5 | SPECIFIED | Quy trình 7 bước |

**Điều chỉnh so với yêu cầu gốc:**

- `rules.js` là nguồn, `rules/ads.json` là bản sinh (xem spec mục 12.9). Lý do: Chrome đọc DNR rule từ JSON tĩnh.
- Registry dùng script cổ điển, không dùng ES module, vì content script nạp theo thứ tự trong manifest.

**Không mở rộng phạm vi chặn:** mọi endpoint và selector trong `docs/` đều ghi `UNVERIFIED`, không có mục nào được dùng để mở rộng DNR.

**Mâu thuẫn còn lại:**

- Câu hỏi mở T004 (cờ MAIN/isolated) vẫn chưa chốt. Với cấu trúc v3, registry nạp vào cả hai world, nên T004 chỉ còn ảnh hưởng đến cách truyền cờ bật/tắt, không ảnh hưởng đến registry.

**Thiếu sót đã biết:**

- `docs/` chỉ có khung và bảng trống. Chưa có nội dung đã xác minh.
- Chưa có lint, build script, hay test nào được viết. Các tác vụ T046, T047, T051 là kế hoạch.


---

## 11. Cập nhật v4: T004 OPEN, không chặn

**Trạng thái định nghĩa:** SPECIFIED. Không có hạng mục nào IMPLEMENTED, TESTED hay VERIFIED.

| Hạng mục | Trạng thái | Phụ thuộc T004 | Ghi chú |
|----------|-----------|----------------|---------|
| FeatureFlags (world-independent) | SPECIFIED | Không | `contracts/feature-flags.md` |
| Adapter boundary | SPECIFIED | Một phần | Contract không phụ thuộc, triển khai thì có |
| NullAdapter | SPECIFIED | Không | Adapter hợp lệ khi chưa chốt cơ chế |
| Contract test chung cho adapter | SPECIFIED | Không | Bảy mục, chạy được với adapter giả |
| Registry và config | SPECIFIED | Không | Không đổi từ v3 |
| Adapter cụ thể (dataset, postMessage hoặc CustomEvent) | Chưa chọn | Có | Chỉ làm sau T004 |
| Đo thứ tự chạy giữa hai world | Chưa thực hiện | Có | A-4 |

**Giả định:**

- A-1 đến A-5 trong `contracts/adapter.md` mục 8.
- Khi chưa có snapshot, ba cờ MAIN dùng mặc định từ `features.js` (A-3). Popup không tắt được các hook này trước khi T004 chốt. Đây là hạn chế đã biết.

**Điều chỉnh so với v3:**

- T016 được tách thành T016a (không phụ thuộc) và T016b (bị chặn bởi T004).
- T023 không còn bao gồm phần giao tiếp `postMessage`, phần này chuyển vào adapter.
- T004 vẫn OPEN nhưng không còn là điều kiện cho bất kỳ tác vụ nào ngoài T061 đến T065.

**Bước tiếp theo không bị chặn:** T056 đến T060.


---

## 12. Cập nhật v5: giả định chưa xác minh và trạng thái popup

**Trạng thái định nghĩa:** SPECIFIED. Không có hạng mục nào IMPLEMENTED, TESTED hay VERIFIED.

| Hạng mục | Trạng thái | Phụ thuộc T004 | Ghi chú |
|----------|-----------|----------------|---------|
| A-2: MAIN không đọc được chrome.storage | UNVERIFIED | Không | Thủ tục ở `verification/A-2-main-storage-access.md`, chưa chạy |
| A-3: mặc định bật khi chưa có snapshot | SPECIFIED | Không | Ghi trong README, popup và `adapter.md` mục 10 |
| A-4: thứ tự chạy document_start | UNVERIFIED | Không | Thủ tục ở `verification/A-4-document-start-order.md`, chưa chạy |
| Mô hình trạng thái (desired, effective, adapter, snapshot) | SPECIFIED | Không | `contracts/popup-state.md` mục 2 |
| Trạng thái hiển thị và bảng suy ra | SPECIFIED | Không | `popup-state.md` mục 3 |
| WAITING_FOR_ADAPTER | SPECIFIED | Không | Nội dung và cấm cụm từ ở mục 4, 5.1 |
| RECONCILING | SPECIFIED | Có | Chỉ làm sau T004 |
| README hành vi chờ adapter | SPECIFIED | Không | Bản nháp đã có ở `README.md` |

**Đồng bộ tài liệu:** bốn mệnh đề trong `adapter.md` mục 11 đã được viết giống nhau ở `README.md`, `adapter.md` và `popup-state.md`.

**Điều chỉnh:**

- A-2 và A-4 được chuyển từ giả định thành UNVERIFIED có thủ tục kiểm thử cụ thể.
- Popup có thêm `RECONCILING` ngoài danh sách yêu cầu (`WAITING_FOR_ADAPTER`, `ENABLED`, `DISABLED`, `ERROR`, `UNKNOWN`). Lý do: cần trạng thái trung gian để không báo thành công trước khi MAIN xác nhận.

**Không mở rộng phạm vi:** tài liệu không chọn cơ chế truyền. T004 vẫn OPEN.
