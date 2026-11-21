import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, resolveLocale, t } from '../../src/shared/i18n';

describe('resolveLocale', () => {
  it('maps a browser language to a locale we ship', () => {
    expect(resolveLocale('vi')).toBe('vi');
    expect(resolveLocale('vi-VN')).toBe('vi');
    expect(resolveLocale('VI-vn')).toBe('vi');
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('en-US')).toBe('en');
  });

  it('falls back to the default locale for unsupported or missing languages', () => {
    expect(resolveLocale('fr-FR')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
  });
});

describe('t', () => {
  it('returns the message for the requested locale', () => {
    expect(t('siteHeading', 'vi')).toBe('Trang hiện tại');
    expect(t('siteHeading', 'en')).toBe('Current page');
  });

  it('interpolates {placeholders}', () => {
    expect(t('statsTotal', 'vi', { count: 3 })).toBe('Tổng cộng: 3');
    expect(t('statsTotal', 'en', { count: 3 })).toBe('Total: 3');
  });

  it('leaves placeholders without a matching param untouched', () => {
    expect(t('statsSite', 'en', { other: 1 })).toBe('This page: {count} blocked requests');
  });
});
