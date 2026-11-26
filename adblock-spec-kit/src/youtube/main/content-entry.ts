/**
 * MAIN-world content-script entry for the rebuilt YouTube engine.
 *
 * This is the file a `chrome.scripting.registerContentScripts` registration
 * (`world: 'MAIN'`, `runAt: 'document_start'`) loads into a YouTube page. It is
 * bundled as a self-contained IIFE (see `vite.youtube.config.ts`) because a
 * content script cannot use ESM `import` at document_start.
 *
 * The whole entry is a single fail-open call: `bootYouTubeEngine` never throws
 * into the page, and if it returns `undefined` the page simply keeps its own
 * behaviour (Constitution III, VIII — playback first).
 */

import { bootYouTubeEngine } from './main';

bootYouTubeEngine();
