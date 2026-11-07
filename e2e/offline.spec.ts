import { expect, test } from "@playwright/test";
import { openMauban } from "./helpers";

const walkIn = { name: "New walk-in", exact: true } as const;
// After closing time the empty "Up next" list adds its own walk-in button, so match the first.

test("going offline shows the banner and pauses bookings", async ({ page, context }) => {
  await openMauban(page);
  await expect(page.getByRole("button", walkIn).first()).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText(/You're offline/)).toBeVisible();
  await expect(page.getByRole("button", walkIn)).toHaveCount(0);

  await context.setOffline(false);
  await expect(page.getByText(/You're offline/)).toHaveCount(0);
  await expect(page.getByRole("button", walkIn).first()).toBeVisible();
});

test("the mock controls can simulate offline", async ({ page }) => {
  await openMauban(page);
  await page.getByRole("button", { name: "Open mock API controls" }).click();
  await page.getByLabel(/Simulate offline/).check();
  await expect(page.getByText(/You're offline/)).toBeVisible();
  await expect(page.getByRole("button", walkIn)).toHaveCount(0);
  await page.getByLabel(/Simulate offline/).uncheck();
  await expect(page.getByText(/You're offline/)).toHaveCount(0);
});
