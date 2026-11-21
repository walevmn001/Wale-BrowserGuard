import { defineConfig, type Plugin } from 'vite';

import { createManifest } from './manifest.config.ts';

/**
 * Emits `dist/manifest.json` from `manifest.config.ts` so the manifest is
 * generated from a typed source instead of a hand-maintained JSON file.
 */
function manifestPlugin(): Plugin {
  return {
    name: 'adblock-emit-manifest',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(createManifest(), null, 2),
      });
    },
  };
}

export default defineConfig({
  // Relative asset URLs are required for pages loaded from chrome-extension://.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html',
        'service-worker': 'src/background/service-worker.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [manifestPlugin()],
});
