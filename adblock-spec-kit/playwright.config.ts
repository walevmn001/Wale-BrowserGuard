import { defineConfig } from '@playwright/test';

/**
 * Playwright config for end-to-end tests that load the *built* extension.
 *
 * MV3 extensions only load in a persistent, headed Chromium context, so the
 * actual `chromium.launchPersistentContext(... --load-extension=dist)` call
 * lives inside `tests/e2e/extension-load.spec.ts`. Tests run serially because a
 * single persistent profile is shared per worker.
 *
 * The extension must be built first (`npm run build`) so that `dist/` exists.
 */
const isCI = process.env.CI === 'true' || process.env.CI === '1';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: 0,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
});
