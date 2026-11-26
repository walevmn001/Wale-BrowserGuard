# Đặc tả tính năng: YT Ad Shield

**Trạng thái:** Bản nháp v3 (bổ sung bảo trì và cập nhật lâu dài, mục 12). Chưa kiểm tra trên YouTube thực tế. Trạng thái từng hạng mục xem `status.md`.
**Phạm vi:** Extension Chrome MV3, chạy trên `*.youtube.com`

## 1. Mục tiêu

Giảm quảng cáo khi xem video YouTube bằng bốn lớp chạy song song. Mỗi lớp xử lý một đường đưa quảng cáo vào trang khác nhau, để nếu một lớp bỏ sót thì lớp khác vẫn có thể chặn.

## 2. Người dùng

Người dùng cá nhân cài extension trên Chrome phiên bản 111 trở lên, dùng tài khoản YouTube thông thường và muốn xem video mà không bị quảng cáo trước, giữa hoặc trong trình phát.

## 3. Phạm vi

### Trong phạm vi
- Lọc khóa quảng cáo trong dữ liệu khởi tạo trang và response JSON của các endpoint player, next, browse, search.
- Chặn request tới các domain và đường dẫn quảng cáo đã biết.
- Phát hiện quảng cáo đang chạy trong trình phát, tắt tiếng và tua tới cuối đoạn quảng cáo, tự bấm nút bỏ qua khi có.
- Ẩn các phần tử quảng cáo trên giao diện bằng CSS.
- Trang popup để bật/tắt từng lớp và xem trạng thái.
- Ghi chú hướng dẫn cài đặt và kiểm tra.

### Ngoài phạm vi
- Chặn quảng cáo trên ứng dụng YouTube di động, YouTube TV hoặc ứng dụng bên thứ ba.
- Chặn quảng cáo đã được ghép cứng vào video (SSAI) bằng cách ngăn phát. Lớp runtime chỉ tua được, không ngăn xuất hiện.
- Chặn hoặc vượt qua thông báo phát hiện chặn quảng cáo của YouTube.
- Đồng bộ cấu hình giữa các máy, tài khoản đăng nhập hoặc đám mây.
- Cập nhật tự động danh sách bộ lọc từ máy chủ bên ngoài.

## 4. Câu chuyện người dùng

### US-1 (P1): Quảng cáo trước video không xuất hiện
Là người xem, tôi muốn mở video và bắt đầu xem ngay mà không thấy quảng cáo trước video.

**Kiểm tra chấp nhận**
- Given: extension đã bật và lớp lọc dữ liệu đang bật.
- When: tôi mở một video có quảng cáo trước.
- Then: trình phát không chuyển sang trạng thái `ad-showing`, và `window.ytInitialPlayerResponse` không còn khóa `adPlacements`, `playerAds` hoặc `adSlots`.

### US-2 (P1): Request quảng cáo bị chặn
Là người xem, tôi muốn các script và request tới máy chủ quảng cáo bị chặn ở mức mạng.

**Kiểm tra chấp nhận**
- Given: lớp chặn request đang bật.
- When: trang tải script từ `doubleclick.net`, `googlesyndication.com` hoặc `googleadservices.com`.
- Then: request bị trình duyệt hủy, và tab Network hiển thị trạng thái bị chặn bởi extension.

### US-3 (P2): Quảng cáo giữa chừng hoặc trong trình phát được xử lý
Là người xem, tôi muốn khi quảng cáo chạy thì âm thanh bị tắt và video được tua tới cuối đoạn quảng cáo.

**Kiểm tra chấp nhận**
- Given: lớp runtime đang bật và trình phát có class `ad-showing` hoặc `ad-interrupting`.
- When: quảng cáo bắt đầu phát.
- Then: video bị tắt tiếng trong vòng 1 giây, được tua tới cuối tối đa một lần cho mỗi quảng cáo khi điều kiện FR-025 thỏa, và nút bỏ qua được bấm nếu hiển thị và có thể tương tác. [Điều chỉnh v2: thêm điều kiện xác nhận và giới hạn một lần seek.]

**Điều kiện khôi phục**
- Khi quảng cáo kết thúc và tiếng đã bị extension tắt, tiếng được bật lại.
- Nếu người dùng tự tắt tiếng trước khi quảng cáo bắt đầu, extension không bật lại tiếng.

### US-4 (P2): Phần tử quảng cáo trên giao diện bị ẩn
Là người xem, tôi muốn banner, ô quảng cáo trong danh sách và sparkles không hiển thị.

**Kiểm tra chấp nhận**
- Given: lớp ẩn CSS đang bật.
- When: trang chủ, trang kết quả tìm kiếm hoặc trang xem video được tải.
- Then: các phần tử thuộc danh sách selector trong CSS có `display: none`, không để lại khoảng trống bất thường.

### US-5 (P3): Bật/tắt từng lớp
Là người dùng nâng cao, tôi muốn bật hoặc tắt từng lớp để tìm nguyên nhân khi trang lỗi.

**Kiểm tra chấp nhận**
- Given: popup đang mở.
- When: tôi tắt một lớp rồi tải lại trang YouTube.
- Then: lớp đó không hoạt động, các lớp khác vẫn hoạt động, và trạng thái trong popup khớp với hành vi thực tế.

## 5. Yêu cầu chức năng

| Mã | Yêu cầu |
|----|---------|
| FR-001 | Extension phải khai báo Manifest V3 với `world: "MAIN"` cho script lọc dữ liệu. |
| FR-002 | Script MAIN phải định nghĩa lại `window.ytInitialPlayerResponse` bằng getter/setter để lọc giá trị trước khi YouTube đọc. |
| FR-003 | Script MAIN phải bọc `window.fetch` và lọc response JSON của các endpoint `/youtubei/v1/(player|next|browse|search)`. |
| FR-004 | Hàm lọc phải xóa khóa `adPlacements`, `playerAds`, `adSlots` ở mọi độ sâu, với giới hạn độ sâu và số phần tử. |
| FR-005 | Khi response không phải JSON hoặc parse lỗi, phải trả lại response gốc không chỉnh sửa. |
| FR-006 | Khi lọc JSON thành công, response mới phải giữ nguyên status, statusText và headers (trừ content-length). |
| FR-007 | Lọc XMLHttpRequest phải là tính năng riêng, không bắt buộc trong bản đầu. Nếu thêm, phải dùng cùng hàm lọc với fetch. |
| FR-008 | Declarative Net Request phải chặn các domain và đường dẫn quảng cáo đã liệt kê trong `rules/ads.json`. |
| FR-009 | Script runtime phải theo dõi class của `#movie_player` mỗi 300 ms để phát hiện trạng thái quảng cáo. |
| FR-010 | Khi trạng thái quảng cáo đã được xác nhận (xem FR-023) và điều kiện seek an toàn (xem FR-025), script tắt tiếng video và tua tối đa một lần cho mỗi quảng cáo tới cuối nếu `duration` hữu hạn. Không seek khi không có quảng cáo. [Điều chỉnh v2: trước đây không có điều kiện xác nhận.] |
| FR-011 | Script runtime phải bấm nút bỏ qua quảng cáo chỉ khi phần tử hiển thị (`offsetParent !== null`). |
| FR-012 | Script runtime chỉ bật lại tiếng nếu chính extension đã tắt tiếng. |
| FR-013 | CSS ẩn quảng cáo phải được chèn sớm nhất có thể (`document_start`). |
| FR-014 | Popup phải cho bật/tắt từng lớp, lưu vào `chrome.storage.sync`, và các content script phải đọc trạng thái này trước khi kích hoạt. |
| FR-015 | Khi cờ của một lớp tắt, lớp đó không được đăng ký hook, không được chèn CSS và không được tạo interval. |
| FR-016 | Mọi selector, khóa JSON và endpoint phải nằm trong `src/config/selectors.js`, có ghi chú ngày kiểm tra. |
| FR-017 | Mọi lỗi trong content script phải được bắt và chỉ ghi ra console ở chế độ debug. |

## 6. Yêu cầu phi chức năng

