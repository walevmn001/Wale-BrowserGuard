/**
 * A-2 probe — MAIN world (verification only, T066).
 *
 * Records what the MAIN world can see of `chrome` / `chrome.storage`, and
 * whether calling `chrome.storage.sync.get` from MAIN works or throws.
 * Result is written to `window.__a2Probe` and read from the page DevTools
 * console AFTER the page has loaded (see verification/A-2-main-storage-access.md §4).
 *
 * It never claims a verdict: it only records raw observations. The human decides
 * VERIFIED / INCONSISTENT.
 */
(function () {
  'use strict';

  function navType() {
    try {
      var n = performance.getEntriesByType('navigation')[0];
      return n && n.type ? n.type : 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  var probe = {
    world: 'MAIN',
    url: location.href,
    t: performance.now(),
    readyState: document.readyState,
    navigationType: navType(),
    records: []
  };
  window.__a2Probe = probe;

  function describeError(e) {
    try {
      return String(e && e.message ? e.message : e);
    } catch (x) {
      return 'unknown-error';
    }
  }

  function takeSnapshot(label) {
    var rec = {
      label: label,
      url: location.href,
      t: performance.now(),
      readyState: document.readyState,
      // "typeof chrome" in MAIN (typeof never throws on an undeclared name)
      typeofChrome: (function () { try { return typeof chrome; } catch (e) { return 'threw:' + describeError(e); } })(),
      // "typeof chrome?.storage" in MAIN
      typeofChromeStorage: (function () {
        try {
          return typeof (window.chrome && window.chrome.storage);
        } catch (e) {
          return 'threw:' + describeError(e);
        }
      })(),
      storageSyncGet: { attempted: false, ok: false, error: null, value: null }
    };

    // Attempt chrome.storage.sync.get inside try/catch and record any error.
    try {
      var storage = window.chrome && window.chrome.storage;
      var sync = storage && storage.sync;
      if (sync && typeof sync.get === 'function') {
        rec.storageSyncGet.attempted = true;
        try {
          sync.get(['a2Marker'], function (items) {
            rec.storageSyncGet.ok = true;
            rec.storageSyncGet.value = items || null;
          });
        } catch (e) {
          rec.storageSyncGet.error = 'call-threw:' + describeError(e);
        }
      } else {
        rec.storageSyncGet.error = 'chrome.storage.sync.get is not available in MAIN';
      }
    } catch (e) {
      rec.storageSyncGet.error = 'access-threw:' + describeError(e);
    }

    probe.records.push(rec);
    return rec;
  }

  takeSnapshot('document_start');

  // SPA navigation reuses the same document, so a fresh full-load record is not
  // expected; record a second entry if YouTube signals an in-app navigation.
  try {
    window.addEventListener('yt-navigate-finish', function () {
      takeSnapshot('spa_navigate');
    });
  } catch (e) {
    /* ignore */
  }
})();
