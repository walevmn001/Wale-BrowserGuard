/**
 * Manifest V3 background service worker entry point.
 *
 * T002: minimal bootstrap only. Network blocking, whitelist, stats and filter
 * updates are wired up in later tasks. This file must never keep meaningful
 * state in a module-level variable — MV3 can stop the worker at any time
 * (Constitution 14); state lives in `chrome.storage`.
 */
chrome.runtime.onInstalled.addListener(() => {
  console.info('[adblock] service worker installed');
});