- **Hiệu năng:** vòng lặp runtime không được chạy quá 1 lần mỗi 300 ms. Hàm lọc JSON phải có giới hạn để không làm treo tab khi response lớn.
- **Tương thích:** Chrome 111 trở lên. Hoạt động trên Chromium khác chỉ là mục tiêu phụ, không kiểm tra.
- **Quyền riêng tư:** không có request mạng từ extension, không có analytics.
- **Bảo trì:** khi YouTube đổi selector, chỉ cần sửa `selectors.js` và có thể không cần sửa logic.
- **Khả năng gỡ lỗi:** có cờ `DEBUG` trong `selectors.js` (mặc định `false`) để bật log chi tiết.

## 7. Trường hợp biên

- Trang tải lại giữa chừng khi quảng cáo đang chạy: trạng thái tiếng không được giữ lại sau khi tải lại.
- Video không có `duration` (live stream, chưa tải metadata): không được tua, chỉ tắt tiếng.
- Quảng cáo chèn phía server: không có class `ad-showing` hoặc không tua được, extension phải không làm hỏng video.
- Response JSON rất lớn hoặc cấu trúc lồng sâu: hàm lọc dừng ở giới hạn và trả về kết quả đã lọc một phần, không làm treo tab.
- Người dùng chuyển SPA (không tải lại trang): lớp `ytInitialPlayerResponse` có thể không áp dụng cho dữ liệu mới, phải dựa vào lớp fetch.
- Người dùng đăng nhập Premium: YouTube không gửi quảng cáo, extension vẫn chạy không gây lỗi.
- YouTube phát hiện chặn quảng cáo và hiển thị thông báo: nằm ngoài phạm vi, chỉ ghi nhận.

## 8. Giả định

- YouTube vẫn dùng khóa `adPlacements`, `playerAds`, `adSlots` trong response, và `ytInitialPlayerResponse` là biến toàn cục được gán khi tải trang. Chưa xác minh trên phiên bản hiện tại.
- Trình phát vẫn gắn class `ad-showing` hoặc `ad-interrupting` lên `#movie_player` khi có quảng cáo. Chưa xác minh.
- Tên class phần tử quảng cáo trong CSS vẫn đúng. Chưa xác minh.
- Chrome cho phép `world: "MAIN"` trong content script và `declarativeNetRequest` hoạt động với các domain liệt kê.

## 9. Câu hỏi còn mở

- Có cần hook XMLHttpRequest ngay trong bản đầu không, hay để sau khi lớp fetch đã ổn định? Mặc định: để sau (FR-007 là tùy chọn).
- Có muốn giữ trạng thái bật/tắt tiếng sau khi tải lại trang không? Mặc định: không giữ.

## 10. Tiêu chí hoàn thành

- Tất cả FR từ FR-001 đến FR-006, FR-008 đến FR-017 được triển khai (FR-007 là tùy chọn).
- Các kiểm tra chấp nhận của US-1 đến US-5 được thực hiện thủ công trên ít nhất một video có quảng cáo trước và một video có quảng cáo giữa chừng.
- README ghi rõ kết quả kiểm tra thực tế và những mục chưa kiểm tra.

---

# Phần bổ sung v2: Đặc tả thuật toán chi tiết

**Quy ước trạng thái:** mỗi hạng mục có một trong các trạng thái SPECIFIED, IMPLEMENTED, TESTED, VERIFIED. Hiện tại tất cả đều là SPECIFIED. Chi tiết xem `status.md`.

**Quy ước giá trị số:** mọi con số trong phần này (ví dụ timeout, số tick xác nhận, ngưỡng) là giá trị đề xuất ban đầu, chưa đo đạc. Phải ghi vào `selectors.js` hoặc hằng số cấu hình và đánh dấu `// UNVERIFIED` cho đến khi có số liệu thử nghiệm.

**Quy ước API:** chỉ dùng API chuẩn của Web và Chrome MV3 nêu rõ trong từng mục (`XMLHttpRequest`, `Response`, `Headers`, `MutationObserver`, `HTMLMediaElement`, `chrome.declarativeNetRequest`, `chrome.storage`). Các sự kiện riêng của YouTube (`yt-navigate-finish`, `yt-page-data-updated`) và tên class là UNVERIFIED.

**Nguyên tắc ưu tiên:** bảo toàn playback luôn cao hơn tỷ lệ chặn quảng cáo (xem mục 11.0).

## 11.0 Nguyên tắc bảo toàn playback (FR-038)

- **Mục đích:** ngăn extension làm hỏng video bình thường để đổi lấy việc chặn quảng cáo.
- **Quy tắc:** mọi can thiệp (chặn request, sửa response, mute, seek, click, reload) chỉ được thực hiện khi có bằng chứng quảng cáo đang hoạt động, hoặc khi có bằng chứng playback đã bị treo (FR-036).
- **Ưu tiên khi xung đột:** nếu một thao tác có thể chặn quảng cáo nhưng có rủi ro làm đứng video, thao tác đó bị bỏ qua.
- **Kiểm thử:** xem FR-035 và mục 14 của phần này.

## 11.1 Hook XMLHttpRequest (FR-018, mục 7)

- **Mục đích:** lọc response JSON quảng cáo từ luồng XHR, vì một số luồng của YouTube không đi qua `fetch`.
- **Nguyên lý:** bọc `XMLHttpRequest.prototype.open` để lưu URL và method vào một thuộc tính riêng trên instance; bọc `send` để đăng ký listener `readystatechange` khi URL khớp `AD_ENDPOINT`.
- **Input:** method, URL từ `open`; sự kiện `readystatechange` khi `readyState` = 4.
- **Output:** với endpoint quảng cáo, response đã prune được trả về qua các thuộc tính `responseText` hoặc `response` đã định nghĩa lại. Với endpoint khác, không làm gì.
- **Kích hoạt:** URL khớp `AD_ENDPOINT`, `responseType` là `""` hoặc `"text"` hoặc `"json"`, và `status` nằm trong 200 đến 299.
- **Luồng xử lý:**
  1. `open` lưu `{method, url}` vào thuộc tính riêng.
  2. `send` kiểm tra điều kiện kích hoạt, nếu đúng thì gắn listener.
  3. Khi `readyState` = 4, đọc raw text, parse JSON, gọi `prune`, rồi serialize lại.
  4. Định nghĩa lại `responseText` và `response` trên instance chỉ khi xử lý thành công.
- **Điều kiện lỗi:** `responseType` là `arraybuffer`, `blob` hoặc `document`; parse lỗi; `status` không thành công; response quá `MAX_RESPONSE_BYTES`. Tất cả đều giữ nguyên hành vi gốc.
- **Cơ chế bảo vệ:** không thay đổi `readyState`, `status`, `statusText`, `responseType`. Không dispatch event giả. Không giả lập response thành công. Không đọc body nhiều lần (đọc một lần, lưu kết quả).
- **Kiểm thử và nghiệm thu:**
  - JSON, text, ArrayBuffer và Blob đều không bị sửa ngoài endpoint quảng cáo.
  - Với endpoint quảng cáo JSON, `responseText` không còn `adPlacements`.
  - Với lỗi parse, `responseText` giữ nguyên byte gốc.
  - Trạng thái: SPECIFIED.

## 11.2 Hook Main World và khởi tạo sớm (FR-019, mục 8)

- **Mục đích:** cài hook trước khi YouTube khởi tạo player.
- **Nguyên lý:** content script MAIN world chạy tại `document_start`, cài các hook (`ytInitialPlayerResponse`, `fetch`, XHR) một lần, và đánh dấu bằng một thuộc tính trên `window` để chống cài trùng.
- **Input:** không có ngoài môi trường trang và cờ cấu hình.
- **Output:** các hook đã cài, và một đối tượng trạng thái `window.__yasHooks` (tên đề xuất, đánh dấu UNVERIFIED về xung đột tên).
- **Kích hoạt:** `document_start` của mọi trang `*.youtube.com`.
- **Luồng xử lý:**
  1. Kiểm tra `window.__yasHooks`. Nếu đã tồn tại và cùng phiên bản, thoát.
  2. Đọc cấu hình từ `dataset` của `document.documentElement` (theo quyết định ở T004).
  3. Cài từng hook trong khối `try`. Hook nào thất bại thì bỏ qua hook đó, ghi trạng thái, các hook khác vẫn cài.
  4. Ghi trạng thái cài đặt vào `window.__yasHooks`.
