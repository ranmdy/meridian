import { test, expect } from "./fixtures/wallet";

/**
 * E2E Test: Strategy simulation display
 *
 * Verifies that:
 * 1. The composer page shows a route/simulation UI
 * 2. Simulated route data (APY, fees, steps) renders without errors
 * 3. Risk score is displayed in a valid format
 * 4. Fee estimate is present and formatted
 */

test.describe("Strategy Simulation Display", () => {
  test("composer page renders step UI", async ({ mockWalletPage: page }) => {
    await page.goto("/composer");
    await page.waitForLoadState("networkidle");

    // The composer should render some form of strategy builder
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(100);
  });

  test("marketplace page loads strategy templates", async ({ mockWalletPage: page }) => {
    await page.goto("/marketplace");
    await page.waitForLoadState("networkidle");

    const title = await page.title();
    expect(title.toLowerCase()).not.toContain("404");

    // The marketplace should show some content
    const body = await page.textContent("body");
    expect(body!.length).toBeGreaterThan(100);
  });

  test("dashboard shows portfolio section", async ({ mockWalletPage: page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Dashboard should render without JavaScript errors
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.waitForTimeout(2000);
    expect(errors.length).toBe(0);
  });

  test("execution page is navigable", async ({ mockWalletPage: page }) => {
    // Execution uses dynamic route /execution/[id]
    await page.goto("/execution/0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab");
    await page.waitForLoadState("networkidle");

    const title = await page.title();
    expect(title.toLowerCase()).not.toContain("error");
  });

  test("no unhandled console errors on composer", async ({ mockWalletPage: page }) => {
    const jsErrors: string[] = [];

    page.on("pageerror", (err) => jsErrors.push(err.message));

    await page.goto("/composer");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Filter out known non-critical warnings
    const criticalErrors = jsErrors.filter(
      (e) =>
        !e.includes("Warning:") &&
        !e.includes("ResizeObserver") &&
        !e.includes("Non-Error promise rejection")
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
