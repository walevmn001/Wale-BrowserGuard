import { resolve } from 'node:path';

import { defineConfig } from 'vite';

/**
 * Second build pass that emits the MAIN-world YouTube engine as a single,
 * self-contained IIFE at `dist/youtube-main.js` (T0xx, Phase 2).
 *
 * The main `vite.config.ts` bundles ESM entries with shared chunks, which a
 * content script cannot load (no `import` in a classic content script at
 * `document_start`). This pass therefore uses the `iife` format with inlined
 * dynamic imports so the file is one plain script.
 *
 * `emptyOutDir` is false so this pass appends to `dist/` produced by the main
 * build; it is run *after* it (see `build` in `package.json`).
 *
 * The file is emitted but not yet registered: activation
 * (`chrome.scripting.registerContentScripts`) lands in the integration phase;
 * until then the engine has no runtime effect on the extension.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome120',
    minify: false,
    rollupOptions: {
      input: resolve(process.cwd(), 'src/youtube/main/content-entry.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'youtube-main.js',
        inlineDynamicImports: true,
      },
    },
  },
});