- **Giao tiếp MAIN và isolated:** isolated world gửi lệnh qua `window.postMessage` với `event.source === window` và một khóa nhận diện. MAIN world chỉ chấp nhận message có kiểu và cấu trúc đúng (kiểm tra `typeof`, không tin dữ liệu thô). Hook không nhận lệnh thực thi code.
- **Điều kiện lỗi:** YouTube đã khởi tạo player trước khi script chạy (không kiểm soát được); thuộc tính `ytInitialPlayerResponse` không configurable.
- **Cơ chế bảo vệ:** không phụ thuộc thứ tự khởi chạy: nếu đến muộn, chỉ hook các luồng chưa được gọi và ghi log trạng thái `LATE_INSTALL`.
- **Kiểm thử và nghiệm thu:**
  - Cài hai lần không tạo hook trùng (đếm số wrapper).
  - Message sai định dạng bị bỏ qua.
  - Trạng thái: SPECIFIED.

## 11.3 Phân loại response trước khi prune (FR-020, mục 9)

- **Mục đích:** chỉ prune khi response thực sự là quảng cáo, không prune JSON YouTube một cách mù quáng.
- **Nguyên lý:** phân loại theo bốn tín hiệu, mỗi tín hiệu là điều kiện cần, và cần đủ cả bốn trước khi prune.
- **Input:** URL, HTTP method, `content-type` (hoặc thuộc tính tương đương với XHR), đối tượng JSON đã parse.
- **Output:** một trong các nhãn `AD_RELATED`, `PLAYBACK_CRITICAL`, `UNRELATED`, `UNKNOWN`. Chỉ `AD_RELATED` được prune.
- **Kích hoạt:** mọi response đi qua fetch hoặc XHR hook.
- **Luồng xử lý:**
  1. Kiểm tra URL khớp `AD_ENDPOINT` và method là `GET` hoặc `POST` (theo endpoint đã xác minh).
  2. Kiểm tra `content-type` chứa `json`.
  3. Kiểm tra JSON có ít nhất một khóa trong `AD_KEYS` ở cấp gốc hoặc ở `playerResponse` (đường dẫn cụ thể cần xác minh, UNVERIFIED).
  4. Kiểm tra không có khóa bảo vệ ở cấp gốc (`streamingData`, `videoDetails`, `playabilityStatus`) trước khi xóa.
  5. Gán nhãn và trả về.
- **Trường bảo vệ bắt buộc không được xóa:** `streamingData`, `videoDetails`, `captions`, `playabilityStatus`, `playerConfig`. Hàm `prune` phải bỏ qua các khóa này ở mọi độ sâu, kể cả khi trùng tên với khóa quảng cáo.
- **Điều kiện lỗi:** nhãn `UNKNOWN` không prune; `PLAYBACK_CRITICAL` không prune.
- **Cơ chế bảo vệ:** nếu phân loại không chắc chắn, mặc định không prune (fail-open).
- **Kiểm thử và nghiệm thu:**
  - Fixture response video thường (có `streamingData`) được gán `UNRELATED` hoặc `PLAYBACK_CRITICAL`, và không thay đổi byte.
  - Fixture có `adPlacements` và không có khóa bảo vệ được gán `AD_RELATED`.
  - Khóa bảo vệ lồng sâu không bị xóa.
  - Trạng thái: SPECIFIED.

## 11.4 Bảo toàn Response API (FR-021, mục 10)

- **Mục đích:** khi tạo `Response` mới, không làm sai ngữ nghĩa HTTP.
- **Nguyên lý:** chỉ tái tạo `Response` khi status có body và không thuộc nhóm đặc biệt; tất cả trường hợp còn lại trả response gốc.
- **Input:** `Response` gốc, body đã prune.
- **Output:** `Response` mới với cùng `status`, `statusText`, `headers` (trừ `content-length`), hoặc response gốc.
- **Điều kiện trả response gốc:** `type` là `opaque` hoặc `opaqueredirect`; `status` là 204, 205, 304 hoặc nhỏ hơn 200 hoặc lớn hơn 299; method là HEAD; `bodyUsed` đã là true; có lỗi ở bất kỳ bước nào.
- **Luồng xử lý:**
  1. Kiểm tra điều kiện trả gốc.
  2. Đọc body một lần bằng `clone().text()` (clone để giữ bản gốc trong trường hợp lỗi).
  3. Parse, prune, serialize.
  4. Dựng `Response` mới với `new Response(body, {status, statusText, headers})`.
  5. Nếu bất kỳ bước nào ném lỗi, trả response gốc.
- **Cơ chế bảo vệ:** không biến lỗi thành thành công; không đọc body nhiều lần; không dựng response khi không chắc status hợp lệ.
- **Kiểm thử và nghiệm thu:**
  - Từng trường hợp 204, 205, 304, HEAD, opaque đều trả response gốc (so sánh đối tượng gốc).
  - Lỗi parse trả response gốc với body không đổi.
  - Trạng thái: SPECIFIED.

## 11.5 Ad State Machine (FR-022, mục 11)

- **Mục đích:** một nguồn sự thật duy nhất về trạng thái quảng cáo, tránh nhiều module cùng thao tác.
- **Trạng thái:** IDLE, AD_DETECTED, AD_ACTIVE, SKIP_PENDING, AD_ENDING, RECOVERY (và trạng thái nội bộ DISABLED cho trường hợp dừng can thiệp, xem FR-027).
- **Bảng chuyển đổi:**

| Từ | Đến | Điều kiện |
|----|-----|-----------|
| IDLE | AD_DETECTED | Tín hiệu quảng cáo (FR-023) đúng liên tiếp `CONFIRM_TICKS` lần |
| AD_DETECTED | AD_ACTIVE | Đã mute và xác nhận video đang trong quảng cáo |
| AD_DETECTED | IDLE | Tín hiệu biến mất trước khi xác nhận xong |
| AD_ACTIVE | SKIP_PENDING | Nút skip hiển thị, enabled và trong thời gian chờ |
| AD_ACTIVE | AD_ENDING | Tín hiệu quảng cáo biến mất |
| SKIP_PENDING | AD_ENDING | Đã click skip, hoặc tín hiệu biến mất |
| AD_ENDING | IDLE | Tín hiệu biến mất đủ `CLEAR_TICKS` lần và đã khôi phục âm thanh (FR-024) |
| bất kỳ trạng thái quảng cáo | RECOVERY | Watchdog phát hiện treo (FR-026) |
| RECOVERY | IDLE | Playback khỏe lại |
| RECOVERY | DISABLED | Vượt giới hạn recovery (FR-027) |

- **Timeout (đề xuất, UNVERIFIED):** AD_DETECTED tối đa 3 giây; SKIP_PENDING tối đa 5 giây trước khi quay về AD_ACTIVE; AD_ENDING tối đa 2 giây; RECOVERY theo FR-027. Quá timeout thì chuyển theo cạnh đã định nghĩa, không nhảy trạng thái tùy ý.
- **Input:** kết quả phát hiện đã xác nhận (FR-023), trạng thái watchdog (FR-026), sự kiện SPA (FR-028).
- **Output:** trạng thái hiện tại và danh sách hành động được phép ở trạng thái đó (ví dụ mute chỉ được phát ra khi chuyển sang AD_ACTIVE, không phát lại ở các tick sau).
- **Quy tắc không lặp:** mỗi hành động (mute, seek, click) có cờ đã thực hiện trong trạng thái hiện tại. Không lặp khi trạng thái không đổi.
- **Quy tắc độc quyền:** chỉ Ad Action Controller (mục 11.7) được thực thi hành động. Các module khác chỉ gửi sự kiện.
- **Trạng thái bất thường:** nếu nhận chuyển đổi không hợp lệ, ghi log `INVALID_TRANSITION`, giữ trạng thái hiện tại, không thực thi hành động.
- **Reset:** khi chuyển video hoặc player bị thay thế (FR-028), đưa về IDLE, hủy timeout, không khôi phục âm thanh cũ lên video mới (FR-024).
- **Kiểm thử và nghiệm thu:**
  - Mọi cạnh trong bảng được kiểm thử bằng unit test với đồng hồ giả.
  - Chuyển đổi không hợp lệ không gây hành động.
  - Hành động không lặp qua nhiều tick.
  - Trạng thái: SPECIFIED.

