/**
 * URL helpers for the popup (T016).
 *
 * Kept in a module of its own with no side effects so the pure logic can be
 * unit-tested without a DOM or a browser.
 */

/**
 * The host to whitelist for a tab URL, or `undefined` when the page cannot be
 * whitelisted: browser pages, other extensions, `file:`, `data:` or malformed
 * URLs. `allowAllRequests` matches on the document's host, so the hostname
 * (without the port) is exactly what the whitelist needs.
 */
export function domainFromUrl(url: string | undefined): string | undefined {
  if (url === undefined) {
    return undefined;
  }
  try {
    const { protocol, hostname } = new URL(url);
    if ((protocol === 'http:' || protocol === 'https:') && hostname !== '') {
      return hostname;
    }
  } catch {
    // Not a parseable URL: there is nothing to whitelist.
  }
  return undefined;
}
