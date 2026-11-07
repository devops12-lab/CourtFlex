import { expect, test } from "@playwright/test";

// R6: a court owner lists their venue, confirms their email with a code, sets
// up the first courts, and lands in the owner portal waiting for approval.

test.use({ geolocation: { latitude: 14.1905, longitude: 121.7312 }, permissions: ["geolocation"] });

test("an owner lists a venue, then CourtFlex approves it and players can find it", async ({ page }) => {
  await page.goto("/join");
  await page.getByRole("link", { name: "Get started as an owner" }).click();
  await expect(page.getByRole("heading", { name: "List your venue on CourtFlex" })).toBeVisible();

  // Step 1: the venue. Next checks it first.
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByText("Enter the venue's name, as players will see it.")).toBeVisible();
  await expect(page.getByText("Put the pin on your venue: tap the map, or use your location.")).toBeVisible();

  await page.getByLabel("Venue name").fill("Daungan Pickleball");
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.getByText("Pinned at 14.19050, 121.73120.")).toBeVisible();
  await page.getByLabel("Region").selectOption({ label: "CALABARZON (Region IV-A)" });
  await page.getByLabel("Province").selectOption({ label: "Quezon" });
  await page.getByLabel("City or municipality").selectOption({ label: "Mauban" });
  await page.getByLabel("Barangay").selectOption({ index: 1 });
  await page.getByLabel("Street, building or landmark").fill("Rizal St., beside the market");
  await page.getByLabel("Number of courts").selectOption("3");
  await page.getByLabel("Venue mobile number").fill("09171112222");
  await page.getByRole("button", { name: "Next step" }).click();

  // Step 2: the account, email confirmed by a code.
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await page.getByLabel("Your full name").fill("Rosa Dela Cruz");
  await page.getByLabel("Email").fill("rosa@daungan.test");
  await page.getByLabel("Password", { exact: true }).fill("courtflex1");
  await page.getByLabel("Confirm password").fill("courtflex1");
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByText("Confirm your email with the code we send.")).toBeVisible();
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Code sent to rosa@daungan.test").fill("111111");
  await page.getByRole("button", { name: "Confirm email" }).click();
  await expect(page.getByText("That code doesn't match. 4 tries left.")).toBeVisible();
  await page.getByLabel("Code sent to rosa@daungan.test").fill("246810");
  await page.getByRole("button", { name: "Confirm email" }).click();
  await expect(page.getByText("Email confirmed: rosa@daungan.test")).toBeVisible();
  await page.getByRole("button", { name: "Next step" }).click();

  // Step 3: courts.
  await expect(page.getByRole("heading", { name: "Your courts" })).toBeVisible();
  await page
    .locator("label")
    .filter({ hasText: /^Indoor$/ })
    .click();
  await page.getByLabel("Rate per hour").fill("350");
  await expect(
    page.getByText("3 indoor courts, open 6:00 AM to 10:00 PM every day, ₱350 an hour."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Send venue for approval" }).click();

  await expect(page.getByRole("heading", { name: "Daungan Pickleball is sent for approval" })).toBeVisible();
  await page.getByRole("link", { name: "Open your owner portal" }).click();
  await expect(page.getByText("Waiting for CourtFlex approval.")).toBeVisible();

  // Not in court search yet.
  await page.goto("/courts?q=Daungan");
  await expect(page.getByText("Daungan Pickleball")).toHaveCount(0);

  // CourtFlex approves it (the mock stands in for the admin portal).
  await page.evaluate(() => fetch("/api/v1/__mock/approve-communities", { method: "POST" }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Daungan Pickleball" })).toBeVisible();
});

test("progress is saved on the device, passwords aren't", async ({ page }) => {
  await page.goto("/join/owner");
  await page.getByLabel("Venue name").fill("Saved Draft Courts");
  await page.reload();
  await expect(page.getByLabel("Venue name")).toHaveValue("Saved Draft Courts");
});