## 11.6 Phát hiện quảng cáo đa tín hiệu (FR-023, mục 12)

- **Mục đích:** không kết luận quảng cáo từ một tín hiệu đơn lẻ, và phân biệt quảng cáo với buffering, loading, pause, ended, lỗi.
- **Tín hiệu:**
  - S1: `#movie_player` có class `ad-showing`.
  - S2: `#movie_player` có class `ad-interrupting`.
  - S3: có phần tử thuộc ad module (selector trong `selectors.js`, UNVERIFIED).
  - S4: có nút skip hiển thị (kiểm tra theo FR-025).
  - S5: thuộc tính player liên quan quảng cáo (UNVERIFIED, chưa xác định tên cụ thể).
- **Input:** trạng thái DOM và thuộc tính player tại thời điểm tick.
- **Output:** `{ adLikely: boolean, signals: string[], playbackPhase: string }`.
- **Luồng xử lý:**
  1. Thu thập S1 đến S5.
  2. Tính `adLikely` = true nếu S1 hoặc S2 đúng, và có thêm ít nhất một tín hiệu khác (S3, S4 hoặc S5). S1 hoặc S2 đơn lẻ không đủ, nếu chưa có xác nhận từ tín hiệu thứ hai thì coi là chưa xác nhận.
  3. Xác định `playbackPhase` từ thuộc tính video: `ended`, `paused`, `error` (từ `video.error`), `buffering` (từ `waiting` và `readyState` thấp), `loading` (`readyState` = 0), `playing`.
  4. Chỉ chuyển sang xác nhận quảng cáo khi `adLikely` đúng liên tiếp `CONFIRM_TICKS` lần và `playbackPhase` không phải `error`, `ended` hoặc `loading`.
- **Chống nhận diện nhầm:** buffering không được coi là quảng cáo. Tín hiệu một lần đơn lẻ bị loại bỏ bằng bộ lọc ngưỡng.
- **Điều kiện lỗi:** DOM không tồn tại, selector không tìm thấy, thuộc tính không đọc được: coi là không có quảng cáo.
- **Kiểm thử và nghiệm thu:**
  - Fixture với chỉ S1, không có tín hiệu khác: không xác nhận.
  - Fixture buffering với class quảng cáo sai: không xác nhận.
  - Fixture pause do người dùng: không xác nhận.
  - Trạng thái: SPECIFIED.

## 11.7 Ad Action Controller (mục 8 trong kiến trúc, liên quan FR-010, FR-025)

- **Mục đích:** nơi duy nhất thực thi các thao tác lên video và nút quảng cáo (mute, unmute, seek, click).
- **Input:** lệnh từ Ad State Machine kèm trạng thái cho phép.
- **Output:** kết quả thao tác (thành công, thất bại, bị bỏ qua) gửi lại cho state machine.
- **Quy tắc:** mỗi lệnh kiểm tra lại điều kiện ngay trước khi thực thi (FR-025, mục 13 Audio ownership). Không thực thi lệnh nếu trạng thái đã đổi.
- **Kiểm thử và nghiệm thu:** lệnh bị gửi hai lần chỉ có một tác dụng; lệnh không hợp lệ không chạm vào video.
- **Trạng thái:** SPECIFIED.

## 11.8 Quyền sở hữu trạng thái âm thanh (FR-024, mục 13)

- **Mục đích:** extension chỉ khôi phục âm thanh mà chính nó đã thay đổi, và tôn trọng lựa chọn của người dùng.
- **Nguyên lý:** trước khi mute, lưu snapshot `{muted, volume}` và cờ `mutedByUs = true`. Khi khôi phục, chỉ khôi phục nếu `mutedByUs` đúng và trạng thái hiện tại vẫn là trạng thái do extension đặt.
- **Input:** `video.muted`, `video.volume`, sự kiện `volumechange`.
- **Output:** trạng thái âm thanh sau khi khôi phục.
- **Luồng xử lý:**
  1. Trước mute: `snapshot = {muted: video.muted, volume: video.volume}`, `mutedByUs = !video.muted`.
  2. Gắn listener `volumechange`. Nếu sự kiện không do extension gây ra (cờ `ourChange` đang false), coi là người dùng đã thay đổi: đặt `mutedByUs = false` và không khôi phục.
  3. Khi khôi phục và `mutedByUs` đúng: đặt `muted = snapshot.muted`, `volume = snapshot.volume`.
  4. Xóa snapshot.
- **Trường hợp player bị thay thế:** snapshot gắn với đối tượng `video` cụ thể. Nếu tham chiếu khác, không khôi phục lên video mới.
- **Điều kiện lỗi:** không đọc được snapshot: không khôi phục, ghi log.
- **Cơ chế bảo vệ:** người dùng mute trước khi quảng cáo: `mutedByUs` là false, không bật tiếng. Người dùng đổi volume trong lúc quảng cáo: không ghi đè lựa chọn mới.
- **Kiểm thử và nghiệm thu:**
  - Người dùng đã mute trước: sau quảng cáo vẫn mute.
  - Người dùng đổi volume trong quảng cáo: volume giữ giá trị mới.
  - Video mới sau SPA không nhận snapshot cũ.
  - Trạng thái: SPECIFIED.

## 11.9 Cơ chế bỏ qua quảng cáo an toàn (FR-025, mục 14)

- **Mục đích:** bấm skip chỉ khi nút thật sự có thể bấm, không đoán vị trí.
- **Điều kiện bấm (tất cả phải đúng):** phần tử tồn tại, `offsetParent !== null`, không có thuộc tính `disabled` và `aria-disabled` không phải `"true"`, nằm trong viewport (tính bằng `getBoundingClientRect`), và đã qua cooldown.
- **Selector:** chỉ dùng selector cụ thể trong `selectors.js`, không dùng selector chung như `button` hay `[class*="skip"]`.
- **Cooldown:** tối thiểu `CLICK_COOLDOWN_MS` (đề xuất 1000 ms, UNVERIFIED) giữa hai lần click.
- **Seek an toàn:** chỉ khi AD_ACTIVE hoặc SKIP_PENDING đã xác nhận, `duration` hữu hạn và lớn hơn 0, thời gian còn lại của quảng cáo lớn hơn 1 giây, và chưa seek trong quảng cáo này. Seek một lần, không seek lặp.
- **Thất bại:** click không có hiệu lực (trạng thái không đổi sau một cửa sổ kiểm tra) thì đếm số lần thất bại, và khi vượt ngưỡng thì chuyển sang RECOVERY hoặc chờ, không lặp vô hạn.
- **Kiểm thử và nghiệm thu:**
  - Nút disabled không bị click.
  - Nút ẩn không bị click.
  - Không click trong cooldown.
  - Không có nút thì không click vị trí cố định.
  - Trạng thái: SPECIFIED.

## 11.10 Playback Watchdog (FR-026, mục 15)

- **Mục đích:** phát hiện video không tiến triển bất thường, phân biệt với buffering bình thường và với người dùng pause.
- **Theo dõi:** `currentTime`, `duration`, `paused`, `ended`, `readyState`, `networkState`, `videoWidth`, `videoHeight`; sự kiện `waiting`, `stalled`, `playing`, `canplay`, `error`, `emptied`.
- **Nguyên lý:** lấy mẫu `currentTime` mỗi `WATCHDOG_TICK_MS` (đề xuất 1000 ms). Nếu không đổi trong khi `paused` là false, `ended` là false và không ở trạng thái `waiting` có `readyState` đang tăng, thì tăng bộ đếm stall.
- **Ngưỡng:** `STALL_THRESHOLD_MS` (đề xuất 8000 ms, UNVERIFIED) trước khi coi là treo. Nếu `paused` là true (người dùng pause), reset bộ đếm.
- **Điều kiện lỗi:** `video.error` khác null: ghi lỗi media, chuyển sang RECOVERY theo FR-027.
- **Listener:** mỗi sự kiện gắn đúng một lần trên mỗi đối tượng video (kiểm tra bằng cờ trên đối tượng hoặc `WeakSet`). Khi video bị thay thế, hủy listener trên video cũ.
- **Cơ chế bảo vệ:** watchdog không tự seek hoặc reload. Chỉ báo cho state machine.
- **Kiểm thử và nghiệm thu:**
  - Video pause bởi người dùng không kích hoạt watchdog.
  - Buffering ngắn hơn ngưỡng không kích hoạt.
  - Video không tiến triển quá ngưỡng kích hoạt đúng một lần.
  - Không có listener trùng sau nhiều lần gắn.
  - Trạng thái: SPECIFIED.

