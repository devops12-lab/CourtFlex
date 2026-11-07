import { expect, test, type Page } from "@playwright/test";

const PLAYER = "http://localhost:5174";

const unique = () => Math.random().toString(36).slice(2, 8);

async function register(page: Page, name: string) {
  await page.goto(`${PLAYER}/`);
  await page.getByRole("link", { name: "Create a free account" }).click();
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(`new.${unique()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("dinkdink9");
  await page.getByLabel("Confirm password").fill("dinkdink9");
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
}

test("a new player signs up, verifies and sets up their profile", async ({ page }) => {
  await register(page, "Lea Ramos");

  // Unverified accounts can't skip ahead. Navigate inside the app: a full reload
  // would reset the mock API's in-memory data, including this new account.
  await page.evaluate(() => {
    window.history.pushState({}, "", "/home");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await page.getByLabel("Code").fill("123456");
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByText(/That code isn't right/)).toBeVisible();
  await page.getByLabel("Code").fill("246810");
  await page.getByRole("button", { name: "Verify email" }).click();

  await expect(page.getByRole("heading", { name: "Set up your player profile" })).toBeVisible();
  await page.getByText("Novice", { exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Region").selectOption({ label: "CALABARZON (Region IV-A)" });
  await page.getByLabel("Province").selectOption({ label: "Quezon" });
  await page.getByLabel("City or municipality").selectOption({ label: "Lucena City" });
  await page.getByLabel("Barangay").selectOption({ label: "Isabang" });
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Evening" }).click();
  await page.getByRole("button", { name: "Start playing" }).click();

  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Lea/ })).toBeVisible();
  await expect(page.getByText("Lucena City, Quezon")).toBeVisible();
  await expect(page.getByText("Nothing booked yet")).toBeVisible();
});

test("forgotten password: reset link, new password, sign in", async ({ page }) => {
  await page.goto(`${PLAYER}/login`);
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill("miguel@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.getByRole("link", { name: "Open the reset link" }).click();
  await page.getByLabel("New password", { exact: true }).fill("rallyrally7");
  await page.getByLabel("New password again").fill("rallyrally7");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("heading", { name: "Password changed" })).toBeVisible();

  await page.getByRole("link", { name: "Sign in" }).first().click();
  await page.getByLabel("Email").fill("miguel@example.test");
  await page.getByLabel("Password", { exact: true }).fill("rallyrally7");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Miguel/ })).toBeVisible();
});

test.describe("finding a court", () => {
  const search = async (page: Page, text: string) => {
    await page.getByRole("searchbox", { name: "Search by city, barangay or venue" }).fill(text);
    await page.getByRole("button", { name: "Search", exact: true }).click();
  };

  test("visitors search by place, filter, and open a court's times", async ({ page }) => {
    await page.goto(`${PLAYER}/courts`);
    await expect(page.getByRole("heading", { name: /venues found/ })).toBeVisible();
    await search(page, "pasig");
    await expect(page.getByRole("heading", { name: "1 venue found" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Kapitolyo Dink Dome" })).toBeVisible();
    await page.getByRole("button", { name: "Indoor / Outdoor" }).click();
    await page.getByRole("button", { name: "Indoor", exact: true }).click();
    await expect(page).toHaveURL(/io=indoor/);
    const card = page.getByRole("article").filter({ hasText: "Kapitolyo Dink Dome" });
    await expect(card).toContainText("Indoor");
    await card.getByRole("link", { name: "View availability" }).click();
    await expect(page).toHaveURL(/\/venues\/kapitolyo-dink-dome\/book/);
    await expect(page.getByRole("heading", { name: "Book a court" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Court 1/ })).toBeVisible();
  });

  test("list view, sort by price and pages", async ({ page }) => {
    await page.goto(`${PLAYER}/courts`);
    await page.getByRole("radio", { name: "List" }).click();
    await page.getByLabel("Sort by").selectOption("price_asc");
    await expect(page).toHaveURL(/sort=price_asc/);
    await expect(page.getByRole("article").first()).toContainText("Tabunok Barangay Courts");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole("button", { name: "2", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test.describe("with location allowed", () => {
    test.use({ geolocation: { latitude: 13.9373, longitude: 121.617 }, permissions: ["geolocation"] });
    test("nearby puts the nearest courts first", async ({ page }) => {
      await page.goto(`${PLAYER}/courts`);
      await page.getByRole("button", { name: "Nearby" }).click();
      await expect(page.getByText(/Within 25 km of you/)).toBeVisible();
      await expect(page.getByRole("article").first()).toContainText("Quezon Sports Courts");
    });
  });

  test.describe("with location blocked", () => {
    test.use({ permissions: [] });
    test("manual search is offered instead", async ({ page, context }) => {
      await context.clearPermissions();
      await page.goto(`${PLAYER}/courts`);
      await page.getByRole("button", { name: "Use my location" }).click();
      await expect(page.getByText(/Search by city, barangay or venue instead/)).toBeVisible();
      await search(page, "lucban");
      await expect(page.getByRole("heading", { name: "Lucban Courtside" })).toBeVisible();
    });
  });
});

test("signed-out visitors see the landing page", async ({ page }) => {
  await page.goto(`${PLAYER}/`);
  await expect(page.getByRole("heading", { name: "Book a court near you tonight." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pick a time. Confirm. Play." })).toBeVisible();
  // A city link opens court search for that city; no account needed to look.
  await page.getByRole("link", { name: "Lucban", exact: true }).click();
  await expect(page).toHaveURL(/\/courts\?q=Lucban/);
  await expect(page.getByRole("heading", { name: "Lucban Courtside" })).toBeVisible();
});
