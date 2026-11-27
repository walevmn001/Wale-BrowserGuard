# Danh sách tác vụ: YT Ad Shield

**Đặc tả:** `spec.md` | **Kế hoạch:** `plan.md`

Quy ước: `[P]` nghĩa là có thể làm song song với tác vụ khác cùng nhóm. Mỗi tác vụ ghi rõ FR hoặc US liên quan.

## Giai đoạn 1: Khung dự án

- [ ] T001 Tạo cấu trúc thư mục theo mục 2 của `plan.md`.
- [ ] T002 [P] Viết `manifest.json` MV3 với hai mục content script (MAIN và isolated), `declarativeNetRequest`, `storage`, host `*://*.youtube.com/*`. (FR-001, FR-008)
- [ ] T003 [P] Viết `src/config/selectors.js` với mọi giá trị trong mục 10 của `plan.md`, đánh dấu `// UNVERIFIED`. (FR-016)
- [ ] T004 [OPEN, không chặn] Chốt cơ chế truyền cờ MAIN/ISOLATED: xem `contracts/adapter.md` mục 6. Chỉ được chốt sau khi có bằng chứng thử nghiệm (A-4, A-5). Các tác vụ T056 đến T060 không phụ thuộc T004.

## Giai đoạn 2: Lớp lọc dữ liệu

- [ ] T005 Viết `src/lib/prune.js` là hàm thuần, có `maxDepth` và `maxNodes`, trả về số khóa đã xóa. (FR-004)
- [ ] T006 [P] Viết `test/prune.test.js` bằng Node để kiểm tra: xóa khóa ở nhiều độ sâu, dừng khi vượt giới hạn, không lỗi với `null`, số, chuỗi, mảng lồng nhau. (FR-004)
- [ ] T007 Viết `src/main/initial-response.js` với accessor `ytInitialPlayerResponse` và setter gọi `prune`. (FR-002)
- [ ] T008 Viết `src/main/fetch-filter.js` bọc `window.fetch`, chỉ xử lý URL khớp `AD_ENDPOINT`, giữ status/statusText/headers, xóa `content-length`, trả response gốc khi lỗi. (FR-003, FR-005, FR-006)
- [ ] T009 Thêm kiểm tra kích thước response trong `fetch-filter.js` theo `MAX_RESPONSE_BYTES`. (mục 5.3 của `plan.md`)

## Giai đoạn 3: Lớp chặn request

- [ ] T010 Viết `rules/ads.json` với các domain và đường dẫn trong FR-008, mỗi rule có `id` duy nhất. (FR-008, US-2)
- [ ] T011 [P] Kiểm tra `rules/ads.json` bằng script Node: id không trùng, mọi rule có `action.type = block`. (FR-008)

## Giai đoạn 4: Lớp runtime

- [ ] T012 Viết `src/isolated/runtime-guard.js`: interval 300 ms, phát hiện `ad-showing` hoặc `ad-interrupting`, tắt tiếng, tua khi `duration` hữu hạn, bật lại tiếng chỉ khi `mutedByUs`. (FR-009, FR-010, FR-012, US-3)
- [ ] T013 Thêm bấm nút bỏ qua và đóng quảng cáo, chỉ khi `offsetParent !== null`. (FR-011)
- [ ] T014 Xử lý trường hợp `duration` là NaN, Infinity hoặc 0 (chỉ tắt tiếng), và lấy lại tham chiếu video mỗi tick. (mục 7.2 của `plan.md`)

## Giai đoạn 5: Lớp CSS

- [ ] T015 Viết `src/isolated/cosmetic.js` chèn CSS từ `HIDE_SELECTORS` sớm nhất, chèn một lần. (FR-013, US-4)

## Giai đoạn 6: Cấu hình và popup

- [x] T016a Viết `src/isolated/settings.js` đọc `chrome.storage.sync` và cung cấp cờ cho module ISOLATED. Không phụ thuộc T004. (FR-014, FR-015) → `src/youtube/isolated/settings.ts` (`YouTubeEngineSettings`), test `engine-settings.test.ts`.
- [ ] T016b [BLOCKED bởi T004] Gửi snapshot cờ MAIN qua adapter đã chọn. Chỉ làm sau khi T004 chốt. (contracts/adapter.md)
- [x] T017 [P] Viết `src/popup/popup.html`, `popup.css`, `popup.js` với công tắc bật/tắt từng lớp và ghi chú "có hiệu lực sau khi tải lại trang". (FR-014, US-5) → tích hợp vào popup TS hiện có (`src/popup/index.html`, `yt-layers.ts`, `render.ts`, `popup.ts`), nhãn `ppYtReloadNote`.
- [x] T018 Kiểm tra FR-015: khi cờ một lớp tắt, không đăng ký hook, không chèn CSS, không tạo interval. (FR-015) → các module runtime tự-gate theo cờ (`main/runtime-modules.ts`, test `runtime-modules.test.ts`).

