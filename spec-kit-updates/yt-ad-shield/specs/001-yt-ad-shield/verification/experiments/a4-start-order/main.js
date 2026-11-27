/**
 * A-4 instrumentation — MAIN world (verification only, T067).
 *
 * Records the events defined in verification/A-4-document-start-order.md §3,
 * each as { seq, world, event, t, readyState, navigationType } (plus an optional
 * `detail`). The MAIN-side log is `window.__a4Log` and is read from the page
 * DevTools console AFTER the page has loaded.
 *
 * Measurement constraints (from the procedure): it must NOT call the real fetch,
 * must NOT change the hook install order, and must NOT await anything that would
 * shift event timing. Everything here is synchronous and fail-open.
 *
 * The ISOLATED world mirrors its own records onto
 * `document.documentElement.dataset.a4Isolated`; a MutationObserver (set up
 * AFTER the hooks, so it cannot perturb their order) copies them into
 * `window.__a4Log.isolated` so both worlds can be compared from one console.
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

  var log = {
    navType: navType(),
    url: location.href,
    seq: 0,
    main: [],
    isolated: []
  };
  window.__a4Log = log;

  function rec(event, detail) {
    log.main.push({
      seq: ++log.seq,
      world: 'MAIN',
      event: event,
      t: performance.now(),
      readyState: document.readyState,
      navigationType: log.navType,
      detail: detail === undefined ? null : detail
    });
  }

  rec('script_start');

  // Q3: is the flags snapshot (an attribute written by ISOLATED) already present
  // at the moment MAIN starts, i.e. before the hooks below install?
  var snapshotPresent = false;
  try {
    snapshotPresent = document.documentElement.dataset.yasLayers !== undefined;
  } catch (e) {
    /* ignore */
  }
  rec('snapshot_available', { present: snapshotPresent });

  // Q4a: install the ytInitialPlayerResponse accessor and detect YouTube's FIRST
  // read. Mirrors the production technique (configurable accessor, fail-open).
  try {
    var KEY = 'ytInitialPlayerResponse';
    var stored = window[KEY];
    var firstRead = false;
    Object.defineProperty(window, KEY, {
      configurable: true,
      enumerable: true,
      get: function () {
        if (!firstRead) {
          firstRead = true;
          rec('youtube_read_initial_response');
        }
        return stored;
      },
      set: function (next) {
        stored = next;
      }
    });
    rec('hook_installed_initialresponse');
  } catch (e) {
    rec('hook_install_failed_initialresponse', { error: String(e && e.message ? e.message : e) });
  }

  // Q4b: install a pass-through fetch wrapper (records install timing only; it
  // never consumes or rewrites the response).
  try {
    var nativeFetch = window.fetch;
    if (typeof nativeFetch === 'function') {
      window.fetch = function (input, init) {
        return nativeFetch.call(window, input, init);
      };
      rec('hook_installed_fetch');
    } else {
      rec('hook_install_skipped_fetch', { reason: 'no native fetch' });
    }
  } catch (e) {
    rec('hook_install_failed_fetch', { error: String(e && e.message ? e.message : e) });
  }

  // Q2: SPA navigation reuses the document, so the scripts do not re-run; record
  // the in-app navigation so the SPA row can be interpreted.
  try {
    window.addEventListener('yt-navigate-finish', function () {
      rec('spa_navigate');
    });
  } catch (e) {
    /* ignore */
  }

  // Merge the ISOLATED world's records (mirrored on the shared DOM) into the log.
  try {
    var pull = function () {
      try {
        var raw = document.documentElement.dataset.a4Isolated;
        if (raw) {
          log.isolated = JSON.parse(raw);
        }
      } catch (e) {
        /* ignore */
      }
    };
    pull();
    var observer = new MutationObserver(pull);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-a4-isolated']
    });
  } catch (e) {
    /* ignore: the raw attribute is still readable manually */
  }
})();
