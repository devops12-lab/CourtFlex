import { expect, test } from "@playwright/test";

// R5: one place to choose how to join.

test("visitors pick a path: players sign up, owners sign in to their portal", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Join CourtFlex" }).first().click();
  await expect(page).toHaveURL(/\/join$/);
  await expect(
    page.getByRole("heading", { name: "Built for Players. Designed for Court Owners." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "I manage a court" })).toBeVisible();

  await page.getByRole("link", { name: "Create a free account" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();

  await page.goBack();
  await page.getByRole("main").getByRole("link", { name: "Owner sign in" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fowner%2F$/);
  await expect(page.getByText("Court owners and staff: you'll go straight to your venue.")).toBeVisible();
});

test("the sign-in page sends newcomers to the path picker", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: /Join CourtFlex/ }).click();
  await expect(
    page.getByRole("heading", { name: "Built for Players. Designed for Court Owners." }),
  ).toBeVisible();
});

test("signed-in players are sent home from the player path", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("player1@example.test");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/join");
  await page.getByRole("link", { name: /go to your home/ }).click();
  await expect(page).toHaveURL(/\/home$/);
});
