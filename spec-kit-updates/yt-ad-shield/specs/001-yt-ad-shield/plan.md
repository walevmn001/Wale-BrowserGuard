# Kế hoạch kỹ thuật: YT Ad Shield

**Đặc tả liên quan:** `spec.md`
**Nguyên tắc:** `.specify/memory/constitution.md`

## 1. Công nghệ

| Thành phần | Lựa chọn | Lý do |
|-----------|----------|-------|
| Nền tảng | Chrome MV3 | Yêu cầu của dự án |
| Ngôn ngữ | JavaScript thuần (ES2022) | Không cần build, dễ kiểm tra |
| Chặn mạng | declarativeNetRequest (static rules) | Không cần quyền `webRequest` |
| Lưu cấu hình | chrome.storage.sync | Đồng bộ theo tài khoản Chrome, dung lượng nhỏ |
| Giao diện popup | HTML, CSS, JS thuần | Đủ cho bảng bật/tắt |

**Quyền khai báo:** `declarativeNetRequest`, `storage`, và `host_permissions` cho `*://*.youtube.com/*`. Quyền `activeTab` và `scripting` không cần. Lý do: content script đã đăng ký sẵn qua manifest.

## 2. Cấu trúc thư mục

```
yt-ad-shield/
├── manifest.json
├── README.md
├── rules/
│   └── ads.json
├── src/
│   ├── config/
│   │   └── selectors.js          # Mọi giá trị phụ thuộc phiên bản YouTube
│   ├── lib/
│   │   ├── prune.js              # Hàm thuần: xóa khóa quảng cáo khỏi JSON
│   │   └── settings.js           # Đọc chrome.storage và trả về cờ bật/tắt
│   ├── main/
│   │   ├── initial-response.js   # Hook ytInitialPlayerResponse
│   │   └── fetch-filter.js       # Hook window.fetch
│   ├── isolated/
│   │   ├── runtime-guard.js      # Theo dõi trạng thái quảng cáo
│   │   └── cosmetic.js           # Chèn CSS ẩn quảng cáo
│   └── popup/
│       ├── popup.html
│       ├── popup.css
│       └── popup.js
└── test/
    └── prune.test.js             # Kiểm tra hàm thuần bằng Node
```

## 3. Thiết kế manifest

- `background`: không cần service worker, vì không có tác vụ nền.
- `content_scripts` có hai mục:
  - Mục MAIN world: `src/main/initial-response.js` và `src/main/fetch-filter.js`, `run_at: "document_start"`.
  - Mục isolated world: `src/lib/settings.js`, `src/isolated/cosmetic.js`, `src/isolated/runtime-guard.js`, `src/config/selectors.js`, `run_at: "document_start"`.
- Lưu ý: script MAIN world không đọc được `chrome.storage` trực tiếp. Cờ bật/tắt phải được isolated world đọc và truyền vào MAIN world qua `window.postMessage` hoặc một thuộc tính trên `document.documentElement` trước khi các hook chạy.

## 4. Luồng cấu hình

1. Isolated world đọc `chrome.storage.sync` một lần khi khởi tạo.
2. Isolated world ghi cờ `layers` vào `document.documentElement.dataset.yasLayers` dưới dạng JSON.
3. Script MAIN world đọc thuộc tính này. Nếu không có, mặc định tắt cả hai lớp MAIN.

**Vấn đề thời gian:** MAIN và isolated chạy đồng thời ở `document_start`. Để tránh race, MAIN world phải đọc cờ đồng bộ từ thuộc tính. Nếu thuộc tính chưa có, mặc định là bật (fail-open theo hướng lọc). Ghi rõ lựa chọn này trong README.

Thay vào đó, một giải pháp an toàn hơn là MAIN world luôn bật, và isolated world tắt hook bằng cách gỡ bỏ function đã bọc khi cờ tắt. Chọn một trong hai và ghi quyết định vào README.

**Trạng thái:** T004 OPEN, không chặn registry và module. Ràng buộc chi tiết nằm ở `contracts/feature-flags.md` và `contracts/adapter.md`. Chỉ ảnh hưởng ba cờ MAIN (ENABLE_JSON_PRUNER, ENABLE_FETCH_HOOK, ENABLE_XHR_HOOK). Module ISOLATED đọc `chrome.storage` trực tiếp, không cần adapter.

## 5. Thiết kế lớp lọc dữ liệu

### 5.1 `src/lib/prune.js` (hàm thuần)

