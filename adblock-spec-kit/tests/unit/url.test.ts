import { describe, expect, it } from 'vitest';

import { domainFromUrl } from '../../src/popup/url';

describe('domainFromUrl', () => {
  it('returns the hostname (without the port) for http(s) pages', () => {
    expect(domainFromUrl('https://example.com/path?q=1#hash')).toBe('example.com');
    expect(domainFromUrl('http://localhost:8080/')).toBe('localhost');
    expect(domainFromUrl('https://sub.example.com:443/')).toBe('sub.example.com');
  });

  it('returns undefined for pages that cannot be whitelisted', () => {
    expect(domainFromUrl(undefined)).toBeUndefined();
    expect(domainFromUrl('')).toBeUndefined();
    expect(domainFromUrl('about:blank')).toBeUndefined();
    expect(domainFromUrl('chrome://extensions')).toBeUndefined();
    expect(domainFromUrl('chrome-extension://abc/src/popup/index.html')).toBeUndefined();
    expect(domainFromUrl('file:///tmp/index.html')).toBeUndefined();
    expect(domainFromUrl('not a url')).toBeUndefined();
  });
});
