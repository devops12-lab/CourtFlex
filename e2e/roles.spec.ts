import { expect, test } from "@playwright/test";
import { OWNER, STAFF, signIn } from "./helpers";

test("front desk doesn't see the plan and is refused its page", async ({ page }) => {
  await signIn(page, STAFF);
  await expect(page.getByRole("heading", { name: "Court board" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Plan" })).toHaveCount(0);
  await expect(page.getByText(/left in this venue's free trial/)).toHaveCount(0);

  await page.goto("/owner/v/mauban-pickleball-courts/subscription");
  await expect(page.getByText("Only the venue owner can see this venue's plan and billing.")).toBeVisible();
});

test("front desk can't open a club they don't work at", async ({ page }) => {
  await signIn(page, STAFF);
  await expect(page.getByRole("heading", { name: "Court board" })).toBeVisible();
  await page.goto("/owner/v/quezon-sports-courts");
  await expect(page.getByText(/aren't on the staff of this venue/)).toBeVisible();
});

test("each club shows its own subscription", async ({ page }) => {
  await signIn(page, OWNER);
  await page.getByRole("link", { name: /Mauban Pickleball Courts/ }).click();
  await expect(page.getByText(/left in this venue's free trial/)).toBeVisible();

  await page.goto("/owner/v/quezon-sports-courts/subscription");
  await expect(page.getByRole("heading", { name: "Starter" })).toBeVisible();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  await expect(page.getByText(/left in this venue's free trial/)).toHaveCount(0);
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/owner/v/mauban-pickleball-courts/bookings");
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("Email").fill(OWNER);
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That email and password don't match an account.")).toBeVisible();
});
