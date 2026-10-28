import { test } from "@playwright/test";

// Visual review of every page on the seeded demo PG. Run with SCREENSHOTS=1 after `npm run db:seed`.
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture");

const PAGES = ["dashboard", "rooms", "tenants", "rent", "electricity", "expenses", "reports", "settings"];

for (const viewport of [{ name: "desktop", width: 1280, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`screens ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/login");
    await page.getByLabel("Email").fill("demo@pgmanager.in");
    await page.getByLabel("Password").fill("demo1234");
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/dashboard/);
    for (const p of PAGES) {
      await page.goto(`/${p}`);
      await page.screenshot({ path: `screens/${viewport.name}-${p}.png`, fullPage: true });
    }
    await page.goto("/tenants");
    await page.getByRole("link", { name: "Sahil Gupta" }).click();
    await page.screenshot({ path: `screens/${viewport.name}-tenant.png`, fullPage: true });
    await page.goto("/rent?show=unpaid");
    await page.locator("table a.link").first().click();
    await page.screenshot({ path: `screens/${viewport.name}-invoice.png`, fullPage: true });
    const pay = await page.getByRole("link", { name: /\/pay\// }).getAttribute("href");
    await page.goto(pay!);
    await page.screenshot({ path: `screens/${viewport.name}-pay.png`, fullPage: true });
  });
}
