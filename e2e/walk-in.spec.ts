import { expect, test } from "@playwright/test";
import { openMauban, openTomorrowsCalendar, trackPageErrors } from "./helpers";

test("front desk books a walk-in and records a GCash payment", async ({ page }) => {
  const errors = trackPageErrors(page);
  await openMauban(page);
  await openTomorrowsCalendar(page);

  await page.getByRole("button", { name: "New walk-in on Court 2 at 10:00 AM" }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("heading", { name: "New walk-in" })).toBeVisible();

  await panel.getByLabel("Find player").fill("jam");
  await panel.getByText("Jamie Player").click();
  await expect(panel.getByText("₱400 due at the venue")).toBeVisible();
  await panel.getByRole("button", { name: "Create booking" }).click();

  await expect(page.getByText(/Booked Court 2, 10:00 AM/)).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Jamie Player" })).toBeVisible();
  await expect(panel.getByText("Unpaid")).toBeVisible();

  await panel.getByRole("button", { name: "Record payment" }).click();
  await panel.getByText("GCash at venue").click();
  await panel.getByLabel("Reference number (optional)").fill("7731 9001 245");
  await panel.getByRole("button", { name: "Review payment" }).click();
  await expect(panel.getByText("₱400", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Record payment" }).click();

  await expect(page.getByText("Payment recorded: ₱400 from Jamie Player.")).toBeVisible();
  await expect(panel.getByText("Paid", { exact: true })).toBeVisible();
  await expect(panel.getByText(/Ref 7731 9001 245/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("a booked time is not offered on the same court", async ({ page }) => {
  await openMauban(page);
  await openTomorrowsCalendar(page);
  await page.getByRole("button", { name: "New walk-in", exact: true }).click();
  const panel = page.getByRole("dialog");
  await panel.getByText("Court 2", { exact: true }).click();
  // Court 2 is booked 6–8 PM tomorrow in the sample data.
  await expect(panel.locator("label", { hasText: /^6:00 PM/ }).locator("input")).toBeDisabled();
  await expect(panel.locator("label", { hasText: /^10:00 AM/ }).locator("input")).toBeEnabled();
});

test("a payment over the balance is refused before review", async ({ page }) => {
  await openMauban(page);
  await openTomorrowsCalendar(page);
  await page.getByRole("button", { name: "New walk-in on Court 1 at 11:00 AM" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByText("Guest", { exact: true }).click();
  await panel.getByLabel("Guest name").fill("Lorna Castillo");
  await panel.getByRole("button", { name: "Create booking" }).click();
  await panel.getByRole("button", { name: "Record payment" }).click();
  await panel.getByLabel("Amount collected").fill("900");
  await panel.getByText("Cash", { exact: true }).click();
  await panel.getByRole("button", { name: "Review payment" }).click();
  await expect(panel.getByText(/The balance is only/)).toBeVisible();
});
