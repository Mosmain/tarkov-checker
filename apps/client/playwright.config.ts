import { defineConfig, devices } from '@playwright/test';

/**
 * Accessibility (axe-core) test runner. Local-only by design — there is no CI
 * job; run it on demand with `pnpm --filter @raidmate/client test:a11y`.
 *
 * Tests live in `e2e/` (outside `src/`) so Vitest — which globs `src/**` —
 * never tries to run them. `webServer` boots the Vite dev server itself, or
 * reuses one already on :5173.
 */
export default defineConfig({
  testDir: './e2e',
  // Serial, single browser: this Windows box intermittently crashes child
  // processes with STATUS_ACCESS_VIOLATION (0xC0000005) when several Chromium
  // instances spawn at once (same flakiness documented for the Rust build).
  // One worker + a retry keeps the run reliable; the suite is tiny so the
  // wall-clock cost is negligible.
  workers: 1,
  retries: 1,
  // `list` keeps output in the terminal; no HTML report server to leave hanging.
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
