# Kiểm thử

Trạng thái: **TESTED** cho engine Phase 1–3 (unit). Integration/regression/playback trên Chrome thật: **UNVERIFIED**.

## Thứ tự chạy mỗi lần cập nhật
1. Lint và kiểm tra phụ thuộc (`scripts/lint-deps.js`).
2. Manifest validation.
3. DNR rules validation (khớp `rules.js`, không chặn domain bảo vệ).
4. Unit test.
5. Integration test (checklist thủ công bên dưới).
6. Regression test R01 đến R18 (`spec.md` mục 11.18).
7. Playback preservation test (`spec.md` mục 11.19).
8. Build và kiểm tra artifact, nếu có.

## Baseline
Mỗi bản stable lưu kết quả vào `test/baseline/<version>.json`.

## Kết quả các lần chạy
| Ngày | Phiên bản | Bước | Kết quả | Môi trường | Ghi chú |
|------|-----------|------|---------|------------|---------|
| 2026-11-27 | WALE GUARD (engine Phase 1–3) | Unit test | 563 pass / 563 (50 file) | Node + vitest | Trong đó 14 file `tests/unit/youtube/*` là engine mới |
| 2026-11-27 | WALE GUARD (engine Phase 1–3) | Type check | pass | `tsc --noEmit` | |
| 2026-11-27 | WALE GUARD (engine Phase 1–3) | Build | pass | Vite | Sinh `dist/youtube-main.js` (25.08 kB, IIFE) |
| — | — | Integration / playback trên Chrome | Chưa chạy | — | UNVERIFIED |

### Bộ test engine mới (`tests/unit/youtube/`)
| File | Nội dung |
|------|----------|
| `flags.test.ts` | 12 cờ, all-or-nothing, cờ lạ, subscribe/dispose |
| `adapter-null.test.ts` | NullAdapter (name=`null`, count 0, không nhận snapshot) |
| `toggle-state.test.ts` | 7 quy tắc `resolveDisplay`, `WAITING_FOR_ADAPTER` |
| `json-pruner.test.ts` | Xóa khóa quảng cáo, bảo vệ khóa playback, giới hạn depth/keys |
| `ad-detector.test.ts` | Vote có trọng số, phân loại buffering/paused/ended/error |
| `ad-state-machine.test.ts` | Chuyển trạng thái, cooldown, maxAttempts, terminal |
| `audio-state-manager.test.ts` | Chỉ đổi `muted`, cờ `mutedByUs`, không đổi `volume` |
| `ad-action-controller.test.ts` | Chỉ seek khi duration hữu hạn, ưu tiên skip |
| `fetch-interceptor.test.ts` | Fail-open, giữ status/headers/url, không tiêu thụ body gốc |
| `xhr-interceptor.test.ts` | Không đổi responseType/status |
| `player-response-hook.test.ts` | Guard key, idempotent |
| `registry.test.ts` | Cô lập lỗi từng module, disposeAll |
| `architecture.test.ts` | World-independence: core/config/registry/adapter/state không chạm `window`/`document`/`chrome` |
| `registration.test.ts` | `syncEngineRegistration` idempotent, fail-open |

Lệnh: `npx vitest run tests/unit/youtube` (engine) hoặc `npx vitest run` (toàn bộ).

## Checklist thủ công
- [ ] Video thường phát được.
- [ ] Video có quảng cáo trước.
- [ ] Video có quảng cáo giữa.
- [ ] Chuyển video liên tục bằng SPA.
- [ ] Tắt từng module, các module khác vẫn chạy.

## Contract test của adapter (không cần T004)
- Chạy bằng adapter giả và `adapter-null`.
- Bảy mục theo `contracts/adapter.md` mục 7.
- Kết quả ghi trong bảng "Kết quả các lần chạy", kèm tên adapter.
