# Privacy Policy — AdBlock Security

_Last updated: TODO(verify) — set the release date when publishing._

AdBlock Security ("the extension") is built so that your browsing stays on your
device. There is no account, no server, and no telemetry.

## English

### What we collect

**Nothing.** The extension does not collect, transmit, sell or share any
personal data, browsing history, page content, URLs or usage statistics. It has
no analytics, no crash reporting, and no remote logging.

### What is stored, and where

Everything the extension remembers is kept **locally** in your browser via
`chrome.storage.local`. It never leaves your machine:

- your settings (global on/off, per-list toggles, opt-in protections such as
  WebRTC and anti-fingerprinting, and their per-site exceptions);
- your whitelist (sites where blocking is turned off) and temporary exceptions;
- the local block counters shown in the popup (per-tab and total), which you can
  clear at any time;
- the metadata of the most recent filter-list download (version and timestamp)
  so updates can be applied safely.

You can remove all of this at any time by clearing the counters in the popup or
by uninstalling the extension.

### Network requests the extension makes

The extension downloads **filter-list data only** (rule text) from the update
source configured in the code, on a schedule or when you press "Update". These
requests fetch public rule files; they do not send your identity, browsing
history or any page information. The extension works offline with the rules
bundled at install time, so a failed update never disables protection.

### Permissions and why they are needed

- **declarativeNetRequest / declarativeNetRequestFeedback** — block and redirect
  ad, tracker and malware requests, and count what was blocked locally.
- **storage** — save the local settings, whitelist and counters described above.
- **alarms** — refresh the filter lists on a schedule.
- **scripting** — inject the cosmetic CSS that hides leftover ad placeholders.
- **privacy** — apply the opt-in WebRTC IP-handling policy when you enable it.
- **host permissions (`<all_urls>`)** — blocking rules must apply on every site
  to be effective; the rules run in the browser's network layer and no page
  content is read or sent anywhere.

### Third parties

The extension bundles third-party filter lists as data. Their licenses are
recorded in `rules/README.md`. No third-party code runs, and no third-party SDK
is included.

### Changes

Any material change to this policy will be published with a new version of the
extension and noted in this file.

### Contact

TODO(verify) — add the maintainer contact or issue-tracker URL before publishing.

## Tiếng Việt

AdBlock Security ("tiện ích") được thiết kế để việc duyệt web ở lại trên máy bạn.
Không có tài khoản, không có máy chủ, không có telemetry.

### Thu thập dữ liệu gì

**Không gì cả.** Tiện ích không thu thập, không truyền, không bán và không chia
sẻ bất kỳ dữ liệu cá nhân, lịch sử duyệt web, nội dung trang, URL hay thống kê
sử dụng nào. Không analytics, không báo cáo lỗi, không ghi log từ xa.

### Lưu gì, ở đâu

Mọi thứ tiện ích ghi nhớ đều lưu **cục bộ** trong trình duyệt qua
`chrome.storage.local`, không bao giờ rời khỏi máy bạn:

- cài đặt (bật/tắt tổng, bật/tắt từng nhóm list, các bảo vệ opt-in như WebRTC và
  chống fingerprint, cùng ngoại lệ theo từng trang);
- whitelist (các trang tắt chặn) và ngoại lệ tạm thời;
- bộ đếm chặn cục bộ hiển thị ở popup (theo tab và tổng), bạn xoá được bất cứ lúc nào;
- thông tin bản cập nhật danh sách filter gần nhất (phiên bản và thời điểm) để áp
  dụng cập nhật an toàn.

Bạn xoá được tất cả bằng cách xoá bộ đếm trong popup hoặc gỡ tiện ích.

### Tiện ích gọi mạng khi nào

Tiện ích tải **chỉ dữ liệu danh sách filter** (văn bản rule) từ nguồn cập nhật
khai báo trong code, theo lịch hoặc khi bạn bấm "Cập nhật". Các request này tải
file rule công khai, không gửi danh tính, lịch sử duyệt web hay thông tin trang.
Tiện ích chạy offline bằng rule đóng gói sẵn, nên cập nhật lỗi không làm mất chặn.

### Quyền và lý do

- **declarativeNetRequest / declarativeNetRequestFeedback** — chặn/chuyển hướng
  request quảng cáo, tracker, malware và đếm cục bộ số đã chặn.
- **storage** — lưu cài đặt, whitelist và bộ đếm nêu trên.
- **alarms** — làm mới danh sách filter theo lịch.
- **scripting** — chèn CSS cosmetic ẩn khung quảng cáo còn sót.
- **privacy** — áp dụng chính sách WebRTC khi bạn tự bật.
- **host permissions (`<all_urls>`)** — rule chặn phải áp dụng mọi trang mới hiệu
  quả; rule chạy ở tầng mạng của trình duyệt, không đọc hay gửi nội dung trang.

### Bên thứ ba

Tiện ích đóng gói danh sách filter của bên thứ ba dưới dạng **dữ liệu**; giấy phép
ghi ở `rules/README.md`. Không có code bên thứ ba chạy và không có SDK nào kèm theo.

### Thay đổi

Mọi thay đổi quan trọng của chính sách này sẽ được công bố cùng phiên bản mới và
ghi lại trong file này.

### Liên hệ

TODO(verify) — bổ sung liên hệ người bảo trì hoặc URL issue-tracker trước khi phát hành.