- Đầu vào: một giá trị JSON đã parse, tham số `maxDepth` (mặc định 10), `maxNodes` (mặc định 50000).
- Đầu ra: cùng đối tượng đã bị chỉnh sửa tại chỗ, cộng với số khóa đã xóa.
- Hành vi: duyệt bằng ngăn xếp có giới hạn, không dùng đệ quy không giới hạn.
- Không đụng `window`, DOM hay `chrome`. Có thể test bằng Node.

### 5.2 `src/main/initial-response.js`

- Định nghĩa accessor `ytInitialPlayerResponse` trên `window`.
- Setter gọi `prune` rồi lưu giá trị. Getter trả về giá trị đã lưu.
- Nếu đã tồn tại thuộc tính không configurable, ghi log debug và bỏ qua, không ném lỗi.

### 5.3 `src/main/fetch-filter.js`

- Bọc `window.fetch` với hàm mới.
- Chỉ xử lý URL khớp regex trong `selectors.js`.
- Với response có `content-type` chứa `json`, clone, parse, prune, rồi tạo `Response` mới.
- Giữ status, statusText và headers. Xóa `content-length`.
- Mọi lỗi đều trả về response gốc.

**Rủi ro đã biết:** `response.clone()` làm tăng bộ nhớ với response lớn. Giới hạn bằng cách bỏ qua response có `content-length` lớn hơn ngưỡng (ví dụ 5 MB) và ghi log debug.

## 6. Thiết kế lớp chặn request

- File `rules/ads.json` chứa các rule. Mỗi rule có `id` duy nhất, `priority`, `action: block`, `condition` với `urlFilter` và `resourceTypes`.
- Các rule dùng `||domain^` để khớp domain và tên miền con.
- Rule cho `/pagead/` và `/api/stats/ads` giới hạn `resourceTypes` để tránh chặn nhầm tài nguyên trang.
- Không dùng dynamic rules trong bản đầu.

## 7. Thiết kế lớp runtime

### 7.1 `src/isolated/runtime-guard.js`

- Dùng `setInterval` 300 ms, lưu ID để có thể dừng.
- Mỗi tick, đọc `#movie_player` và `video.html5-main-video`.
- Trạng thái quảng cáo: `classList` chứa `ad-showing` hoặc `ad-interrupting`.
- Khi vào trạng thái quảng cáo: tắt tiếng, ghi `mutedByUs = true` nếu video đang có tiếng; tua tới `duration` nếu `duration` hữu hạn và lớn hơn 0.
- Khi thoát: chỉ bật lại tiếng nếu `mutedByUs`.
- Bấm nút bỏ qua theo danh sách trong `selectors.js`, chỉ khi `offsetParent !== null`.
- Khi cờ runtime tắt, không tạo interval.

### 7.2 Xử lý trường hợp đặc biệt

- Nếu `duration` là `NaN`, `Infinity` hoặc 0: không tua, chỉ tắt tiếng.
- Nếu `video` bị thay thế (SPA chuyển trang): lấy lại tham chiếu mỗi tick, không cache.

## 8. Thiết kế lớp CSS

- Chèn `<style>` vào `document.head` hoặc `document.documentElement` nếu head chưa có.
- Danh sách selector nằm trong `selectors.js`, ghép thành chuỗi CSS khi chèn.
- Chèn một lần, không chèn lại khi SPA chuyển trang.

## 9. Popup

- Ba công tắc: lọc dữ liệu, chặn request, runtime và CSS (bốn công tắc nếu tách riêng).
- Đọc và ghi `chrome.storage.sync` với khóa `layers`.
- Hiển thị ghi chú: "Thay đổi có hiệu lực sau khi tải lại trang YouTube."
- Không có nút gửi dữ liệu, không có liên kết ngoài.

## 10. Cấu hình selector

`src/config/selectors.js` có các mục sau:

- `DEBUG`: boolean, mặc định `false`.
- `LAST_VERIFIED`: ngày kiểm tra gần nhất và phiên bản YouTube (nếu biết), mặc định `unverified`.
- `AD_KEYS`: `adPlacements`, `playerAds`, `adSlots`.
- `AD_ENDPOINT`: regex `/youtubei/v1/(player|next|browse|search)(\?|$)`.
- `SKIP_SELECTORS`, `CLOSE_SELECTORS`: danh sách selector nút bỏ qua và đóng quảng cáo.
- `HIDE_SELECTORS`: danh sách selector CSS ẩn quảng cáo.
- `PLAYER_SELECTOR`, `VIDEO_SELECTOR`, `AD_CLASSES`.
- `TICK_MS`: 300.
- `MAX_DEPTH`: 10, `MAX_NODES`: 50000, `MAX_RESPONSE_BYTES`: 5242880.

