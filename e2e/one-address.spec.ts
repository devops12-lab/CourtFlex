import { expect, test } from "@playwright/test";
import { OWNER, tomorrowInManila } from "./helpers";

// Players and court owners use one address: the player app at /, the owner portal at /owner,
// and one sign-in page. Demo data is shared between the two for the browser tab.

test("court owners sign in from the landing page and land in the owner portal", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Owner sign in" }).first().click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("Email").fill(OWNER);
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/owner\/venues$/);
  await expect(page.getByRole("heading", { name: "Choose a venue" })).toBeVisible();
});

test("a booking made in the player app shows in the owner's calendar", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("player1@example.test");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // Book the first free hour tomorrow on Mauban's Court 1, through the app's own API.
  const date = tomorrowInManila();
  const code = await page.evaluate(async (day) => {
    for (let h = 6; h < 21; h++) {
      const starts_at = new Date(`${day}T${String(h).padStart(2, "0")}:00:00+08:00`).toISOString();
      const q = new URLSearchParams({ court_id: "court-001", starts_at, duration_minutes: "60" });
      const quote = await fetch(`/api/v1/bookings/quote?${q}`, { credentials: "include" });
      if (!quote.ok) continue;
      const { data } = (await quote.json()) as { data: { total: string } };
      const res = await fetch("/api/v1/bookings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          court_id: "court-001",
          starts_at,
          duration_minutes: 60,
          expected_total: data.total,
          payment_method: "pay_at_court",
        }),
      });
      if (res.ok) return ((await res.json()) as { data: { booking_code: string } }).data.booking_code;
    }
    return null;
  }, date);
  expect(code).toMatch(/^CF-\d+$/);

  // Same tab, now as the venue owner: a new page load in a separate app.
  await page.evaluate(() => fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" }));
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER);
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Choose a venue" })).toBeVisible();

  await page.goto(`/owner/v/mauban-pickleball-courts/bookings?date=${date}`);
  await expect(page.getByRole("button", { name: new RegExp(`Open booking ${code}`) })).toBeVisible();
});

test("signing in from an owner page returns there", async ({ page }) => {
  await page.goto("/owner/v/mauban-pickleball-courts/courts");
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("Email").fill("manager@example.test");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/owner\/v\/mauban-pickleball-courts\/courts$/);
  await expect(page.getByRole("heading", { name: "Courts" })).toBeVisible();
});
