/**
 * A-4 instrumentation — ISOLATED world (verification only, T067).
 *
 * Records script_start, storage_read_done and attribute_written per
 * verification/A-4-document-start-order.md §3, and mirrors them onto
 * `document.documentElement.dataset.a4Isolated` (the DOM is shared across
 * worlds) so the MAIN-side log can merge them.
 *
 * Snapshot toggle (matches §4.6 — "có snapshot" vs "không snapshot"):
 *   - WITH snapshot   : chrome.storage.sync has { a4SnapshotWrite: true }
 *                       -> ISOLATED writes the flags attribute (attribute_written).
 *   - WITHOUT snapshot: storage is empty / flag absent
 *                       -> ISOLATED does not write the attribute.
 * Set it from any page's DevTools (ISOLATED context) or the extension's service
 * worker console:
 *   chrome.storage.sync.set({ a4SnapshotWrite: true });
 *   chrome.storage.sync.remove('a4SnapshotWrite');
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

  var store = { world: 'ISOLATED', navType: navType(), seq: 0, records: [] };
  window.__a4LogIsolated = store;

  function mirror() {
    try {
      document.documentElement.dataset.a4Isolated = JSON.stringify(store.records);
    } catch (e) {
      /* ignore */
    }
  }

  function push(event, detail) {
    store.records.push({
      seq: ++store.seq,
      world: 'ISOLATED',
      event: event,
      t: performance.now(),
      readyState: document.readyState,
      navigationType: store.navType,
      detail: detail === undefined ? null : detail
    });
    mirror();
  }

  push('script_start');

  try {
    chrome.storage.sync.get('a4SnapshotWrite', function (items) {
      if (chrome.runtime && chrome.runtime.lastError) {
        push('storage_read_done', { error: chrome.runtime.lastError.message });
        return;
      }
      var writeSnapshot = !!(items && items.a4SnapshotWrite);
      push('storage_read_done', { writeSnapshot: writeSnapshot });
      if (writeSnapshot) {
        try {
          document.documentElement.dataset.yasLayers = JSON.stringify({ present: true, at: Date.now() });
          push('attribute_written');
        } catch (e) {
          push('attribute_write_failed', { error: String(e && e.message ? e.message : e) });
        }
      }
    });
  } catch (e) {
    push('storage_read_failed', { error: String(e && e.message ? e.message : e) });
  }
})();
