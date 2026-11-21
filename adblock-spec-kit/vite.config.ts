import { defineConfig, type Plugin } from 'vite';

import { buildCosmeticAssets, buildStaticRuleSets } from './scripts/build-rulesets.ts';
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

/**
 * Converts the bundled ABP source lists into DNR JSON and emits them next to
 * the manifest. Also emits the cosmetic element-hiding JSON (T020) that the
 * content script loads at runtime. `buildStaticRuleSets` validates the result,
 * so an over-limit or malformed ruleset fails the build here instead of
 * shipping.
 */
function rulesPlugin(): Plugin {
  return {
    name: 'adblock-emit-rules',
    apply: 'build',
    generateBundle() {
      const report = buildStaticRuleSets(process.cwd());
      for (const { descriptor, json } of report.ruleSets) {
        this.emitFile({ type: 'asset', fileName: descriptor.output, source: json });
      }
      const cosmetic = buildCosmeticAssets(process.cwd());
      for (const { path, json } of cosmetic.assets) {
        this.emitFile({ type: 'asset', fileName: path, source: json });
      }
      console.info(
        `[adblock] rulesets: ${report.totalRules} rules emitted, ${report.totalSkipped} lines skipped`,
      );
      console.info(
        `[adblock] cosmetic: ${cosmetic.genericSelectors} generic + ${cosmetic.domainSelectors} ` +
          `domain selectors (${cosmetic.domains} domains), ${cosmetic.skipped} lines skipped`,
      );
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
        options: 'src/options/index.html',
        'service-worker': 'src/background/service-worker.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [manifestPlugin(), rulesPlugin()],
});
