/**
 * i18n coverage guard (Phase 11).
 *
 * The compiler already forces `en.ts` to mirror `vi.ts`, but nothing stops a
 * component from asking for a key that does not exist — `applyStaticText` and
 * `t()` both fall back silently. These tests close that hole by scanning the
 * real markup and scripts:
 *   1. every `data-i18n*` attribute in an HTML entry names a real key;
 *   2. every literal `t('key'` call in `src/` names a real key;
 *   3. neither locale leaves a string empty (an "untranslated" placeholder).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EN, VI, isMessageKey } from '../../src/shared/i18n';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(ROOT, 'src');

/** The translation attributes the two `applyStaticText` implementations honour. */
const I18N_ATTRS = [
  'data-i18n',
  'data-i18n-title',
  'data-i18n-placeholder',
  'data-i18n-aria-label',
] as const;

/** Recursively lists every file under `dir`. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

/** Every value of a `data-i18n*` attribute in one HTML document. */
function markupKeys(html: string): string[] {
  const keys: string[] = [];
  for (const attr of I18N_ATTRS) {
    const pattern = new RegExp(`${attr}="([^"]+)"`, 'g');
    for (const match of html.matchAll(pattern)) {
      const value = match[1];
      if (value !== undefined) {
        keys.push(value);
      }
    }
  }
  return keys;
}

/** Every literal first argument of a `t('…')` call in one source file. */
function literalKeys(source: string): string[] {
  const keys: string[] = [];
  for (const match of source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) {
    const value = match[1];
    if (value !== undefined) {
      keys.push(value);
    }
  }
  return keys;
}

describe('i18n coverage', () => {
  it('every data-i18n* attribute in the markup names a real key', () => {
    const files = walk(SRC).filter((file) => file.endsWith('.html'));
    expect(files.length).toBeGreaterThan(0);

    const missing: string[] = [];
    let seen = 0;
    for (const file of files) {
      for (const key of markupKeys(readFileSync(file, 'utf8'))) {
        seen += 1;
        if (!isMessageKey(key)) {
          missing.push(`${relative(ROOT, file)}: ${key}`);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('every literal t() key used in src/ names a real key', () => {
    const files = walk(SRC).filter((file) => file.endsWith('.ts') && !file.includes('/i18n/'));

    const missing: string[] = [];
    let seen = 0;
    for (const file of files) {
      for (const key of literalKeys(readFileSync(file, 'utf8'))) {
        seen += 1;
        if (!isMessageKey(key)) {
          missing.push(`${relative(ROOT, file)}: ${key}`);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('neither locale leaves a string empty or whitespace-only', () => {
    for (const [locale, dict] of [
      ['vi', VI],
      ['en', EN],
    ] as const) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `${locale}.${key} must be translated`).not.toBe('');
      }
    }
  });

  it('the two locales define exactly the same keys', () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(VI).sort());
  });
});
