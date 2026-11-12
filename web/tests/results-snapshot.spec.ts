import { expect, test } from "@playwright/test";

for (const route of ["/", "/throughput", "/proxies", "/captcha"]) {
  test(`${route} opens the November 11 comparison without a date parameter`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("[data-run-date]")).toHaveText("Nov 11, 2026");
    const table = page.getByRole("table").first();
    await expect(table.getByRole("row", { name: /Lexmount\(normal\)/ })).toBeVisible();
    await expect(table.getByRole("row", { name: /Notte/ })).toBeVisible();
    if (route === "/" || route === "/throughput") {
      await expect(table.getByRole("row", { name: /Lexmount\(light\)/ })).toBeVisible();
    }
    if (route === "/captcha") {
      await expect(page.getByText("Latest publication", { exact: false })).toContainText("11 November 2026");
      await expect(page.getByRole("region", { name: "Published CAPTCHA campaigns" })).toContainText("Nov 10, 2026");
    }
  });
}
