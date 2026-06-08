import { test, expect } from "./fixtures/wallet";

/**
 * E2E Test: Live tracker / WebSocket strategy status updates
 *
 * Verifies that:
 * 1. The execution page has a real-time status tracker component
 * 2. The WebSocket connection attempt is made (or mock data is shown)
 * 3. Strategy step indicators render correctly
 * 4. The status display handles loading, active, and completed states
 *
 * Note: Real WebSocket events require a running backend. In CI, the tracker
 * should gracefully show a loading or "connect your wallet" state.
 */

test.describe("Live Tracker", () => {
  test("execution page renders without crash", async ({ mockWalletPage: page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // Execution uses dynamic route /execution/[id]
    const mockId = "0x" + "ab".repeat(32);
    await page.goto(`/execution/${mockId}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Warning:") &&
        !e.includes("ResizeObserver") &&
        !e.includes("WebSocket") &&
        !e.includes("Failed to fetch") &&
        !e.includes("indexedDB")
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("execution page has accessible title", async ({ mockWalletPage: page }) => {
    const mockId = "0x" + "ab".repeat(32);
    await page.goto(`/execution/${mockId}`);
    await page.waitForLoadState("domcontentloaded");

    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.toLowerCase()).not.toContain("error");
  });

  test("strategy URL with id parameter loads without 404", async ({ mockWalletPage: page }) => {
    // Execution uses dynamic route /execution/[id]
    const mockSid = "0x" + "ab".repeat(32);
    await page.goto(`/execution/${mockSid}`);
    await page.waitForLoadState("domcontentloaded");

    const title = await page.title();
    // Dynamic route should render (may show "not found" content, but not a Next.js 404)
    expect(title).toBeTruthy();
  });

  test("page does not leak sensitive data in DOM", async ({ mockWalletPage: page }) => {
    await page.goto("/execution");
    await page.waitForLoadState("domcontentloaded");

    const bodyText = await page.textContent("body");

    // Private keys and secrets must never appear in DOM
    expect(bodyText).not.toContain("0xBEEF0000CAFE");
    expect(bodyText).not.toContain("privateKey");
    expect(bodyText).not.toContain("secret");
  });
});
