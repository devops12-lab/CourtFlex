import { expect, test, type Page } from "@playwright/test";

// Phase 6, A3: the Super Admin manages every user account.

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("the Super Admin suspends an account with a reason; that person can't sign in until reactivated", async ({
  page,
}) => {
  await signIn(page, "admin@example.test");
  await page.goto("/admin/users?q=bea");
  const row = page.getByRole("main").getByRole("button", { name: "Open Bea Mendoza" });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole("heading", { name: "Bea Mendoza", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Suspend account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Reason").fill("Harassed other players at open play.");
  await dialog.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByText("Suspended Bea Mendoza's account.")).toBeVisible();
  await expect(page.getByText("Reason: Harassed other players at open play.").first()).toBeVisible();

  await page.evaluate(() => fetch("/api/v1/auth/logout", { method: "POST" }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("bea@example.test");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/This account is suspended/).first()).toBeVisible();

  await signIn(page, "admin@example.test");
  await page.goto("/admin/users?status=suspended");
  await page.getByRole("main").getByRole("button", { name: "Open Bea Mendoza" }).click();
  await page.getByRole("button", { name: "Reactivate account" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reactivate" }).click();
  await expect(page.getByText("Reactivated Bea Mendoza's account.")).toBeVisible();
});

test("the Super Admin sees an account's venues and sends a password reset link", async ({ page }) => {
  await signIn(page, "admin@example.test");
  await page.goto("/admin/users?role=venue_staff&q=owner%40example.test");
  await page.getByRole("main").getByRole("button", { name: "Open Alex Venue Owner" }).click();
  await expect(
    page.getByRole("region", { name: "Venues" }).getByRole("link", { name: "Mauban Pickleball Courts" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Send password reset link" }).click();
  await expect(page.getByText("Password reset link sent to Alex Venue Owner.")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "History" }).getByText("Sent Alex Venue Owner a password reset link"),
  ).toBeVisible();
});
