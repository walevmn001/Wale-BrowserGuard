/**
 * Localisation for the extension UI (spec §5: the interface ships in Vietnamese
 * and English).
 *
 * A small self-contained dictionary rather than `chrome.i18n`/`_locales`: the
 * messages stay type-checked (every locale must define every key) and the
 * look-up is pure, so it can be unit-tested without a browser. The caller reads
 * the browser UI language (`chrome.i18n.getUILanguage()`) and passes it in.
 */

export type Locale = 'vi' | 'en';

/** Locale used when the browser language is not one we ship. */
export const DEFAULT_LOCALE: Locale = 'vi';

const VI = {
  siteHeading: 'Trang hiện tại',
  siteNotApplicable: 'Không áp dụng cho trang này',
  siteBlockingOn: 'Đang chặn trên trang này',
  siteBlockingOff: 'Đã tắt chặn trên trang này',
  siteToggleBlock: 'Chặn trên trang này',
  statsHeading: 'Thống kê',
  statsSite: 'Trang này: {count} request đã chặn',
  statsTotal: 'Tổng cộng: {count}',
  statsClear: 'Xoá thống kê',
  masterHeading: 'Toàn bộ extension',
  masterOn: 'Extension đang bật',
  masterOff: 'Extension đang tắt',
  masterToggleOff: 'Tắt toàn bộ',
  masterToggleOn: 'Bật lại',
  optionsHeading: 'Tuỳ chọn',
  optionsListsHeading: 'Nhóm danh sách',
  optionsGroupAds: 'Quảng cáo',
  optionsGroupTrackers: 'Trình theo dõi',
  optionsGroupMalware: 'Trang độc hại',
  optionsGroupPrivacy: 'Riêng tư',
  optionsUpdatesHeading: 'Cập nhật danh sách',
  optionsUpdateNow: 'Cập nhật ngay',
  optionsUpdating: 'Đang cập nhật…',
  optionsUpdateOk: 'Đã cập nhật danh sách',
  optionsUpdateFailed: 'Cập nhật thất bại — giữ bộ rule cũ',
  optionsUpdatedAt: 'Cập nhật lần cuối: {time}',
  optionsNeverUpdated: 'Chưa cập nhật',
  optionsVersionHeading: 'Phiên bản',
  optionsVersion: 'Phiên bản: {version}',
  optionsDataRules: 'Dữ liệu: {rules} rule trong {groups} nhóm',
  warningHeading: 'Trang cảnh báo',
  warningMessage:
    'Trang này có thể chứa mã độc hoặc lừa đảo. Vì an toàn, AdBlock Security đã ngăn trang tải.',
  warningBlockedDomain: 'Miền bị chặn: {domain}',
  warningBack: 'Quay lại an toàn',
  warningContinue: 'Vẫn tiếp tục (10 phút)',
} as const;

/** Every translatable string. `EN` must cover exactly the same keys. */
export type MessageKey = keyof typeof VI;

const EN: Record<MessageKey, string> = {
  siteHeading: 'Current page',
  siteNotApplicable: 'Not available on this page',
  siteBlockingOn: 'Blocking on this page',
  siteBlockingOff: 'Blocking is off on this page',
  siteToggleBlock: 'Block on this page',
  statsHeading: 'Statistics',
  statsSite: 'This page: {count} blocked requests',
  statsTotal: 'Total: {count}',
  statsClear: 'Clear statistics',
  masterHeading: 'Whole extension',
  masterOn: 'Extension is on',
  masterOff: 'Extension is off',
  masterToggleOff: 'Turn everything off',
  masterToggleOn: 'Turn back on',
  optionsHeading: 'Options',
  optionsListsHeading: 'List groups',
  optionsGroupAds: 'Ads',
  optionsGroupTrackers: 'Trackers',
  optionsGroupMalware: 'Malware',
  optionsGroupPrivacy: 'Privacy',
  optionsUpdatesHeading: 'List updates',
  optionsUpdateNow: 'Update now',
  optionsUpdating: 'Updating…',
  optionsUpdateOk: 'Filter lists updated',
  optionsUpdateFailed: 'Update failed — keeping the previous set',
  optionsUpdatedAt: 'Last updated: {time}',
  optionsNeverUpdated: 'Never updated',
  optionsVersionHeading: 'Version',
  optionsVersion: 'Version: {version}',
  optionsDataRules: 'Data: {rules} rules in {groups} groups',
  warningHeading: 'Security warning',
  warningMessage:
    'This page may host malware or a phishing attempt. AdBlock Security stopped it from loading to keep you safe.',
  warningBlockedDomain: 'Blocked domain: {domain}',
  warningBack: 'Back to safety',
  warningContinue: 'Continue anyway (10 minutes)',
};

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { vi: VI, en: EN };

export type MessageParams = Readonly<Record<string, string | number>>;

export function isLocale(value: string): value is Locale {
  return value === 'vi' || value === 'en';
}

export function isMessageKey(value: string): value is MessageKey {
  return Object.prototype.hasOwnProperty.call(VI, value);
}

/**
 * Maps a browser UI language (`vi`, `vi-VN`, `en-US`, …) to a locale we ship,
 * falling back to {@link DEFAULT_LOCALE} for anything else.
 */
export function resolveLocale(uiLanguage: string | undefined): Locale {
  const base = uiLanguage?.toLowerCase().split('-')[0];
  return base !== undefined && isLocale(base) ? base : DEFAULT_LOCALE;
}

/** Looks up `key` and replaces `{name}` placeholders with `params`. */
export function t(key: MessageKey, locale: Locale, params?: MessageParams): string {
  const template = MESSAGES[locale][key];
  if (params === undefined) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}
