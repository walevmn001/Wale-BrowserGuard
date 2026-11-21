import { defineConfig } from 'vite';

// T001 scaffold: minimal build pipeline.
// T002 replaces `input` with the real MV3 entries (service worker + popup).
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    rollupOptions: {
      input: {
        index: 'src/index.ts',
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
});