Mỗi giá trị chưa xác minh phải được đánh dấu bằng comment `// UNVERIFIED` trong file.

---

## 11. Kiến trúc v2: module, phụ thuộc và quyền

### 11.1 Danh sách module (17 module logic)

| # | Module | Vai trò | Có quyền ghi player | Phụ thuộc |
|---|--------|---------|---------------------|-----------|
| 1 | JSON Pruner | Phân loại và xóa khóa quảng cáo (FR-020) | Không | Không |
| 2 | Player Response Hook | Hook `ytInitialPlayerResponse` (FR-002) | Không | JSON Pruner |
| 3 | Fetch Interceptor | Hook `fetch` (FR-003) | Không | JSON Pruner, Response API helper |
| 4 | XHR Interceptor | Hook XHR (FR-018) | Không | JSON Pruner |
| 5 | DNR Manager | Quản lý rule chặn, rollback (FR-032) | Không (chỉ trình duyệt) | Lifecycle Manager |
| 6 | Ad Detector | Phát hiện đa tín hiệu (FR-023) | Không | Đọc DOM và player |
| 7 | Ad State Machine | Trạng thái quảng cáo (FR-022) | Không trực tiếp | Ad Detector, Playback Watchdog |
| 8 | Ad Action Controller | Thực thi mute, seek, click (FR-025) | Có (độc quyền) | Ad State Machine, Audio State Manager |
| 9 | Audio State Manager | Quyền sở hữu âm thanh (FR-024) | Có, chỉ qua Action Controller | Không |
| 10 | Playback Watchdog | Theo dõi tiến triển video (FR-026) | Không | Không |
| 11 | Playback Recovery | Chẩn đoán và recovery (FR-027) | Chỉ gửi lệnh qua Action Controller | Watchdog, State Machine |
| 12 | DOM Observer | MutationObserver có debounce (FR-029) | Không | Không |
| 13 | SPA Navigation Manager | Xử lý chuyển video (FR-028) | Không | Lifecycle Manager |
| 14 | Lifecycle Manager | Đăng ký và dọn tài nguyên (FR-030) | Không | Không |
| 15 | CSS Hider | Chèn CSS ẩn quảng cáo (FR-013) | Không | Không |
| 16 | Debug Logger | Ghi log có giới hạn (FR-033) | Không | Không |
| 17 | Test Framework | Test Node và checklist thủ công (FR-034, FR-035) | Không | Không |

Đây là phân chia logic. Không bắt buộc tạo 17 file. Cấu trúc file trong mục 2 vẫn là điểm bắt đầu, các module có thể gộp trong cùng file nếu giữ được ranh giới quyền ở trên.

### 11.2 Quy tắc giao tiếp

- Module đọc gửi sự kiện (ví dụ `AD_SIGNAL`, `PLAYER_REPLACED`, `STALL_DETECTED`) đến Ad State Machine qua một hàm `dispatch` nội bộ. Không dùng `window` để phát sự kiện giữa các module trong cùng world.
- Giữa MAIN world và isolated world chỉ dùng `window.postMessage` có kiểm tra cấu trúc (FR-019).
- Khi hai module cùng phát hiện một sự kiện (ví dụ cả Ad Detector và Watchdog cùng báo), Ad State Machine xử lý theo thứ tự đến, và chỉ một chuyển đổi được áp dụng cho mỗi tick. Sự kiện trùng trong cùng tick bị gộp.
- Không module nào gọi trực tiếp hành động lên video. Mọi lệnh đi qua Ad Action Controller, có khóa `actionInFlight` để không hai thao tác cùng lúc.

### 11.3 Cleanup và phục hồi

- Lifecycle Manager giữ danh sách disposer. Thứ tự dọn: listener, observer, interval, timeout, rồi hook state (chỉ đánh dấu disabled, không gỡ hook).
- Khi module bị vô hiệu hóa, Audio State Manager khôi phục âm thanh nếu `mutedByUs`.
- Khi chuyển video, state machine về IDLE và đăng ký lại listener cho video mới.

### 11.4 Phụ thuộc Chrome và giới hạn MV3

- MAIN world chạy trong ngữ cảnh trang, không đọc được `chrome.*`. Mọi cấu hình đi qua `dataset` hoặc `postMessage`.
- `declarativeNetRequest` là cơ chế chặn duy nhất ở tầng mạng; không có quyền `webRequest` blocking trong bản này.
- Service worker không có trong thiết kế; mọi trạng thái sống trong content script và bị mất khi đóng tab.
- Chưa xác minh giới hạn số rule DNR cụ thể trên phiên bản Chrome mục tiêu (UNVERIFIED).

