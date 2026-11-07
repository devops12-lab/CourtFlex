import { expect, test, type Page } from "@playwright/test";

// Phase 6, A4: plans, subscriptions, invoices and revenue.

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("the Super Admin extends a venue's trial with a reason, and the owner sees it", async ({ page }) => {
  await signIn(page, "admin@example.test");
  await page.goto("/admin/billing?tab=subscriptions&q=Mauban");
  const row = page
    .getByRole("main")
    .getByRole("button", { name: "Manage Mauban Pickleball Courts's subscription" });
  await expect(row).toBeVisible();
  await row.click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Extend by").selectOption("7");
  await panel.getByLabel("Reason", { exact: true }).fill("Typhoon closed the courts for a week.");
  await panel.getByRole("button", { name: "Extend trial" }).click();
  await expect(page.getByText("Extended Mauban Pickleball Courts's trial by 7 days.")).toBeVisible();
  await expect(panel.getByText(/21 days left/)).toBeVisible();

  await page.evaluate(() => fetch("/api/v1/auth/logout", { method: "POST" }));
  await signIn(page, "owner@example.test");
  await page.goto("/owner/v/mauban-pickleball-courts/subscription");
  await expect(page.getByText(/21 days left/).first()).toBeVisible();
});

test("recording an overdue payment makes an expired venue's plan active again", async ({ page }) => {
  await signIn(page, "admin@example.test");
  await page.goto("/admin/billing?tab=invoices&status=overdue");
  const row = page.getByRole("main").getByRole("button", { name: /^Open CF-INV-202610-003/ });
  await expect(row).toBeVisible();
  await row.click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: /Record ₱990 payment/ }).click();
  await expect(panel.getByText("Enter the reference number from the receipt.")).toBeVisible();
  await panel.getByLabel("Reference number").fill("7012345678");
  await panel.getByRole("button", { name: /Record ₱990 payment/ }).click();
  await expect(page.getByText("Recorded payment for CF-INV-202610-003.")).toBeVisible();
  await expect(panel.getByText(/Paid .* by GCash, reference 7012345678/)).toBeVisible();

  await page.goto("/admin/billing?tab=subscriptions&q=Lucena%20Dink");
  await expect(page.getByRole("main").getByText("Active", { exact: true }).first()).toBeVisible();
});

test("the Super Admin edits a plan and sees revenue", async ({ page }) => {
  await signIn(page, "admin@example.test");
  await page.goto("/admin/billing?tab=plans");
  await page.getByRole("button", { name: "Edit Starter" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Monthly price (₱)").fill("1090");
  await panel.getByRole("button", { name: "Save plan" }).click();
  await expect(page.getByText("Saved the Starter plan.")).toBeVisible();
  await expect(page.getByText(/₱1,090 a month/).first()).toBeVisible();

  await page.goto("/admin/revenue"); // on phones, Revenue is under More
  await expect(page.getByRole("heading", { name: "Revenue", level: 1 })).toBeVisible();
  await expect(page.getByText("Monthly recurring revenue")).toBeVisible();
  await expect(page.getByRole("table", { name: /Income by month/ }).getByRole("row")).toHaveCount(7);
});
