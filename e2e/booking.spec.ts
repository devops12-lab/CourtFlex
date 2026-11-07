import { expect, test } from "@playwright/test";

// R3: book a court at a venue, pay by GCash, upload the receipt, and the venue approves it.

const inManila = (days: number) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("book with GCash: sign in, hold, upload the receipt, and the venue approves it", async ({ page }) => {
  // The longest flow in the suite (two apps, sign-in, upload, review): more time when the machine is busy.
  test.slow();
  // A visitor picks two hours on Court 2.
  await page.goto(`/venues/mauban-pickleball-courts/book?date=${inManila(4)}`);
  await expect(page.getByRole("heading", { name: "Book a court" })).toBeVisible();
  await page.getByRole("button", { name: /^Court 2, 10:00 AM/ }).click();
  // Wait for the first hour to register before adding the next (slow under load on phones).
  await expect(page.getByText("1 hour selected")).toBeVisible();
  await page.getByRole("button", { name: /^Court 2, 11:00 AM/ }).click();
  await expect(page.getByText("2 hours selected")).toBeVisible();

  // Mauban takes guest bookings; this player signs in instead, and comes back to the payment step.
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("link", { name: "Have an account? Sign in" }).click();
  await expect(page).toHaveURL(/\/login$/);
  // The booking page's guest form also has an Email field: wait for the sign-in page itself.
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByLabel("Email").fill("player1@example.test");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "How you'll pay" })).toBeVisible();

  await page.getByRole("radio", { name: /GCash/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review and confirm" })).toBeVisible();
  await page.getByRole("button", { name: "Hold the court and pay by GCash" }).click();

  // The court is held; pay and upload the receipt.
  await expect(page.getByRole("heading", { name: "Court held. Pay to confirm." })).toBeVisible();
  await expect(page.getByText("09175550101")).toBeVisible();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
  await page.getByLabel("Reference number").fill("9988776655");
  await page.getByRole("button", { name: "Send receipt" }).click();
  await expect(page.getByRole("heading", { name: "Receipt sent. The venue is checking it." })).toBeVisible();
  const code = (await page.getByTestId("booking-code").textContent())!.trim();

  // Same tab, now as the venue owner: the receipt waits on the Today page.
  await page.evaluate(() => fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: /Mauban Pickleball Courts/ }).click();
  const receipts = page.getByRole("region", { name: /Receipts to check/ });
  await expect(receipts).toContainText(code);
  await receipts.getByRole("button", { name: "Check receipt" }).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("9988776655", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Approve payment" }).click();
  await expect(page.getByText(`Payment approved. ${code} is confirmed and paid.`)).toBeVisible();
});

test("a venue that asks for payment first doesn't offer pay at court", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("player1@example.test");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto(`/venues/balibago-paddle-center/book?date=${inManila(4)}`);
  await page.getByRole("button", { name: /^Court 1, 9:00 AM/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/asks for payment before play/)).toBeVisible();
  await expect(page.getByRole("radio", { name: /Pay at the court/ })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /GCash/ })).toBeVisible();
});