## Giai đoạn 7: Log, README và bàn giao

- [ ] T019 Thêm hàm log debug dùng cờ `DEBUG`, bắt mọi lỗi trong content script. (FR-017)
- [ ] T020 Viết `README.md`: cách cài, cách kiểm tra từng bước, quyết định về cờ MAIN/isolated, danh sách mục chưa xác minh, và kết quả kiểm tra thực tế (để trống nếu chưa kiểm tra). (Nguyên tắc VII)
- [ ] T021 Kiểm tra thủ công theo US-1 đến US-5 trên video có quảng cáo trước và video có quảng cáo giữa chừng. Ghi kết quả vào README. (Mục 10 của `spec.md`)
- [ ] T022 Đóng gói thư mục extension thành zip và kiểm tra Chrome nạp được qua "Load unpacked". Ghi kết quả vào README.

## Ghi chú thực hiện

- Các giá trị trong `selectors.js` chưa được xác minh trên YouTube thực tế. Trước khi coi tác vụ T003 là xong, cần kiểm tra từng selector và khóa JSON trong DevTools.
- Không đánh dấu hoàn thành T021 nếu chưa chạy thật trong trình duyệt.

---

## Giai đoạn 8 (v2): Đặc tả và chuẩn bị triển khai

Tất cả các tác vụ dưới đây ở trạng thái chưa thực hiện. Đây là danh sách việc cần làm, không phải kết quả.

- [ ] T023 Thêm `window.__yasHooks` có kiểm tra chống cài trùng. Phần giao tiếp không viết ở đây, vì nằm trong adapter và bị chặn bởi T004. (FR-019)
- [ ] T024 Viết hàm phân loại response `classifyResponse` trả về `AD_RELATED`, `PLAYBACK_CRITICAL`, `UNRELATED`, `UNKNOWN`. Bảo vệ `streamingData`, `videoDetails`, `captions`, `playabilityStatus`, `playerConfig` ở mọi độ sâu. (FR-020)
- [ ] T025 Viết lại `fetch-filter.js` theo mục 11.4: loại trừ status và type đặc biệt, đọc body một lần, trả response gốc khi lỗi. (FR-021)
- [ ] T026 Viết `xhr-filter.js` bọc `open` và `send`, chỉ xử lý endpoint quảng cáo, không đổi `readyState` hay `status`. (FR-018)
- [ ] T027 Viết Ad State Machine theo bảng chuyển đổi mục 11.5 của spec, với timeout và cờ không lặp thao tác. (FR-022)
- [ ] T028 Viết Ad Detector đa tín hiệu với `CONFIRM_TICKS` và phân loại `playbackPhase`. (FR-023)
- [ ] T029 Viết Audio State Manager với snapshot, `volumechange` và cờ `ourChange`. (FR-024)
- [ ] T030 Viết Ad Action Controller: điều kiện click đủ, cooldown, seek một lần mỗi quảng cáo, khóa `actionInFlight`. (FR-025)
- [ ] T031 Viết Playback Watchdog: lấy mẫu, ngưỡng stall, listener không trùng, không tự seek. (FR-026)
- [ ] T032 Viết Playback Recovery với bốn cấp, giới hạn số lần và cooldown, ghi nguyên nhân. (FR-027, FR-036)
- [ ] T033 Viết SPA Navigation Manager: debounce, kiểm tra tham chiếu player, reset state, kiểm tra hook. (FR-028)
- [ ] T034 Viết DOM Observer với `attributeFilter`, debounce, disconnect khi cần. (FR-029)
- [ ] T035 Viết Lifecycle Manager với `register`, `cleanupAll`, `reinit` có giới hạn, chống khởi tạo trùng. (FR-030)
- [ ] T036 Bọc mọi module bằng `runModule` với error boundary và ngưỡng vô hiệu hóa. (FR-031)
- [ ] T037 Tổ chức lại `rules/ads.json` theo nhóm, thêm kiểm tra xung đột và không chặn `googlevideo.com`. (FR-032)
- [ ] T038 Viết Debug Logger với ring buffer, lọc theo module, không ghi body. (FR-033)
- [ ] T039 Viết unit test R01 đến R18 bằng Node (đồng hồ giả, fixture). (FR-034)
- [ ] T040 Viết checklist thủ công cho integration và kiểm thử bảo toàn playback, gồm A/B bật và tắt extension. (FR-035)
- [ ] T041 Ghi kết quả từng ca vào `status.md`. Không đánh dấu PASS khi chưa chạy.