### 11.5 Các điểm cần xác minh trước khi triển khai

- Tên và đường dẫn chính xác của khóa quảng cáo trong JSON (FR-020, bước 3).
- Sự kiện `yt-navigate-finish` và `yt-page-data-updated` có tồn tại và ổn định (FR-028).
- Các class và selector ad module, nút skip (FR-023, FR-025).
- Tên thuộc tính player liên quan quảng cáo (S5 trong FR-023).
- Endpoint nào thực sự là quảng cáo và method (FR-020, FR-018).

---

## 12. Kế hoạch bảo trì và cập nhật (v3)

### 12.1 Cấu trúc thư mục v3 (thay thế cây ở mục 2 cho phần mới)

```
yt-ad-shield/
├── manifest.json
├── README.md
├── CHANGELOG.md              (đường dẫn chính; bản tham chiếu trong docs/)
├── scripts/
│   ├── build-rules.js        # Sinh rules/ads.json từ src/registry/rules.js
│   └── lint-deps.js          # Kiểm tra vòng phụ thuộc, số ma thuật, URL ngoài registry
├── rules/
│   └── ads.json              # Sinh tự động, không sửa tay
├── src/
│   ├── config/
│   │   ├── schema.js         # CONFIG_SCHEMA_VERSION, migrateConfig (hàm thuần)
│   │   ├── security.js
│   │   ├── performance.js
│   │   ├── behavior.js
│   │   └── features.js
│   ├── registry/
│   │   ├── selectors.js      # SELECTORS_VERSION
│   │   ├── endpoints.js      # ENDPOINTS_VERSION
│   │   └── rules.js          # RULES_VERSION, nguồn cho build-rules.js
│   ├── core/
│   │   ├── namespace.js      # Tạo window.__yas, kiểm tra cài trùng
│   │   ├── lifecycle.js      # Lifecycle Manager
│   │   ├── module-runner.js  # runModule, error boundary, đếm lỗi
│   │   └── logger.js         # Debug Logger
│   ├── data/
│   │   ├── prune.js          # JSON Pruner (hàm thuần)
│   │   └── classify.js       # classifyResponse (hàm thuần)
│   ├── main/
│   │   ├── initial-response.js
│   │   ├── fetch-filter.js
│   │   └── xhr-filter.js
│   ├── isolated/
│   │   ├── cosmetic.js
│   │   ├── ad-detector.js
│   │   ├── ad-state-machine.js   # hàm thuần cho chuyển đổi + gắn vào runtime
│   │   ├── ad-action.js          # Ad Action Controller
│   │   ├── audio-state.js
│   │   ├── playback-watchdog.js
│   │   ├── playback-recovery.js
│   │   ├── dom-observer.js
│   │   ├── spa-navigation.js
│   │   └── settings.js           # đọc chrome.storage, ghi dataset
│   └── popup/
│       ├── popup.html
│       ├── popup.css
│       └── popup.js
├── docs/
│   ├── ARCHITECTURE.md
│   ├── MODULES.md
│   ├── CONFIGURATION.md
│   ├── SELECTORS.md
│   ├── ENDPOINTS.md
│   ├── TESTING.md
│   ├── CHANGELOG.md
│   └── COMPATIBILITY.md
└── test/
    ├── unit/
    ├── integration/          # checklist thủ công và ghi kết quả
    ├── regression/           # R01 đến R18
    ├── baseline/             # <version>.json
    └── fixtures/             # response mẫu cho từng endpoint
```

Ghi chú: các hàm có logic thuần (prune, classify, chuyển đổi state machine, tính toán ngưỡng, migration cấu hình) được tách ra để test bằng Node mà không cần trình duyệt.

### 12.2 Thứ tự nạp script trong manifest (v3)

- MAIN world: `src/config/*.js`, `src/registry/*.js`, `src/core/namespace.js`, `src/data/*.js`, `src/main/*.js`. Thứ tự này đảm bảo config và registry có sẵn trước khi hook cài.
- Isolated world: `src/config/*.js`, `src/registry/*.js`, `src/core/*.js`, `src/data/*.js`, `src/isolated/*.js`.
- Cùng một file config và registry được khai báo trong cả hai mục. Không sao chép nội dung.
- `src/core/namespace.js` tạo `window.__yas` nếu chưa có, và kiểm tra `__yas.installed` để chống cài trùng ở mức toàn hệ thống.

