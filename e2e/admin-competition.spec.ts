import { expect, test, type Page } from "@playwright/test";

// Phase 5, M5: the Super Admin's side of competition.

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("the Super Admin keeps a disputed result; the players see why", async ({ page }) => {
  await signIn(page, "admin@example.test");
  await expect(page.getByRole("link", { name: /1 disputed result/ })).toBeVisible();
  await page.getByRole("link", { name: /1 disputed result/ }).click();
  await expect(page.getByRole("heading", { name: "Competition", level: 1 })).toBeVisible();
  await expect(page.getByText('"The final rally was out. It should be 10-10."')).toBeVisible();
  await page.getByRole("button", { name: "Keep the result" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Note to the players").fill("The court camera shows the ball landed in.");
  await dialog.getByRole("button", { name: "Keep the result" }).click();
  await expect(page.getByText("Result kept.")).toBeVisible();
  await expect(page.getByText("No disputed results waiting.")).toBeVisible();

  await page.goto("/matches/m-4");
  await expect(page.getByText(/kept it: The court camera shows the ball landed in\./)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rating changes (doubles)" })).toBeVisible();
});

test("the Super Admin corrects a rating and changes the rating rules", async ({ page }) => {
  await signIn(page, "admin@example.test");
  await page.goto("/admin/competition?tab=ratings");
  await page.getByLabel("Find a player").fill("Ramon");
  await page
    .getByRole("row", { name: /Ramon Aguilar/ })
    .getByRole("button", { name: "Correct" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("New rating").fill("1350");
  await dialog.getByLabel("Reason").fill("Rating carried over from his club ladder.");
  await dialog.getByRole("button", { name: "Save rating" }).click();
  await expect(page.getByText("Ramon Aguilar's doubles rating is now 1350.")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Recent corrections" }).getByText(/Ramon Aguilar/),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Rating rules" }).click();
  await page.getByLabel("Matches to be ranked").fill("3");
  await page.getByRole("button", { name: "Save rating rules" }).click();
  await expect(page.getByText("Rating rules saved.")).toBeVisible();
  await page.goto("/admin/audit-log?type=competition");
  await expect(page.getByText(/Changed rating rules: matches to be ranked 5 → 3/)).toBeVisible();
});