## 11.11 Cơ chế khôi phục màn hình đen (FR-027, mục 16)

- **Mục đích:** khôi phục playback có điều kiện, không gây can thiệp làm xấu thêm.
- **Quy trình chẩn đoán (theo thứ tự, dừng khi xác định được nguyên nhân):**
  1. Trạng thái quảng cáo (state machine): nếu đang quảng cáo, không can thiệp, chờ.
  2. Trạng thái video (`paused`, `ended`).
  3. `networkState` và `readyState`.
  4. `buffered` và `currentTime` (có đoạn buffer quanh `currentTime` không).
  5. `video.error` và `MediaError.code`.
  6. Kiểm tra request video có bị extension chặn không (xem FR-032, log tín hiệu từ DNR nếu có).
- **Phân loại nguyên nhân và hướng xử lý:**
  - Quảng cáo đang chạy: không can thiệp.
  - Buffering: chờ.
  - Lỗi media: không seek, ghi log, chuyển cấp 4 nếu lặp lại.
  - Thiếu buffer kéo dài: chờ, không reload.
  - Nghi ngờ extension gây lỗi: vô hiệu hóa module nghi ngờ (FR-031) rồi ghi log.
- **Cấp độ recovery:**
  - Cấp 1: chờ buffering tối đa `RECOVERY_L1_MS` (đề xuất 5000 ms).
  - Cấp 2: đồng bộ lại trạng thái (đọc lại player reference, kiểm tra class).
  - Cấp 3: thử `video.currentTime = video.currentTime` đúng một lần, chỉ khi `buffered` có đoạn chứa `currentTime` và không đang quảng cáo. Đây là biện pháp nhẹ, không phải reload.
  - Cấp 4: dừng can thiệp (DISABLED cho lần phát này) và ghi log.
- **Giới hạn:** tối đa `RECOVERY_MAX_ATTEMPTS` (đề xuất 3) lần mỗi video; cooldown `RECOVERY_COOLDOWN_MS` (đề xuất 10000 ms) giữa hai lần cấp 3.
- **Cấm:** không reload trang tự động; không seek tùy tiện; không thay đổi `playbackRate` hoặc `paused` của video bình thường.
- **Ghi log:** nguyên nhân chẩn đoán, cấp recovery, kết quả từng lần (qua FR-033).
- **Kiểm thử và nghiệm thu:**
  - Màn hình đen do quảng cáo: không can thiệp.
  - Buffering kéo dài: không seek.
  - Lỗi media: không seek, chuyển cấp 4 sau số lần giới hạn.
  - Vượt giới hạn: DISABLED, không còn can thiệp.
  - Trạng thái: SPECIFIED.

## 11.12 Theo dõi YouTube SPA Navigation (FR-028, mục 17)

- **Mục đích:** xử lý khi video đổi mà không tải lại trang.
- **Sự kiện:** `yt-navigate-finish`, `yt-page-data-updated` (UNVERIFIED), `popstate` (chuẩn của History API).
- **Luồng xử lý khi nhận sự kiện điều hướng:**
  1. Debounce `NAV_DEBOUNCE_MS` (đề xuất 300 ms) để gộp nhiều sự kiện.
  2. Lấy lại tham chiếu `#movie_player` và `video`. So với tham chiếu cũ.
  3. Nếu khác, hủy listener và observer gắn với video cũ, đưa state machine về IDLE, reset snapshot âm thanh (FR-024), đặt lại watchdog.
  4. Kiểm tra hook còn tồn tại trên `window.__yasHooks` (FR-019). Nếu mất, ghi log và thử cài lại một lần.
  5. Kiểm tra runtime guard còn chạy. Nếu không, khởi tạo lại qua Lifecycle Manager (FR-030).
- **Không làm gián đoạn video mới:** không seek, không mute video mới khi không có quảng cáo xác nhận.
- **Điều kiện lỗi:** sự kiện đến khi player đang thay đổi: debounce và kiểm tra lại tham chiếu sau thời gian debounce.
- **Kiểm thử và nghiệm thu:**
  - Chuyển video liên tục 10 lần không tạo interval hay observer trùng (đếm số instance).
  - Chuyển video khi đang quảng cáo: trạng thái về IDLE.
  - Trạng thái: SPECIFIED. Sự kiện YouTube cần VERIFIED trên trang thật.

## 11.13 MutationObserver quản lý DOM (FR-029, mục 18)

- **Mục đích:** phát hiện thay đổi DOM liên quan đến player, ad module và nút skip, bổ sung cho runtime guard chứ không thay thế.
- **Phạm vi quan sát:** chỉ `#movie_player` và một container gốc gần nhất (không quan sát `document.body` toàn bộ). Container được chọn theo selector cụ thể trong `selectors.js`.
- **Cấu hình:** `childList` và `attributes` với `attributeFilter` chỉ gồm `class`; không dùng `subtree` cho toàn trang nếu không cần.
- **Debounce:** callback gộp thay đổi trong `OBSERVER_DEBOUNCE_MS` (đề xuất 150 ms) rồi mới đánh giá.
- **Chống vòng lặp:** observer không thay đổi DOM mà quan sát. Không ghi class hay attribute trong callback.
- **Disconnect:** khi player bị thay thế (FR-028) hoặc khi module bị vô hiệu hóa (FR-031), gọi `disconnect()` và tạo observer mới nếu cần.
- **Phân công:** observer chỉ gửi sự kiện cho state machine. Runtime guard vẫn là bộ đọc trạng thái định kỳ.
- **Kiểm thử và nghiệm thu:**
  - Không có callback vô hạn khi không có thay đổi thật.
  - Sau disconnect không còn callback.
  - Số observer đang sống không vượt 1 cho mỗi player.
  - Trạng thái: SPECIFIED.

## 11.14 Quản lý vòng đời extension (FR-030, mục 19)

- **Mục đích:** một nơi quản lý toàn bộ tài nguyên để tránh leak và khởi tạo trùng.
- **Tài nguyên được theo dõi:** interval, timeout, MutationObserver, event listener, player reference, hook state, recovery state.
- **Nguyên lý:** mỗi tài nguyên đăng ký với Lifecycle Manager qua một hàm `register(kind, handle, disposer)`. `cleanupAll()` gọi từng `disposer` theo thứ tự ngược lại.
- **Chống khởi tạo nhiều instance:** Lifecycle Manager có cờ `initialized` và một `instanceId`. Lần gọi `init` thứ hai trả về instance cũ.
- **Cleanup:** gọi khi chuyển video (phần video), khi player bị thay thế (phần player), và khi module bị vô hiệu hóa (FR-031). Hàm cleanup dùng chung với nhánh lỗi khởi tạo, theo nguyên tắc "failed init và normal shutdown dùng chung một đường dọn".
- **Không ghi đè hook nhiều lần:** dựa vào FR-019.
- **Khởi tạo lại an toàn:** `reinit()` = `cleanupAll()` rồi `init()`, có giới hạn số lần (ví dụ 3 lần mỗi phiên trang).
- **Lưu ý về FreeLibrary:** không áp dụng trực tiếp với extension JavaScript, nhưng nguyên tắc tương ứng là không gỡ hook khi còn callback có thể được gọi. Hook không bị gỡ khi reinit, chỉ được bỏ qua bằng cờ `disabled`.
- **Kiểm thử và nghiệm thu:**
  - Đếm interval và observer trước và sau 20 lần chuyển video: không tăng.
  - `reinit` không tạo listener trùng.
  - Trạng thái: SPECIFIED.

