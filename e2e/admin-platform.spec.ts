import { expect, test, type Page } from "@playwright/test";

// Phase 6, A5: announcements, platform settings and the audit log.

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}
const signOut = (page: Page) => page.evaluate(() => fetch("/api/v1/auth/logout", { method: "POST" }));

test("an announcement for everyone shows in the player app and the owner portal, and can be dismissed", async ({
  page,
}) => {
  await signIn(page, "admin@example.test");
  await page.goto("/admin/announcements");
  await page.getByRole("button", { name: "New announcement" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Title").fill("Typhoon advisory");
  await form
    .getByLabel("Message")
    .fill("Outdoor courts in Quezon may close this weekend. Check with your venue.");
  await form
    .locator("label")
    .filter({ hasText: /^Warning$/ })
    .click();
  await form.getByRole("button", { name: "Post announcement" }).click();
  await expect(page.getByText('Posted "Typhoon advisory".')).toBeVisible();
  await expect(page.getByRole("main").getByText("Showing now")).toBeVisible();

  await signOut(page);
  await page.goto("/courts");
  const banner = page.getByRole("region", { name: "Announcement: Typhoon advisory" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Dismiss announcement: Typhoon advisory" }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(banner).toHaveCount(0); // stays dismissed on this device

  await page.evaluate(() => localStorage.removeItem("courtflex-dismissed-announcements"));
  await signIn(page, "owner@example.test");
  await page.goto("/owner/v/mauban-pickleball-courts");
  await expect(page.getByRole("region", { name: "Announcement: Typhoon advisory" })).toBeVisible();
});

test("settings change the trial wording and can pause owner sign-up; the audit log shows it", async ({
  page,
}) => {
  await signIn(page, "admin@example.test");
  await page.goto("/admin/settings");
  await page.getByLabel("Free trial length (days)").fill("30");
  await page
    .locator("label")
    .filter({ hasText: /^Paused$/ })
    .click();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  await page.goto("/admin/audit-log?type=settings");
  await expect(
    page.getByRole("link", { name: /Changed settings: free trial 14 → 30 days, new venue sign-ups closed/ }),
  ).toBeVisible();

  await signOut(page);
  await page.goto("/join");
  await expect(page.getByText("30-day free trial for each venue")).toBeVisible();
  await page.goto("/join/owner");
  await expect(page.getByRole("heading", { name: "New venue sign-ups are paused" })).toBeVisible();
  await expect(page.getByText("support@courtflex.test")).toBeVisible();
});