## Ghi chú v2

- Các ngưỡng số (CONFIRM_TICKS, STALL_THRESHOLD_MS, RECOVERY_*, CLICK_COOLDOWN_MS, v.v.) đều là giá trị đề xuất, chưa đo.
- Mục 11.5 của `plan.md` liệt kê các điểm phải xác minh trước khi viết code.

---

## Giai đoạn 9 (v3): Bảo trì và cập nhật lâu dài

Trạng thái: tất cả chưa thực hiện.

- [ ] T042 Tạo cây thư mục v3 theo `plan.md` mục 12.1, gồm `config/`, `registry/`, `core/`, `data/`, `docs/`, `test/`. (FR-039)
- [ ] T043 Viết `src/config/security.js`, `performance.js`, `behavior.js`, `features.js` với mỗi giá trị có tên, kiểu, mặc định, khoảng, mức xác minh, lý do. (FR-040, FR-043)
- [ ] T044 Viết `src/config/schema.js` với `CONFIG_SCHEMA_VERSION`, `migrateConfig` thuần, và xử lý khóa không nhận ra. (FR-042)
- [ ] T045 Viết `src/registry/selectors.js`, `endpoints.js`, `rules.js` với `REGISTRY_VERSION`, mỗi mục có `purpose`, `verification`, `lastVerified`, `fallback`. (FR-041)
- [ ] T046 Viết `scripts/build-rules.js` sinh `rules/ads.json` từ `rules.js`, và test kiểm tra hai bên khớp. (FR-045)
- [ ] T047 Viết `scripts/lint-deps.js` kiểm tra circular dependency, số ma thuật ngoài `src/config/`, URL ngoài `src/registry/`. (FR-044)
- [ ] T048 Viết `src/core/namespace.js` và `module-runner.js` (error boundary, đếm lỗi, ngưỡng vô hiệu hóa), áp dụng interface mục 12.3. (FR-039, FR-031)
- [ ] T049 Viết kiểm tra API và DOM trước khi cài cho từng hook và module, ghi `UNSUPPORTED` hoặc `NO_SAFE_ACTION`. (mục 12.6)
- [ ] T050 Thêm danh sách `fallback` cho từng selector, kiểm tra fallback không rộng hơn selector chính bằng test. (FR-046)
- [ ] T051 Viết `test/baseline/` và script so sánh kết quả với baseline, phát hiện regression mới. (FR-044)
- [ ] T052 Tạo bảy file tài liệu trong `docs/` theo mục 12.10 với mục bắt buộc, và test FR-047 kiểm tra chúng. (FR-047)
- [ ] T053 Thiết lập quy trình Git checkpoint, tag `vX.Y.Z`, và mẫu mục changelog. Ghi quy trình rollback vào `docs/CHANGELOG.md`. (FR-045, FR-046)
- [ ] T054 Thêm migration cấu hình có test cho mỗi bước, gồm trường hợp `configSchemaVersion` cao hơn phiên bản hiểu được. (FR-042)
- [ ] T055 Rà soát toàn bộ tài liệu và spec để không còn số ma thuật, URL hay selector ngoài registry. (mục 12.11)

Ghi chú: các tác vụ T042 đến T055 chỉ là kế hoạch. Chưa có code nào được viết trong giai đoạn đặc tả này.


## Giai đoạn 10 (v4): Feature flag và adapter, không chặn bởi T004

Trạng thái: chưa thực hiện.

### Không phụ thuộc T004 (làm được ngay)
- [ ] T056 Viết `src/core/feature-flags.js` theo `contracts/feature-flags.md`: get, applyRemote, snapshot, subscribe, dispose. Hàm thuần.
- [ ] T057 Viết `src/adapters/adapter-null.js` theo `contracts/adapter.md` mục 5. Đây là adapter hợp lệ, không phải cơ chế truyền.
- [ ] T058 Viết bộ contract test chung cho adapter (mục 7 của `adapter.md`) với adapter giả. Chạy bằng Node. Đây là kiểm thử không cần trình duyệt.
- [ ] T059 Viết unit test cho `feature-flags.js`: mặc định, snapshot sai, khóa lạ, sai kiểu, subscribe không gọi khi không đổi.
- [ ] T060 Viết test cho registry và module MAIN dùng `adapter-null` và adapter giả, không cần T004.