## 11.15 Fail-open và cơ chế an toàn toàn hệ thống (FR-031, mục 20)

- **Mục đích:** lỗi của một module không làm hỏng playback hay module khác.
- **Error boundary:** mỗi module được bọc bởi `runModule(name, fn)`. Lỗi bị bắt, ghi log, và đếm số lỗi.
- **Vô hiệu hóa riêng từng module:** nếu số lỗi trong `MODULE_ERROR_WINDOW_MS` vượt `MODULE_ERROR_LIMIT`, module đó chuyển sang DISABLED. Các module khác tiếp tục.
- **Giới hạn retry:** mọi thao tác retry có số lần tối đa được định nghĩa trong cấu hình.
- **Fallback:** module hook lỗi thì luồng gốc của YouTube được dùng (response gốc trả lại). Module runtime lỗi thì không can thiệp video.
- **Không tạo lỗi liên tục:** lỗi lặp cùng nguyên nhân chỉ ghi log lần đầu và đếm, không ném lại.
- **Khôi phục trạng thái ban đầu:** khi module bị vô hiệu hóa, gọi disposer để trả video về trạng thái không bị can thiệp (ví dụ khôi phục âm thanh nếu `mutedByUs`).
- **Kiểm thử và nghiệm thu:**
  - Ép lỗi trong từng module, playback vẫn tiếp tục.
  - Lỗi lặp vượt ngưỡng dẫn đến DISABLED.
  - Response gốc vẫn được trả khi hook lỗi.
  - Trạng thái: SPECIFIED.

## 11.16 Quản lý DNR Rules an toàn (FR-032, mục 21)

- **Mục đích:** chặn đúng endpoint quảng cáo đã xác minh, không chặn tài nguyên playback.
- **Nguyên tắc phân nhóm:** rule chia theo nhóm (quảng cáo domain thuần, quảng cáo đường dẫn trên domain YouTube, thống kê quảng cáo). Mỗi nhóm có một rule riêng, id riêng.
- **Quy tắc:** không chặn cả domain nếu domain đó còn cung cấp tài nguyên playback (ví dụ không chặn `googlevideo.com`). Rule theo đường dẫn cụ thể trên domain YouTube, không theo domain gốc.
- **Priority và xung đột:** mọi rule có priority xác định. Rule trùng nội dung được phát hiện trong script kiểm tra (T011 mở rộng).
- **Giới hạn số lượng:** kiểm tra không vượt `chrome.declarativeNetRequest.MAX_NUMBER_OF_STATIC_RULESETS` và số rule trong một ruleset theo giới hạn Chrome (giá trị cụ thể cần xác minh từ tài liệu Chrome, UNVERIFIED).
- **Cập nhật rule động:** nếu dùng `updateDynamicRules`, gọi trong `try`, và trước khi áp dụng lưu danh sách rule cũ để rollback.
- **Rollback:** nếu rule mới làm lỗi (ví dụ tăng lỗi playback được ghi nhận bởi FR-027), khôi phục danh sách cũ.
- **Test bắt buộc:** request video (`videoplayback`) và tài nguyên thiết yếu (script player, CSS) không bị chặn bởi bất kỳ rule nào. Đây là test chặn nhầm (FR-034 mục 18).
- **Kiểm thử và nghiệm thu:**
  - Danh sách URL video và tài nguyên thiết yếu không khớp rule nào.
  - Rule trùng id bị từ chối.
  - Trạng thái: SPECIFIED. Danh sách rule chưa VERIFIED.

## 11.17 Bộ chẩn đoán và ghi log (FR-033, mục 22)

- **Mục đích:** ghi đủ thông tin để chẩn đoán lỗi mà không lộ dữ liệu.
- **Nội dung ghi:** timestamp (`performance.now()` và thời gian hệ thống), trạng thái quảng cáo, module, player state trước và sau xử lý, nguyên nhân chuyển trạng thái, thời điểm stall, nguyên nhân recovery, kết quả, lỗi.
- **Không ghi:** response body, URL đầy đủ có tham số nhạy cảm (chỉ ghi path), dữ liệu người dùng, cookie.
- **Bật/tắt:** cờ `DEBUG` trong `selectors.js` và chế độ theo module lưu trong `chrome.storage.sync`. Mặc định tắt.
- **Giới hạn dung lượng:** bộ đệm vòng (ring buffer) `LOG_MAX_ENTRIES` (đề xuất 500, UNVERIFIED). Không ghi `console` khi DEBUG tắt.
- **Lọc theo module:** mỗi dòng log có trường `module`. Popup có thể chọn module cần xem.
- **Hiệu năng:** không ghi trong vòng lặp nóng của watchdog trừ khi có thay đổi trạng thái.
- **Kiểm thử và nghiệm thu:**
  - Với DEBUG tắt, không có dòng console từ extension.
  - Ring buffer không vượt giới hạn.
  - Log không chứa chuỗi response body trong fixture.
  - Trạng thái: SPECIFIED.

## 11.18 Bộ kiểm thử Regression (FR-034, mục 23)

- **Mục đích:** một bộ test lặp lại được cho từng module và tích hợp.
- **Công cụ:** Node cho unit test (đồng hồ giả, fixture JSON), và kiểm thử thủ công trên trình duyệt cho tích hợp (chưa tự động hóa trong bản này).
- **Ca bắt buộc (theo đặc tả):**

| Mã | Ca | Mức kiểm thử |
|----|----|--------------|
| R01 | Video thường không có quảng cáo | Unit + thủ công |
| R02 | Quảng cáo có nút Skip | Unit (fixture DOM) + thủ công |
| R03 | Quảng cáo không có nút Skip | Unit + thủ công |
| R04 | Quảng cáo chưa thể Skip | Unit + thủ công |
| R05 | Quảng cáo giữa video | Thủ công |
| R06 | Chuyển video liên tục bằng SPA | Thủ công + đếm instance |
| R07 | Buffering kéo dài | Unit (đồng hồ giả) |
| R08 | Người dùng tự pause | Unit |
| R09 | Response JSON lỗi | Unit |
| R10 | Response vượt MAX_RESPONSE_BYTES | Unit |
| R11 | Fetch trả response không hợp lệ | Unit |
| R12 | XHR trả response không hợp lệ | Unit |
| R13 | Player bị thay thế khi đang phát | Thủ công |
| R14 | Extension lỗi khi đang xử lý quảng cáo | Unit (ép lỗi) |
| R15 | Người dùng đổi mute trong quảng cáo | Unit + thủ công |
| R16 | Nhiều quảng cáo liên tiếp | Thủ công |
| R17 | Recovery thất bại | Unit (đồng hồ giả) |
| R18 | DNR chặn nhầm request cần thiết | Unit (danh sách URL) |

- **Nghiệm thu:** mọi ca có kết quả ghi trong `status.md`. Ca chưa chạy đánh dấu chưa thực hiện.
- **Trạng thái:** SPECIFIED.

## 11.19 Kiểm thử bảo toàn Playback (FR-035, mục 24)

- **Mục đích:** chứng minh extension không làm hỏng luồng phát, so với bản tắt extension.
- **So sánh (A/B trên cùng video, cùng mạng):**
  - Response API: status, headers, body hợp lệ.
  - Player state: `readyState`, `networkState`, `paused`.
  - Media events: thứ tự và số lượng `waiting`, `stalled`, `playing`, `error`.
  - Khả năng phát: video phát được ít nhất `PLAYBACK_CHECK_SECONDS` (đề xuất 60 s).
  - Khả năng seek: seek đến một mốc và phát lại.
  - Trạng thái âm thanh: sau khi thay đổi volume bằng tay, giá trị giữ nguyên.
  - Khả năng chuyển video: chuyển sang video khác và phát.
  - Khả năng phục hồi sau buffering: giảm mạng giả lập rồi khôi phục.
- **Ca đặc biệt bắt buộc:** màn hình đen, mất đồng thời hình và tiếng, video đứng hình, playback không tiếp tục được, player treo sau khi quảng cáo kết thúc.
- **Yêu cầu:** không chỉ dựa vào unit test. Phải có integration test và kiểm thử trên YouTube thật. Kết quả ghi rõ môi trường (phiên bản Chrome, mạng, tài khoản).
- **Trạng thái:** SPECIFIED. Chưa thực hiện.