### 12.3 Giao diện module

Mỗi module export (qua `window.__yas.modules[name]`) một object với đúng các thành viên:

- `name`: chuỗi duy nhất.
- `init(ctx)`: cài đặt, trả về `disposer` hoặc `null`. `ctx` chứa config đã đọc, logger, và `lifecycle.register`.
- `dispose()`: gỡ bỏ những gì `init` đã làm, idempotent.
- `status()`: trả về `{enabled, state, errorCount, lastError}`.

Quy tắc: module không đọc `window.__yas.modules` của module khác trực tiếp để gọi thao tác; chỉ nhận dependency qua `ctx` khi `init`.

### 12.4 Quyền ghi theo module (bổ sung mục 11.1)

- Được ghi vào player: `ad-action.js`, `audio-state.js` (chỉ qua `ad-action.js`), `playback-recovery.js` (chỉ qua `ad-action.js`).
- Được ghi vào response: `fetch-filter.js`, `xhr-filter.js`, `initial-response.js`, chỉ qua `prune.js` và `classify.js`.
- Được ghi vào DOM: `cosmetic.js` (chỉ thẻ style của mình).
- Chỉ đọc: `ad-detector.js`, `playback-watchdog.js`, `dom-observer.js`, `spa-navigation.js`, `logger.js`.

### 12.5 Quy trình cập nhật khi YouTube thay đổi

Ví dụ: `yt-navigate-finish` đổi tên.

1. Tra `SELECTORS.md` và `ENDPOINTS.md` xem mục nào liên quan. Ghi bằng chứng (ảnh DevTools, log sự kiện) vào `CHANGELOG.md` nháp.
2. Sửa `src/registry/selectors.js` hoặc `endpoints.js`, tăng `REGISTRY_VERSION` (patch), cập nhật `lastVerified`.
3. Module dùng sự kiện này (`spa-navigation.js`) không cần sửa nếu registry là nguồn duy nhất.
4. Chạy `test/unit` cho module và `test/regression`.
5. Chạy checklist integration và playback preservation trong `TESTING.md`.
6. Commit checkpoint trước, commit thay đổi, tag nếu stable, cập nhật `CHANGELOG.md`.

Nếu thay đổi làm vỡ nhiều module, đó là dấu hiệu cần xem lại registry chứ không phải viết lại module.

### 12.6 Bảng khả năng bảo trì theo loại thay đổi

| Loại thay đổi YouTube | Module ảnh hưởng | File cần sửa | Test cần chạy |
|-----------------------|------------------|--------------|---------------|
| Đổi tên khóa quảng cáo trong JSON | JSON Pruner, Classifier | `endpoints.js`, `prune.js` nếu cấu trúc đổi | unit (fixture), regression R09, R10 |
| Đổi endpoint | Fetch/XHR hook | `endpoints.js` | unit, regression R11, R12, playback |
| Đổi class player | Ad Detector, Watchdog | `selectors.js` | unit, R02 đến R04, playback |
| Đổi nút skip | Ad Action | `selectors.js` | unit, R02 đến R04 |
| Đổi sự kiện SPA | SPA Navigation | `selectors.js` (mục event) | R06 |
| Đổi domain quảng cáo | DNR | `rules.js` và sinh lại `ads.json` | DNR validation, R18 |
| Chrome đổi hành vi MV3 | Tùy module | `COMPATIBILITY.md` và module liên quan | manifest validation, toàn bộ |

### 12.7 Giới hạn đã biết

- Tên sự kiện và selector của YouTube thay đổi không báo trước. Không có cam kết tương thích lâu dài.
- Một số thay đổi có thể chỉ phát hiện được khi người dùng gặp lỗi trên trang thật. Baseline giúp so sánh nhưng không thay thế kiểm thử thủ công.


## 13. Ranh giới cờ MAIN/ISOLATED (v4)

- Feature flags được đọc qua `FeatureFlags` (world-independent, `contracts/feature-flags.md`).
- Cơ chế truyền từ ISOLATED sang MAIN nằm sau `adapter` (`contracts/adapter.md`). Adapter là phần duy nhất phụ thuộc T004.
- Thư mục dự kiến: `src/core/feature-flags.js` (logic), `src/adapters/adapter-null.js` (hiện tại), các adapter cụ thể chỉ được thêm sau khi T004 chốt.
- Test registry và module không dùng adapter thật; dùng `adapter-null` hoặc adapter giả trong test.
