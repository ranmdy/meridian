import { defineConfig, devices } from "@playwright/test";

/**
 * Meridian Press — Playwright E2E configuration.
 *
 * Tests run against a locally started Next.js dev server (port 3000).
 * A mock EIP-1193 wallet provider is injected via a browser fixture so that
 * all wallet connect, signing, and transaction flows work without Metamask.
 *
 * Usage:
 *   pnpm exec playwright test            # all E2E tests
 *   pnpm exec playwright test --ui       # interactive mode
 *   pnpm exec playwright test e2e/wallet # specific file
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,  // serial to avoid port conflicts with dev server
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "playwright-report" }],
    ["list"],
  ],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npx next dev --port 3000",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