## 11.20 Chẩn đoán màn hình đen (FR-036)

- **Mục đích:** phân biệt nguyên nhân màn hình đen, không mặc định là quảng cáo.
- **Tín hiệu và nguyên nhân:**

| Tín hiệu | Nguyên nhân khả dĩ | Hướng xử lý |
|----------|-------------------|-------------|
| Đang quảng cáo xác nhận | Quảng cáo chạy | Không can thiệp |
| `readyState` thấp, `networkState` = loading | Buffering | Chờ (cấp 1) |
| `video.error` khác null | Lỗi media | Ghi log, không seek, cấp 4 nếu lặp |
| Request `videoplayback` không xuất hiện trong network log (qua log) | Request bị chặn hoặc không gửi | Kiểm tra DNR (FR-032) |
| Response JSON bị sửa nhưng playerResponse không còn `streamingData` | Prune sai (lỗi FR-020) | Vô hiệu hóa JSON Pruner (FR-031) |
| Seek trước đó không thay đổi `currentTime` | Seek thất bại | Không seek lại, cấp 3 bị khóa |
| `paused` false, `currentTime` đứng, không buffer | Player treo | Cấp 2, rồi cấp 3 |
| Mạng offline | Lỗi mạng | Chờ, không can thiệp |

- **Quy tắc:** nguyên nhân chưa xác định thì không hành động mạnh; chỉ ghi log và chờ.
- **Ưu tiên:** giữ playback bình thường (mục 11.0).
- **Trạng thái:** SPECIFIED. Các tín hiệu cần xác minh trên YouTube thật (UNVERIFIED).

## 11.21 Kiến trúc tổng thể và phụ thuộc module (FR-037)

Chi tiết trong `plan.md` mục 11. Tóm tắt quyền:

- Chỉ Ad Action Controller được thay đổi trạng thái player (mute, seek, click).
- Chỉ Playback Recovery được quyết định khôi phục, và chỉ thông qua Ad Action Controller.
- Các module đọc (Ad Detector, Playback Watchdog, Debug Logger) không được ghi vào video.
- Pruner và hooks chỉ thay đổi dữ liệu response, không chạm player.

## 11.22 Điều kiện nghiệm thu chung cho phần v2

- Không mất hay rút gọn 6 thuật toán ban đầu: Lọc JSON (prune), Hook ytInitialPlayerResponse, Hook fetch, DNR, Runtime guard, CSS hider. Ánh xạ FR và trạng thái xem `status.md`.
- Mọi hạng mục có đủ 8 trường: Mục đích, Nguyên lý, Input/Output, Kích hoạt, Luồng, Điều kiện lỗi, Cơ chế bảo vệ, Kiểm thử và nghiệm thu.
- Không có hạng mục nào được đánh dấu IMPLEMENTED, TESTED hoặc VERIFIED khi chưa có bằng chứng.
- Mọi API ngoài chuẩn đều được đánh dấu UNVERIFIED.

---

## 12. Bảo trì, mở rộng và cập nhật lâu dài (v3)

**Mục tiêu:** khi YouTube đổi một endpoint, selector hoặc cơ chế quảng cáo, chỉ module liên quan được sửa, kiểm thử và phát hành. Không viết lại toàn bộ extension.

### 12.1 Kiến trúc module (FR-039)

- Mỗi chức năng là một module có file riêng, `README` ngắn hoặc mục trong `MODULES.md`, interface đầu vào và đầu ra.
- Các nhóm logic độc lập: quảng cáo (state machine, detector, action controller), playback (watchdog, recovery), dữ liệu (pruner, hook response), mạng (DNR, fetch hook, XHR hook), giao diện (CSS hider, DOM observer), vòng đời (lifecycle, SPA navigation), hạ tầng (config, registry, logger).
- Không có module nào gọi trực tiếp `video.muted`, `video.currentTime` hay `fetch` ngoài module đã được giao quyền (xem FR-037).
- Kiểm tra vòng phụ thuộc bằng script Node đọc các `import` hoặc danh sách file phụ thuộc, bước lint bắt buộc (FR-044).
- Mọi module có thể thay thế bằng một module khác cùng interface mà không sửa module khác.

### 12.2 Cấu hình tập trung (FR-040)

- Cấu hình chia ba nhóm, mỗi nhóm một file trong `src/config/`:
  - **Bảo mật** (`security.js`): danh sách domain được phép chặn, danh sách domain không bao giờ được chặn (ví dụ domain phát video), quyền tối đa của mỗi module, bật/tắt chức năng nhạy cảm.
  - **Hiệu năng** (`performance.js`): `MAX_DEPTH`, `MAX_NODES`, `MAX_RESPONSE_BYTES`, `TICK_MS` của runtime guard, `WATCHDOG_TICK_MS`, `OBSERVER_DEBOUNCE_MS`, `NAV_DEBOUNCE_MS`, `LOG_MAX_ENTRIES`.
  - **Hành vi** (`behavior.js`): timeout của state machine, `CONFIRM_TICKS`, `CLEAR_TICKS`, `CLICK_COOLDOWN_MS`, `STALL_THRESHOLD_MS`, `RECOVERY_MAX_ATTEMPTS`, `RECOVERY_COOLDOWN_MS`, `RECOVERY_L1_MS`, retry limit, ngưỡng vô hiệu hóa module.
- Mỗi giá trị có: tên, kiểu, giá trị mặc định, khoảng hợp lệ, mức xác minh (`UNVERIFIED` hoặc `MEASURED`), và lý do.
- Giá trị ngoài khoảng hợp lệ bị thay bằng mặc định và ghi log cảnh báo (không ném lỗi).
- Không có số ma thuật nào nằm ngoài `src/config/` (kiểm tra bằng lint, FR-044).

### 12.3 Registry selector, endpoint và rule (FR-041)

- `src/registry/selectors.js`: mọi selector YouTube. Mỗi mục có `id`, `selector`, `purpose`, `verification` (`UNVERIFIED`, `VERIFIED_ON_DATE`), `lastVerified`, `fallback`.
- `src/registry/endpoints.js`: mọi endpoint, method, và mức liên quan quảng cáo (`AD_RELATED`, `PLAYBACK_CRITICAL`, `UNRELATED`). Mỗi mục có `purpose` và `verification`.
- `src/registry/rules.js`: định nghĩa domain và nhóm rule DNR ở dạng dữ liệu. Chrome chỉ đọc rule từ file JSON tĩnh trong manifest, nên `rules/ads.json` là bản sinh ra từ `rules.js` bởi script `scripts/build-rules.js`. Test kiểm tra hai bên khớp nhau (FR-045). Đây là điều chỉnh có ghi chú, xem mục 12.9.
- Endpoint và selector nào chưa được xác minh thì không được dùng để mở rộng phạm vi chặn.
- Không có URL, selector hay domain quảng cáo nào được viết trực tiếp trong module logic.
- Registry được nạp vào cả MAIN world và isolated world bằng cùng một file, khai báo trong manifest cho cả hai nhóm content script (không dùng ES module, dùng script cổ điển với namespace `window.__yas`). Điều này tránh trùng lặp và đảm bảo hai world đọc cùng một nguồn.

### 12.4 Phiên bản và schema (FR-042)

- `manifest.json` có `version` của extension (semver).
- Mỗi registry có hằng số `REGISTRY_VERSION` (ví dụ `"selectors": "1.0.0"`).
- Cấu hình người dùng trong `chrome.storage.sync` có khóa `configSchemaVersion` (số nguyên).
- Hàm `migrateConfig(oldConfig, fromVersion, toVersion)` là hàm thuần, chạy khi `fromVersion` khác `toVersion`. Mỗi bước migration là một hàm riêng có test.
- Nếu `configSchemaVersion` của người dùng cao hơn phiên bản extension hiểu được, extension dùng cấu hình mặc định cho các khóa không nhận ra và ghi log, không xóa dữ liệu người dùng.
- Theo dõi tương thích với Chrome MV3 trong `COMPATIBILITY.md`: phiên bản Chrome tối thiểu, API đã dùng, API đã kiểm tra, và các thay đổi của Chrome ảnh hưởng đến DNR hay content script.

