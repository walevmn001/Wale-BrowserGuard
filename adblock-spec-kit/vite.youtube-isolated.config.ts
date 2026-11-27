import { resolve } from 'node:path';

import { defineConfig } from 'vite';

import { releasePlugin } from './scripts/package-release.ts';

/**
 * Third (final) build pass: emits the ISOLATED-world companion of the rebuilt
 * YouTube engine as a single self-contained IIFE at `dist/youtube-isolated.js`.
 *
 * Its only job is to bridge the extension's sync settings to the page: it reads
 * the user's per-layer choice and publishes the flag snapshot onto the shared
 * root-element attribute the MAIN engine reads (the T004 dataset transport). It
 * is bundled as an IIFE for the same reason as `youtube-main.js` — a content
 * script cannot use ESM `import` at `document_start`.
 *
 * `emptyOutDir` is false so this pass appends to the `dist/` the two earlier
 * passes produced; it is run last (see `build` in `package.json`). Because it is
 * the last pass, the release ZIP plugin is attached here (under `--mode release`)
 * so the archive is written only after every pass has emitted its output.
 */
export default defineConfig(({ mode }) => ({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome120',
    minify: false,
    rollupOptions: {
      input: resolve(process.cwd(), 'src/youtube/isolated/content-entry.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'youtube-isolated.js',
        inlineDynamicImports: true,
      },
    },
  },
  plugins: mode === 'release' ? [releasePlugin()] : [],
}));
