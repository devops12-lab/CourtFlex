import { expect, test, type Page } from "@playwright/test";

// Phase 6: the Super Admin portal at /admin, for the Super Admin only.

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("the Super Admin lands on the admin dashboard with sign-ups to review", async ({ page }) => {
  await signIn(page, "admin@example.test");
  await expect(page).toHaveURL(/\/admin\/$/);
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  const review = page.getByRole("region", { name: /Needs review/ });
  await expect(review.getByRole("link", { name: /Mateuna Courts/ })).toBeVisible();
  await expect(page.getByText("Venues live")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent admin activity" })).toBeVisible();
});

test("other accounts are kept out of the admin portal", async ({ page }) => {
  await signIn(page, "owner@example.test");
  await expect(page).toHaveURL(/\/owner\//);
  await page.goto("/admin/");
  await expect(page.getByRole("heading", { name: "This area is for the Super Admin" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to your venue" })).toBeVisible();
});

test("signed-out visitors are sent to sign in, then back to the admin page", async ({ page }) => {
  await page.goto("/admin/");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2F/);
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
});

test("the Super Admin approves a waiting venue and declines a club with a reason", async ({ page }) => {
  await signIn(page, "admin@example.test");
  await page
    .getByRole("main")
    .getByRole("link", { name: /Mateuna Courts/ })
    .click();
  await expect(page.getByRole("heading", { name: "Mateuna Courts", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(
    page.getByText("Players can find and book it, and its 14-day free trial starts now."),
  ).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved Mateuna Courts.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Suspend" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "History" }).getByText("Approved Mateuna Courts"),
  ).toBeVisible();

  await page.goto("/admin/clubs?status=pending_review");
  await page.getByRole("button", { name: "Open Sunrise Paddle Circle" }).click();
  await page.getByRole("button", { name: "Decline" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Decline" }).click();
  await expect(dialog.getByText(/at least 10 characters/).last()).toBeVisible();
  await dialog.getByLabel("Reason").fill("Please add a home venue and contact number.");
  await dialog.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByText("Declined Sunrise Paddle Circle.")).toBeVisible();
  await expect(page.getByText("Reason: Please add a home venue and contact number.").first()).toBeVisible();
});

test("a suspended venue's owner sees why and can't make changes", async ({ page }) => {
  await signIn(page, "admin@example.test");
  await page.goto("/admin/venues?q=Quezon%20Sports");
  await page.getByRole("button", { name: "Open Quezon Sports Courts" }).click();
  await page.getByRole("button", { name: "Suspend" }).click();
  await page.getByRole("dialog").getByLabel("Reason").fill("Players reported the courts are closed.");
  await page.getByRole("dialog").getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByText("Suspended Quezon Sports Courts.")).toBeVisible();

  await page.evaluate(() => fetch("/api/v1/auth/logout", { method: "POST" }));
  await signIn(page, "owner@example.test");
  await page.goto("/owner/v/quezon-sports-courts");
  await expect(page.getByText("CourtFlex suspended this venue.")).toBeVisible();
  await expect(page.getByText("Reason: Players reported the courts are closed.")).toBeVisible();
});

test("the Super Admin manages any venue in the owner portal and any club", async ({ page }) => {
  await signIn(page, "admin@example.test");
  await page.goto("/admin/venues?q=Mauban");
  await page.getByRole("button", { name: "Open Mauban Pickleball Courts" }).click();
  await page.getByRole("link", { name: "Manage this venue" }).click();
  await expect(page.getByText("You're managing Mauban Pickleball Courts as Super Admin.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Court board" })).toBeVisible();

  await page.goto("/admin/clubs?q=Mauban");
  const firstClub = page
    .getByRole("main")
    .getByRole("button", { name: /^Open / })
    .first();
  await expect(firstClub).toBeVisible();
  await firstClub.click();
  await expect(page).toHaveURL(/\/admin\/clubs\/[^/?]+$/);
  await expect(page.getByRole("link", { name: "Manage this club" })).toBeVisible();
  const name = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
  await page.getByRole("link", { name: "Manage this club" }).click();
  await expect(page.getByRole("heading", { name: `Manage ${name}` })).toBeVisible();
});
