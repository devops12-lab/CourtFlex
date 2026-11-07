import { expect, test } from "@playwright/test";

// R4: book without an account, confirm with the email code, then find the booking again.

const inManila = (days: number) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

test("a guest books with an email code and finds the booking again", async ({ page }) => {
  await page.goto(`/venues/mauban-pickleball-courts/book?date=${inManila(5)}`);
  await page.getByRole("button", { name: /^Court 3, 11:00 AM/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Details: every field is checked before moving on.
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter your full name.")).toBeVisible();
  await page.getByLabel("Full name").fill("Lito Ramos");
  await page.getByLabel("Mobile number").fill("09171230000");
  await page.getByLabel("Email", { exact: true }).fill("lito.e2e@example.test");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("radio", { name: /Pay at the court/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review and confirm" })).toBeVisible();

  // The code proves the email is real.
  await page.getByRole("button", { name: "Email me a code to confirm" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.getByLabel("Code from the email").fill("111111");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText(/That code doesn't match/)).toBeVisible();
  await page.getByLabel("Code from the email").fill("246810");
  await page.getByRole("button", { name: "Confirm booking" }).click();

  await expect(page.getByRole("heading", { name: "You're booked" })).toBeVisible();
  const code = (await page.getByTestId("booking-code").textContent())!.trim();

  // Leave it, then open it again with the code and email.
  await page.getByRole("button", { name: "Find another booking" }).click();
  await expect(page.getByRole("heading", { name: "View Bookings" })).toBeVisible();
  await page.getByLabel("Booking code").fill(code);
  await page.getByLabel("Email address").fill("someone.else@example.test");
  await page.getByRole("button", { name: "Find booking" }).click();
  await expect(page.getByText(/No booking matches that code and email/)).toBeVisible();
  await page.getByLabel("Email address").fill("lito.e2e@example.test");
  await page.getByRole("button", { name: "Find booking" }).click();
  await expect(page.getByTestId("booking-code")).toHaveText(code);
  await expect(page.getByRole("button", { name: "Cancel booking" })).toBeVisible();
});

test("a venue without guest booking asks visitors to sign in", async ({ page }) => {
  await page.goto(`/venues/quezon-sports-courts/book?date=${inManila(5)}`);
  await page
    .getByRole("button", { name: /, 9:00 AM/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
