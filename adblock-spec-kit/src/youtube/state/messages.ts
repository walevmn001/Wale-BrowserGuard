/**
 * Popup display strings for the YouTube engine (Phase 6 — T070).
 *
 * The popup-state contract fixes one mandatory Vietnamese message per display
 * state (`contracts/popup-state.md` §4). This module is their single home, plus
 * the short labels and the forbidden-phrase guard the contract requires: while
 * a MAIN-world layer is `WAITING_FOR_ADAPTER`, its text must never claim the
 * switch was applied — "đã tắt", "đã cập nhật", "thành công", "đã áp dụng".
 *
 * Pure data + pure functions: no page or extension globals (architecture test).
 * The messages are Vietnamese by contract and are shown as-is in every locale.
 */

import type { DisplayState } from './toggle-state';

/** Short label per display state (contract §4, "Nhãn"). */
export const DISPLAY_LABELS: Readonly<Record<DisplayState, string>> = {
  ENABLED: 'Đang bật',
  DISABLED: 'Đã tắt',
  WAITING_FOR_REGISTRATION: 'Chờ đăng ký',
  WAITING_FOR_ADAPTER: 'Chờ adapter',
  INITIALIZING: 'Đang khởi tạo',
  RECONCILING: 'Đang áp dụng',
  ERROR: 'Lỗi',
  UNKNOWN: 'Chưa rõ',
};

/**
 * The mandatory message per display state (contract §4). For `ERROR` the
 * caller passes a human reason (`{reason}`); a missing reason falls back to a
 * neutral phrase rather than claiming success.
 */
export function displayMessage(state: DisplayState, reason?: string): string {
  switch (state) {
    case 'ENABLED':
      return 'Đang hoạt động trong trang.';
    case 'DISABLED':
      return 'Đã tắt trong trang.';
    case 'WAITING_FOR_REGISTRATION':
      return 'Module YouTube chưa được đăng ký cho tab này, nên lựa chọn của bạn chưa được áp dụng.';
    case 'WAITING_FOR_ADAPTER':
      return 'Hook đang chạy theo mặc định: bật. Cơ chế truyền cờ chưa hoàn tất, nên lựa chọn tắt/bật của bạn chưa được áp dụng.';
    case 'INITIALIZING':
      return 'Trang đang khởi tạo hook. Chưa có xác nhận từ trang cho lớp này.';
    case 'RECONCILING':
      return 'Đã gửi cấu hình mới sang trang. Đang chờ xác nhận.';
    case 'ERROR':
      return `Không áp dụng được. Lý do: ${reason ?? 'không xác định'}.`;
    case 'UNKNOWN':
      return 'Chưa nhận được xác nhận từ trang. Tải lại trang để cập nhật trạng thái.';
    default:
      return 'Chưa nhận được xác nhận từ trang. Tải lại trang để cập nhật trạng thái.';
  }
}

/**
 * Phrases a MAIN-world layer must never use while waiting for the adapter
 * (contract §4). Kept lowercase; the guard compares case-insensitively.
 */
export const FORBIDDEN_MAIN_PHRASES: readonly string[] = [
  'đã tắt',
  'đã cập nhật',
  'thành công',
  'đã áp dụng',
];

/** True when `text` contains a phrase forbidden for a MAIN flag (§4). */
export function hasForbiddenMainPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_MAIN_PHRASES.some((phrase) => lower.includes(phrase));
}

/** Shown after the user saves a choice for a MAIN layer (contract §5.1). */
export const WAITING_SAVED_NOTE =
  'Đã lưu lựa chọn. Lựa chọn này chưa được áp dụng vì cơ chế truyền cờ chưa hoàn tất.';

/** Shown for every layer switch: a saved change applies on the next load (§1). */
export const RELOAD_NOTE = 'Có hiệu lực sau khi tải lại trang.';
