import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig, type Plugin } from 'vite';

import { buildCosmeticAssets, buildStaticRuleSets } from './scripts/build-rulesets.ts';
import { createManifest } from './manifest.config.ts';
import { packageRelease } from './scripts/package-release.ts';
import { UI_ASSETS, readUiAsset } from './scripts/ui-assets.ts';
import { YOUTUBE_CONFIG_PATH } from './src/shared/youtube-config.ts';

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

/**
 * Writes the release ZIP from the freshly written `dist/` (T043). Gated on
 * `--mode release` (see `npm run package`) so ordinary builds stay shell-only.
 */
function releasePlugin(): Plugin {
  return {
    name: 'adblock-emit-release',
    apply: 'build',
    closeBundle() {
      console.info(`[adblock] release -> ${packageRelease()}`);
    },
  };
}

/**
 * Copies the shared UI assets (design tokens, component stylesheet, icon SVG
 * and the rasterised PNG icons) into `dist/` at fixed, unhashed paths (T070).
 * Pages link them relatively and the manifest references the PNGs, so the
 * paths must stay stable.
 */
function uiAssetsPlugin(): Plugin {
  return {
    name: 'adblock-emit-ui-assets',
    apply: 'build',
    generateBundle() {
      for (const asset of UI_ASSETS) {
        this.emitFile({ type: 'asset', fileName: asset.to, source: readUiAsset(process.cwd(), asset) });
      }
    },
  };
}

/**
 * Copies the YouTube module configuration into `dist/` unchanged (T063). The
 * worker fetches it at runtime and the Q6 updater can replace the shipped copy,
 * so the file must stay a standalone JSON asset — never bundled into code.
 */
function youTubeConfigPlugin(): Plugin {
  return {
    name: 'adblock-emit-youtube-config',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: YOUTUBE_CONFIG_PATH,
        source: readFileSync(resolve(process.cwd(), YOUTUBE_CONFIG_PATH), 'utf8'),
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
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
        warning: 'src/warning/warning.html',
        'service-worker': 'src/background/service-worker.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [
    manifestPlugin(),
    rulesPlugin(),
    uiAssetsPlugin(),
    youTubeConfigPlugin(),
    ...(mode === 'release' ? [releasePlugin()] : []),
  ],
}));
