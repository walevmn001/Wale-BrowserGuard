/**
 * Packages the built extension in `dist/` into a release ZIP (T043).
 *
 * The Chrome Web Store and manual "Load unpacked" review take a ZIP whose root
 * holds `manifest.json`, so we archive the *contents* of `dist/`. The archive
 * is written here instead of shelling out to `zip` so packaging stays
 * dependency-free (plan.md §6): only `node:zlib` and the ZIP container format
 * are used. Dates are pinned to 1980-01-01 and entries are sorted, so the same
 * `dist/` always yields a byte-for-byte identical archive.
 *
 * Wired into the build as a Vite plugin (`releasePlugin`), active only under
 * `--mode release` (`npm run package`), so a plain `npm run build` stays
 * unchanged. The plugin is applied on the *last* build pass (the ISOLATED engine
 * bundle) so the ZIP is always written after every pass has emitted into
 * `dist/` — packaging on an earlier pass would ship a ZIP missing the engine
 * bundles that later passes add.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';

import type { Plugin } from 'vite';

export interface ZipEntryInput {
  readonly name: string;
  readonly data: Buffer;
}

export interface PackageOptions {
  readonly distDir?: string;
  readonly releaseDir?: string;
}

/** Fixed 1980-01-01 DOS date so archives are reproducible. */
const DOS_DATE = 0x0021;
const LOCAL_HEADER_SIZE = 30;
const CENTRAL_RECORD_SIZE = 46;
const END_RECORD_SIZE = 22;

/** Standard CRC-32 (IEEE 802.3) lookup table. */
function crc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let bit = 0; bit < 8; bit += 1) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = crc32Table();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Every file under `root`, recursively, as absolute paths (sorted). */
function walk(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(path));
    } else if (entry.isFile()) {
      found.push(path);
    }
  }
  return found;
}

/** Reads every file under `distDir` as a ZIP-ready entry with `/`-joined names. */
export function collectEntries(distDir: string): ZipEntryInput[] {
  return walk(distDir)
    .sort()
    .map((path) => ({
      name: relative(distDir, path).split(sep).join('/'),
      data: readFileSync(path),
    }));
}

function localHeader(
  nameLength: number,
  crc: number,
  compressedSize: number,
  size: number,
): Buffer {
  const header = Buffer.alloc(LOCAL_HEADER_SIZE);
  header.writeUInt32LE(0x04034b50, 0); // local file header signature
  header.writeUInt16LE(20, 4); // version needed to extract
  header.writeUInt16LE(0x0800, 6); // general purpose flags: UTF-8 filename
  header.writeUInt16LE(8, 8); // compression method: deflate
  header.writeUInt16LE(0, 10); // last modification time
  header.writeUInt16LE(DOS_DATE, 12); // last modification date
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressedSize, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(nameLength, 26);
  header.writeUInt16LE(0, 28); // extra field length
  return header;
}

function centralRecord(
  name: Buffer,
  crc: number,
  compressedSize: number,
  size: number,
  offset: number,
): Buffer {
  const record = Buffer.alloc(CENTRAL_RECORD_SIZE);
  record.writeUInt32LE(0x02014b50, 0); // central directory header signature
  record.writeUInt16LE(20, 4); // version made by
  record.writeUInt16LE(20, 6); // version needed to extract
  record.writeUInt16LE(0x0800, 8);
  record.writeUInt16LE(8, 10);
  record.writeUInt16LE(0, 12);
  record.writeUInt16LE(DOS_DATE, 14);
  record.writeUInt32LE(crc, 16);
  record.writeUInt32LE(compressedSize, 20);
  record.writeUInt32LE(size, 24);
  record.writeUInt16LE(name.length, 28);
  record.writeUInt16LE(0, 30); // extra field length
  record.writeUInt16LE(0, 32); // file comment length
  record.writeUInt16LE(0, 34); // disk number start
  record.writeUInt16LE(0, 36); // internal file attributes
  record.writeUInt32LE(0, 38); // external file attributes
  record.writeUInt32LE(offset, 42); // offset of local header
  return record;
}

function endRecord(count: number, directorySize: number, directoryOffset: number): Buffer {
  const end = Buffer.alloc(END_RECORD_SIZE);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(0, 4); // number of this disk
  end.writeUInt16LE(0, 6); // disk with the central directory
  end.writeUInt16LE(count, 8); // entries on this disk
  end.writeUInt16LE(count, 10); // total entries
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(directoryOffset, 16);
  end.writeUInt16LE(0, 20); // comment length
  return end;
}

/** Builds a deflate ZIP archive from the given entries. */
export function buildZip(entries: readonly ZipEntryInput[]): Buffer {
  const body: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const compressed = deflateRawSync(entry.data);
    body.push(
      localHeader(name.length, crc, compressed.length, entry.data.length),
      name,
      compressed,
    );
    central.push(centralRecord(name, crc, compressed.length, entry.data.length, offset), name);
    offset += LOCAL_HEADER_SIZE + name.length + compressed.length;
  }

  const directory = Buffer.concat(central);
  return Buffer.concat([...body, directory, endRecord(entries.length, directory.length, offset)]);
}

/** Reads `distDir/manifest.json`, failing loudly when the build has not run. */
function manifestVersion(distDir: string): string {
  const path = join(distDir, 'manifest.json');
  if (!existsSync(path)) {
    throw new Error(`no ${path} — run "npm run build" first`);
  }
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { version?: string };
  return manifest.version ?? '0.0.0';
}

/**
 * Zips `distDir` into `releaseDir/adblock-security-<version>.zip` and returns
 * the archive path.
 */
export function packageRelease(options: PackageOptions = {}): string {
  const distDir = options.distDir ?? 'dist';
  const releaseDir = options.releaseDir ?? 'release';
  const version = manifestVersion(distDir);
  const entries = collectEntries(distDir);
  const zip = buildZip(entries);
  mkdirSync(releaseDir, { recursive: true });
  const output = join(releaseDir, `adblock-security-${version}.zip`);
  writeFileSync(output, zip);
  return output;
}

/**
 * Vite plugin that zips `dist/` once a build pass finishes. Applied only on the
 * final build pass under `--mode release`, so every earlier pass's output is
 * already on disk when the archive is written.
 */
export function releasePlugin(): Plugin {
  return {
    name: 'adblock-emit-release',
    apply: 'build',
    closeBundle() {
      console.info(`[adblock] release -> ${packageRelease()}`);
    },
  };
}
