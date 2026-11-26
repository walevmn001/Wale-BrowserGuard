# Nguyên tắc dự án: YT Ad Shield

## I. Phạm vi và nền tảng
- Chỉ dùng Chrome Extension Manifest V3. Không dùng Manifest V2 hay API đã bị loại bỏ.
- Chỉ hoạt động trên `*.youtube.com`. Không can thiệp vào trang web khác.
- Mã nguồn thuần JavaScript, không dùng bundler, không dùng framework. Mọi file đều đọc được trực tiếp.

## II. Quyền riêng tư và an toàn
- Không thu thập, không ghi log và không gửi dữ liệu người dùng ra bên ngoài.
- Không gọi mạng từ extension. Mọi request chỉ đi qua trình duyệt như bình thường.
- Không lưu lịch sử xem. `chrome.storage` chỉ lưu cấu hình bật/tắt từng lớp.
- Quyền được khai báo ở mức tối thiểu. Mỗi quyền mới phải được ghi lý do trong `plan.md`.

## III. Nguyên tắc fail-open
- Khi lỗi xảy ra trong bất kỳ lớp nào, trang YouTube phải tiếp tục hoạt động bình thường.
- Response gốc luôn được trả lại nếu việc lọc thất bại (parse lỗi, không phải JSON, lỗi runtime).
- Không bao giờ ném lỗi chưa xử lý ra ngoài content script.

## IV. Cấu hình và giá trị phụ thuộc phiên bản
- Mọi selector, khóa JSON, tên class và endpoint nằm trong một file cấu hình duy nhất: `src/config/selectors.js`.
- Mỗi mục trong file cấu hình ghi ngày kiểm tra gần nhất và phiên bản YouTube đã kiểm tra (nếu biết).
- Không được hardcode selector trong logic. Không được tự bịa selector mà không ghi chú là chưa xác minh.

## V. Tách lớp và có thể tắt từng lớp
- Bốn lớp (lọc dữ liệu, chặn request, xử lý runtime, ẩn CSS) độc lập về logic.
- Mỗi lớp đọc cờ bật/tắt từ `chrome.storage` và có thể tắt riêng mà không ảnh hưởng lớp khác.
- Không lớp nào được phụ thuộc vào việc lớp khác đã chạy.

## VI. Chất lượng mã
- Hàm lọc dữ liệu là hàm thuần, nhận đầu vào và trả đầu ra, không đụng DOM hay `window`. Nhờ vậy có thể test độc lập.
- Có giới hạn độ sâu và số phần tử khi duyệt cây JSON để tránh vòng lặp vô hạn.
- Comment chỉ dùng để giải thích ràng buộc không hiển nhiên. Không comment lại những gì code đã nói rõ.

## VII. Trung thực về trạng thái
- README và báo cáo bàn giao phải ghi rõ những gì đã kiểm tra thực tế trong trình duyệt và những gì chưa kiểm tra.
- Không khẳng định hiệu quả chặn quảng cáo khi chưa có kết quả kiểm tra.

## VIII. Bảo toàn playback
- Playback bình thường luôn được ưu tiên trên tỷ lệ chặn quảng cáo.
- Mọi can thiệp lên player, response hoặc request chỉ được thực hiện khi có bằng chứng quảng cáo đã xác nhận hoặc playback đã bị treo.
- Khi không chắc chắn, không can thiệp và ghi log.

## IX. Trạng thái có bằng chứng
- Mỗi hạng mục chỉ được gắn IMPLEMENTED, TESTED hoặc VERIFIED khi có bằng chứng tương ứng được ghi trong `status.md`.
- API ngoài chuẩn Web và Chrome MV3, và các sự kiện hay selector riêng của YouTube, phải được đánh dấu UNVERIFIED cho đến khi xác minh.
- Mọi con số ngưỡng trong đặc tả là giá trị đề xuất, phải đưa vào cấu hình và ghi chú chưa đo.

## X. Module có quyền rõ ràng
- Chỉ một module (Ad Action Controller) được thực thi thao tác lên video và nút quảng cáo.
- Module đọc trạng thái không được ghi vào player.
- Mọi module có error boundary, có thể vô hiệu hóa riêng, và có hàm cleanup đăng ký với Lifecycle Manager.

## XI. Module độc lập và cấu hình tập trung
- Mỗi chức năng là một module có interface và trách nhiệm rõ ràng. Module không import trực tiếp ruột của module khác, chỉ dùng interface đã khai báo.
- Không có vòng phụ thuộc (circular dependency). Kiểm tra bằng script trong bước lint.
- Mọi giá trị ngưỡng, timeout, cooldown, giới hạn và cờ bật/tắt nằm trong thư mục `src/config/`. Không hardcode rải rác.
- Selector, endpoint và domain quảng cáo chỉ được định nghĩa trong registry tương ứng (`selectors.js`, `endpoints.js`, `rules.js`).

## XII. Phiên bản và tương thích
- Extension, schema cấu hình và từng registry đều có version riêng.
- Thay đổi schema cấu hình phải đi kèm hàm migration thuần và test migration.
- Không phụ thuộc cứng vào một phiên bản DOM hay cấu trúc YouTube. Khi không chắc chắn, ưu tiên không can thiệp.

## XIII. Cập nhật an toàn và có khả năng hoàn tác
- Mỗi thay đổi có changelog, nêu module bị ảnh hưởng và nguyên nhân.
- Không đưa cấu hình, selector hoặc rule chặn mới vào bản phát hành nếu chưa qua unit, integration, regression và playback preservation test.
- Mỗi bản phát hành có Git tag ổn định. Phải có khả năng quay về tag ổn định trước đó.
- Không mở rộng phạm vi chặn (domain, đường dẫn, resource type) khi chưa có bằng chứng xác minh.

## XIV. Quyết định mở không chặn kiến trúc
- Một quyết định chưa chốt (ví dụ T004) không được chặn việc viết registry, config, module logic hay test.
- Quyết định mở phải được cô lập sau một contract (adapter, interface) với một triển khai tạm rõ ràng (ví dụ NullAdapter), và phải liệt kê giả định và phụ thuộc.
- Khi chốt, chỉ thay phần được cô lập. Không sửa phần còn lại.

## XV. Hành vi hiển thị phải phản ánh trạng thái thật
- UI không được báo "đã áp dụng" hay "thành công" cho một thiết lập chưa được runtime xác nhận.
- Lưu một lựa chọn (desiredState) khác với áp dụng nó (effectiveState). UI phải hiển thị cả hai khi chúng khác nhau.
- Mọi giả định về nền tảng (ví dụ A-2, A-4) phải có thủ tục đo và chỉ được VERIFIED khi có kết quả thử nghiệm ghi lại đủ điều kiện.