### 12.5 Feature flags theo module (FR-043)

- Mỗi module có một cờ bật/tắt trong `src/config/features.js`:
  `ENABLE_JSON_PRUNER`, `ENABLE_FETCH_HOOK`, `ENABLE_XHR_HOOK`, `ENABLE_DNR`, `ENABLE_RUNTIME_GUARD`, `ENABLE_PLAYBACK_WATCHDOG`, `ENABLE_RECOVERY`, `ENABLE_CSS_HIDER`. Bổ sung: `ENABLE_AD_STATE_MACHINE`, `ENABLE_SPA_NAVIGATION`, `ENABLE_DOM_OBSERVER`, `ENABLE_DEBUG_LOGGER`.
- Cờ có ba nguồn theo thứ tự ưu tiên: mặc định trong code, cấu hình người dùng trong `chrome.storage.sync`, và tự vô hiệu hóa khi module lỗi vượt ngưỡng (FR-031).
- Tắt một module không được làm lỗi module khác. Tắt `ENABLE_DNR` không tắt hook JS, và ngược lại.
- Cờ `ENABLE_RECOVERY` tắt thì watchdog vẫn ghi log nhưng không gửi lệnh recovery.

### 12.6 Lớp tương thích và fallback (FR-044 là lint, FR-046 là fallback)

- **Kiểm tra API trước khi dùng:** mỗi hook kiểm tra `typeof window.fetch === "function"`, `typeof XMLHttpRequest === "function"`, `typeof chrome.declarativeNetRequest === "object"` (cho isolated), trước khi cài. Thiếu thì module đó ghi `UNSUPPORTED` và không cài.
- **Kiểm tra DOM:** mọi truy cập player đi qua một hàm `getPlayer()` trả về `null` khi không tìm thấy. Mọi module kiểm tra `null` trước khi đọc.
- **Fallback selector:** mỗi selector trong registry có một danh sách `fallback` gồm các selector cùng mục đích và có phạm vi hẹp hơn hoặc bằng selector chính. Không có fallback rộng hơn.
- **Nguyên tắc không can thiệp:** nếu không xác định được hành vi an toàn (không tìm thấy player, không có selector nào khớp, endpoint không có trong registry), module không thực hiện thao tác nào và ghi log `NO_SAFE_ACTION`.
- **Không giả định:** không giả định cấu trúc JSON cố định; luôn kiểm tra `typeof` và sự tồn tại của khóa trước khi truy cập.

### 12.7 Kiểm thử hồi quy và tương thích (FR-044, FR-047)

Mỗi lần cập nhật phải qua các bước theo thứ tự:

1. Lint và kiểm tra vòng phụ thuộc (không circular, không số ma thuật ngoài config, không URL ngoài registry).
2. Manifest validation: JSON hợp lệ, các file được khai báo có tồn tại, `manifest_version` là 3, quyền khai báo tối thiểu.
3. DNR rules validation: JSON hợp lệ, id không trùng, khớp với `rules.js`, không chặn domain trong danh sách bảo vệ, không chặn `googlevideo.com` hoặc tài nguyên playback thiết yếu.
4. Unit test toàn bộ module.
5. Integration test (kiểm thử trên trình duyệt, theo checklist trong `TESTING.md`).
6. Regression test R01 đến R18.
7. Playback preservation test (FR-035).
8. Build (nếu có bước build) và kiểm tra artifact.

**Baseline:** mỗi phiên bản stable lưu kết quả test vào `test/baseline/<version>.json` (tên bài test, kết quả, thời điểm, môi trường). Lần cập nhật sau so sánh với baseline để phát hiện test từng pass nay fail (regression mới).

**Trạng thái bắt buộc:** một bản chỉ được đánh dấu stable khi bước 1 đến 4 pass và bước 5 đến 7 có kết quả ghi trong `TESTING.md`.

### 12.8 Cập nhật, changelog và rollback (FR-045, FR-046)

- Mỗi thay đổi có mục trong `CHANGELOG.md` theo định dạng: phiên bản, ngày, module thay đổi, nguyên nhân (kèm bằng chứng nếu là sửa selector hay endpoint), tác động đến playback, và trạng thái kiểm thử.
- Quy trình cập nhật (theo mục 10 của yêu cầu):
  1. Xác định module bị ảnh hưởng qua `MODULES.md` và registry.
  2. Ghi bằng chứng thay đổi (ảnh chụp DevTools, response mẫu, ngày kiểm tra).
  3. Cập nhật registry hoặc module, chỉ phạm vi cần thiết.
  4. Chạy test của module.
  5. Chạy regression test toàn hệ thống (mục 12.7).
  6. Kiểm tra playback thủ công (FR-035).
  7. Tạo Git checkpoint trước thay đổi và sau thay đổi, ghi changelog.
- **Rollback:** mỗi bản stable có Git tag `vX.Y.Z`. Khôi phục bằng cách checkout tag đó. Migration cấu hình phải có chiều ngược hoặc đảm bảo phiên bản cũ đọc được cấu hình mới (đọc khóa không biết thì bỏ qua, như FR-042).
- **Không cập nhật chưa kiểm tra:** cấu hình, selector, endpoint, hay rule mới không được đưa vào bản phát hành khi chưa có mục test tương ứng trong `TESTING.md` với kết quả.
- **Playback:** không phát hành thay đổi ảnh hưởng đến playback khi chưa qua regression test (bước 5 và 7 ở mục 12.7).

### 12.9 Điều chỉnh so với yêu cầu gốc

- `rules.js` không thể là nguồn trực tiếp của DNR vì Chrome đọc rule từ JSON tĩnh. Quyết định: `rules.js` là nguồn, `rules/ads.json` là bản sinh bằng `scripts/build-rules.js`, và test FR-045 kiểm tra hai bên khớp nhau. Nếu bước sinh bị bỏ, `rules/ads.json` vẫn là nguồn tạm thời và phải được cập nhật thủ công cùng `rules.js`.
- Constitution I (không dùng bundler) vẫn được giữ. Script sinh rule là một script Node đơn giản, không gộp file, không biến đổi mã nguồn extension.
- Registry không dùng ES module vì content script MAIN world nạp file theo thứ tự trong manifest. Hai world đọc chung một file, không có bản sao.

### 12.10 Tài liệu bắt buộc (FR-047)

Thư mục `docs/` của repo chứa:

| File | Nội dung bắt buộc |
|------|-------------------|
| `ARCHITECTURE.md` | Sơ đồ module, luồng dữ liệu MAIN và isolated, quyền ghi player |
| `MODULES.md` | Danh sách module, trách nhiệm, interface, phụ thuộc |
| `CONFIGURATION.md` | Mọi khóa cấu hình, nhóm, mặc định, khoảng hợp lệ, mức xác minh |
| `SELECTORS.md` | Mọi selector trong registry, mục đích, mức xác minh, fallback |
| `ENDPOINTS.md` | Mọi endpoint, method, mức liên quan quảng cáo, mức xác minh |
| `TESTING.md` | Quy trình kiểm thử, kết quả từng lần chạy, checklist thủ công |
| `CHANGELOG.md` | Lịch sử thay đổi theo mục 12.8 |
| `COMPATIBILITY.md` | Phiên bản Chrome, API đã kiểm tra, ghi chú thay đổi Chrome |

Quy tắc: khi sửa source code, phải sửa tài liệu liên quan trong cùng thay đổi. Test FR-047 kiểm tra các file này tồn tại và có mục bắt buộc (ví dụ `CHANGELOG.md` có mục cho phiên bản hiện tại).

### 12.11 Tiêu chí nghiệm thu mục 12

- Mọi FR từ FR-039 đến FR-047 có trạng thái trong `status.md`.
- Không có số ma thuật, URL hay selector ngoài config và registry (kiểm tra bằng lint, khi có code).
- Mọi thay đổi cấu hình có migration và test migration.
- Có ít nhất một ví dụ tập dữ liệu cho mỗi endpoint trong `ENDPOINTS.md` (fixture) khi có code.