### Phụ thuộc T004 (chỉ làm sau khi chốt)
- [ ] T061 [BLOCKED T004] Chọn một cơ chế trong ba lựa chọn của `adapter.md` mục 6, ghi quyết định và bằng chứng vào `docs/ARCHITECTURE.md`.
- [ ] T062 [BLOCKED T004] Viết adapter cụ thể. Chỉ thay file adapter và file integration test của nó.
- [ ] T063 [BLOCKED T004] Chạy contract test chung (7 mục) với adapter thật. Ghi kết quả vào `docs/TESTING.md`.
- [ ] T064 [BLOCKED T004] Đo thứ tự chạy giữa hai world (A-4) và ghi kết quả.
- [ ] T065 [BLOCKED T004] Cập nhật popup hiển thị "chờ adapter" cho ba cờ MAIN (D-2).

Ghi chú: sau khi T004 chốt, chỉ được thay đổi T061 đến T065 và adapter. Không được sửa registry, config schema, FeatureFlags hay module logic.


## Giai đoạn 11 (v5): Giả định chưa xác minh và trạng thái popup, không chặn registry

Trạng thái: T068–T072 hoàn tất (Phase 6); T066–T067 chờ Chrome thật; T073–T074 chờ T004. Các tác vụ trong giai đoạn này không chặn T056 đến T060.

### Không phụ thuộc T004
- [ ] T066 Viết extension thử nghiệm A-2 theo `verification/A-2-main-storage-access.md` mục 3. Chạy trên Chrome mục tiêu, ghi kết quả vào mục 5 và mục 7 của file đó.
- [ ] T067 Viết instrumentation A-4 theo `verification/A-4-document-start-order.md` mục 3. Chạy điều hướng mới ≥20 lần và SPA ≥20 lần, có và không có snapshot.
- [x] T068 Viết mô hình trạng thái trong `src/core/popup-state.js` (hàm thuần): nhận `{desiredState, effectiveState, adapterState, snapshotState}`, trả về trạng thái hiển thị theo bảng `popup-state.md` mục 3. → `src/youtube/state/toggle-state.ts` (`resolveDisplay`).
- [x] T069 Unit test cho T068: mọi tổ hợp quan trọng, đặc biệt `WAITING` với `desired=OFF` không được trả `DISABLED`. → `toggle-state.test.ts`, `popup-yt-layers.test.ts`.
- [x] T070 Viết chuỗi thông điệp theo `popup-state.md` mục 4 trong một file riêng. Test không chứa các cụm cấm cho ba cờ MAIN khi `WAITING_FOR_ADAPTER` ("đã tắt", "đã cập nhật", "thành công", "đã áp dụng"). → `src/youtube/state/messages.ts`, test `messages.test.ts`.
- [x] T071 Cập nhật popup (HTML/JS) hiển thị trạng thái và thông báo theo T068 và T070, với ba cờ MAIN ở `WAITING_FOR_ADAPTER` khi `adapterState` là WAITING. → `src/popup/{render,elements,popup}.ts`, `popup/yt-layers.ts`, `popup/index.html`.
- [x] T072 Viết `README.md` đúng nội dung mục "Hành vi chờ adapter" và đồng bộ bốn mệnh đề trong `adapter.md` mục 11 (test so sánh chuỗi hoặc checklist thủ công). → `README.md` mục "Hành vi chờ adapter" đã có.

### Phụ thuộc T004
- [ ] T073 [BLOCKED T004] Reconcile khi adapter READY: triển khai `RECONCILING` và xác nhận `effectiveState` theo `popup-state.md` mục 5.2, với `RECONCILE_TIMEOUT_MS`.
- [ ] T074 [BLOCKED T004] Sau khi chọn cơ chế, chạy lại A-2 và A-4 trên adapter thật. Ghi kết quả. Cập nhật trạng thái trong `status.md`.

Ghi chú: T066 và T067 phải chạy trên Chrome thật. Chưa có kết quả nào trong đặc tả này. Không đánh VERIFIED dựa trên tài liệu.
