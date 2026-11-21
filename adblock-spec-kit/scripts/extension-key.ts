/**
 * Fixed extension identity (T031).
 *
 * The malware ruleset redirects a blocked top-level navigation to the bundled
 * warning page and — unlike T030 — carries the blocked URL in the fragment so
 * the page can offer a temporary "continue anyway" pass (algorithm.md §F). A
 * DNR `regexSubstitution` must resolve to an absolute URL, so the redirect
 * target embeds the extension id, which means the id has to be *fixed*.
 *
 * Chrome derives the id from the manifest `key` (the base64 DER public key
 * below), so this module is the single source of truth shared by the manifest
 * (which ships the key) and the build (which bakes the redirect URL). Only the
 * public key ships: the matching private key is deliberately kept out of the
 * repository, because it is only needed to sign releases — regenerating it would
 * change the id and invalidate every baked redirect.
 */

import { createHash } from 'node:crypto';

/** Base64 DER (SubjectPublicKeyInfo) public key; fixes the extension id. */
export const EXTENSION_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvE8D+W0VTgRN0vRdt/1dhoreWY3kt0iKPxJag98QFUQwfjFkTfoHe3h1GhudDYMTNEW07f4rqkwZ26sYip4/VAMc5VafBIFWyc94oxlrPdTI9AFyC/E3IRvG4a2ZgBMc9+Q4gxevNTm0GE0p7p+J8R/EVQMqx0DGAHqmdVa9K0ZYNbS/tSwJ1Nu4cw5lF+h/SoYIKaf7s4T8uKXIBaX1XzPiCCrb11XqfB9IOU/S6I6vg6W9z4LkzoRdkhUoX8jDKMqRUtIWhlkP2nq7+cWYt0x+qfTvjv6zs2g2bbtxiBIQKiT2B0HhYBfITszNB/diZ0ZMrD9YBcZAw/WXX9BxRQIDAQAB';

/**
 * Chrome's extension id: the SHA-256 of the DER public key, first 16 bytes,
 * each nibble mapped to a letter `a`-`p` (32 characters total).
 */
export function extensionIdFromKey(keyBase64: string): string {
  const digest = createHash('sha256').update(Buffer.from(keyBase64, 'base64')).digest();
  let id = '';
  for (const byte of digest.subarray(0, 16)) {
    id += String.fromCharCode(97 + (byte >> 4), 97 + (byte & 0x0f));
  }
  return id;
}

/** The id Chrome will assign the extension, derived from {@link EXTENSION_KEY}. */
export const EXTENSION_ID = extensionIdFromKey(EXTENSION_KEY);
