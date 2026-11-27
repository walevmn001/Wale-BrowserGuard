/**
 * A-2 probe — ISOLATED world (verification only, T066).
 *
 * Confirms that the ISOLATED world DOES have `chrome.storage`, and writes a
 * marker value into `chrome.storage.sync` so the MAIN-side read can be
 * cross-checked (see verification/A-2-main-storage-access.md §3–§4).
 *
 * Its own observations live on `window.__a2ProbeIsolated` in the ISOLATED
 * context, and are also mirrored onto `document.documentElement.dataset`
 * (the DOM is shared across worlds) so they can be read from the page console.
 */
(function () {
  'use strict';

  var result = {
    world: 'ISOLATED',
    url: location.href,
    t: performance.now(),
    readyState: document.readyState,
    typeofChrome: (function () { try { return typeof chrome; } catch (e) { return 'threw:' + e; } })(),
    typeofChromeStorage: (function () { try { return typeof chrome.storage; } catch (e) { return 'threw:' + e; } })(),
    wroteMarker: false,
    error: null
  };
  window.__a2ProbeIsolated = result;

  function mirror() {
    try {
      document.documentElement.dataset.a2IsolatedProbe = JSON.stringify(result);
    } catch (e) {
      /* ignore */
    }
  }

  mirror();

  // Write the marker from ISOLATED (callback form: lastError is read inside the
  // callback so Chrome does not warn about an unchecked runtime.lastError).
  try {
    var marker = { setBy: 'ISOLATED', at: Date.now(), url: location.href };
    chrome.storage.sync.set({ a2Marker: marker }, function () {
      if (chrome.runtime && chrome.runtime.lastError) {
        result.error = chrome.runtime.lastError.message;
      } else {
        result.wroteMarker = true;
      }
      mirror();
    });
  } catch (e) {
    result.error = String(e && e.message ? e.message : e);
    mirror();
  }
})();
