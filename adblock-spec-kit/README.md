# AdBlock Security Extension

Extension Manifest V3 chặn quảng cáo, tracker và site độc hại mà không làm vỡ trang, không thu thập dữ liệu người dùng. Viết bằng TypeScript.

## Tài liệu

- [Chính sách riêng tư](docs/privacy-policy.md) — không thu thập dữ liệu, chỉ lưu cục bộ.
- [Mô tả store](docs/store-listing.md) — nội dung niêm yết Chrome Web Store (vi/en) + lý do từng quyền.
- [Changelog](CHANGELOG.md) — lịch sử thay đổi theo Keep a Changelog / SemVer.
- [Giấy phép](LICENSE) — MIT.

## Cấu trúc

```
src/            mã nguồn (background, content, options, popup, shared, warning)
scripts/        build & sinh rules (DNR, cosmetic, youtube, privacy, malware)
rules/source/   nguồn luật lọc (ads, cosmetic, malware, trackers)
data/           dữ liệu cấu hình (youtube-config.json)
ui/             HTML/CSS tĩnh dùng cho build
tests/          unit (vitest) · e2e (playwright) · golden
docs/           tài liệu phát hành
```

## Lệnh

```
npm ci              # cài phụ thuộc
npm run build       # typecheck + vite build
npm test            # unit test (vitest)
npm run test:e2e    # e2e (playwright)
npm run lint
```

## Nguyên tắc

- Không có spec thì không code. Không có test thì không merge.
- Không đoán API: đối chiếu tài liệu chính thức Chrome/Firefox Extensions.
- Ưu tiên "chặn thiếu" hơn "chặn nhầm" (không làm vỡ trang).
