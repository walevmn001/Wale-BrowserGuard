# Tương thích

Trạng thái: SPECIFIED (đặc tả); lớp nạp MAIN đã **IMPLEMENTED** nhưng **UNVERIFIED** trên Chrome thật.

- Nền tảng: Chrome Manifest V3.
- Phiên bản Chrome tối thiểu: 111 (cho `world: "MAIN"`, theo đặc tả). Chưa kiểm tra trên phiên bản thực tế.
- API đã dùng và trạng thái kiểm tra:
  - `chrome.scripting.registerContentScripts` (`world: 'MAIN'`, `runAt: 'document_start'`, `persistAcrossSessions: true`) — **IMPLEMENTED** trong `src/youtube/isolated/registration.ts`, chưa gọi từ worker, **UNVERIFIED** trên Chrome thật.
  - `declarativeNetRequest` — UNVERIFIED.
  - `chrome.storage.sync` — UNVERIFIED.
  - `XMLHttpRequest`, `fetch`, `Response`, `MutationObserver`, `HTMLMediaElement` (chuẩn Web, chưa kiểm tra trong extension này).
- Tương thích hai world: engine MAIN chỉ chạm biến toàn cục trang; phần logic dùng chung không chạm `window`/`document`/`chrome` (được kiểm bằng test).
- Ghi chú thay đổi Chrome: chưa có.
- Ghi chú thay đổi YouTube: chưa có bằng chứng.
