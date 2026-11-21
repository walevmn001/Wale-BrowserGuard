import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  buildZip,
  collectEntries,
  crc32,
  packageRelease,
  type ZipEntryInput,
} from '../../scripts/package-release';

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;

const entries: ZipEntryInput[] = [
  { name: 'manifest.json', data: Buffer.from('{"name":"adblock"}') },
  { name: 'rules/ads.json', data: Buffer.from('[]') },
];

describe('crc32', () => {
  it('matches the standard IEEE check value', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('is zero for empty input and stable across calls', () => {
    expect(crc32(Buffer.alloc(0))).toBe(0);
    expect(crc32(Buffer.from('repeat'))).toBe(crc32(Buffer.from('repeat')));
  });
});

describe('buildZip', () => {
  const zip = buildZip(entries);

  it('starts with a local file header and ends with the central directory record', () => {
    expect(zip.readUInt32LE(0)).toBe(LOCAL_SIGNATURE);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(END_SIGNATURE);
  });

  it('counts every entry in the end-of-central-directory record', () => {
    const end = zip.length - 22;
    expect(zip.readUInt16LE(end + 8)).toBe(entries.length);
    expect(zip.readUInt16LE(end + 10)).toBe(entries.length);
  });

  it('stores a deflated entry that inflates back to the original bytes', () => {
    const nameLength = zip.readUInt16LE(26);
    const compressedSize = zip.readUInt32LE(18);
    const size = zip.readUInt32LE(22);
    const name = zip.subarray(30, 30 + nameLength).toString('utf8');
    const data = zip.subarray(30 + nameLength, 30 + nameLength + compressedSize);

    expect(name).toBe('manifest.json');
    expect(size).toBe(entries[0]!.data.length);
    expect(zip.readUInt32LE(14)).toBe(crc32(entries[0]!.data));
    expect(inflateRawSync(data)).toEqual(entries[0]!.data);
  });

  it('records one central directory entry per file, at the end', () => {
    let cursor = 0;
    for (let index = 0; index < entries.length; index += 1) {
      cursor += 30 + zip.readUInt16LE(cursor + 26) + zip.readUInt32LE(cursor + 18);
    }
    expect(zip.readUInt32LE(cursor)).toBe(CENTRAL_SIGNATURE);
    const secondRecord = cursor + 46 + zip.readUInt16LE(cursor + 28);
    expect(zip.readUInt32LE(secondRecord)).toBe(CENTRAL_SIGNATURE);
  });

  it('is reproducible: same entries yield identical bytes', () => {
    expect(buildZip(entries).equals(buildZip(entries))).toBe(true);
  });
});

describe('collectEntries', () => {
  it('walks sub-directories, sorts by path and uses forward slashes', () => {
    const root = mkdtempSync(join(tmpdir(), 'adblock-pkg-'));
    try {
      mkdirSync(join(root, 'rules'));
      writeFileSync(join(root, 'manifest.json'), '{}');
      writeFileSync(join(root, 'rules', 'ads.json'), '[]');

      const collected = collectEntries(root);

      expect(collected.map((entry) => entry.name)).toEqual(['manifest.json', 'rules/ads.json']);
      expect(buildZip(collected).readUInt32LE(0)).toBe(LOCAL_SIGNATURE);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('packageRelease', () => {
  it('names the archive after the manifest version', () => {
    const dist = mkdtempSync(join(tmpdir(), 'adblock-dist-'));
    const release = mkdtempSync(join(tmpdir(), 'adblock-release-'));
    try {
      writeFileSync(join(dist, 'manifest.json'), JSON.stringify({ version: '9.9.9' }));

      const output = packageRelease({ distDir: dist, releaseDir: release });

      expect(output.endsWith('adblock-security-9.9.9.zip')).toBe(true);
    } finally {
      rmSync(dist, { recursive: true, force: true });
      rmSync(release, { recursive: true, force: true });
    }
  });

  it('fails clearly when the build has not run', () => {
    const missing = join(tmpdir(), 'adblock-missing-dist');
    expect(() => packageRelease({ distDir: missing })).toThrow(/run "npm run build"/);
  });
});
