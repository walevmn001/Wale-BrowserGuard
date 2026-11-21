import { defineConfig } from '@playwright/test';

/**
 * Playwright config for the golden suite (T018). It serves synthetic pages from
 * a local server and pins the ad hostnames to it, so the run is offline and
 * deterministic. The *built* extension is loaded, so `npm run build` first.
 */
const isCI = process.env.CI === 'true' || process.env.CI === '1';

export default defineConfig({
  testDir: 'tests/golden',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: 0,
  timeout: 180_000,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
});
