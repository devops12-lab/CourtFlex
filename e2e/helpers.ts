import { expect, type Page } from "@playwright/test";

export const OWNER = "owner@example.test";
export const STAFF = "staff@example.test";

/** Tomorrow in the club's timezone, so tests don't depend on the time of day. */
export function tomorrowInManila() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function openMauban(page: Page) {
  await signIn(page, OWNER);
  await page.getByRole("link", { name: /Mauban Pickleball Courts/ }).click();
  await expect(page.getByRole("heading", { name: "Court board" })).toBeVisible();
}

/**
 * Opens tomorrow's calendar. The mock session survives the reload, and the
 * mock data resets to the sample day, so every test starts from the same state.
 */
export async function openTomorrowsCalendar(page: Page) {
  await page.goto(`/owner/v/mauban-pickleball-courts/bookings?date=${tomorrowInManila()}`);
  await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible();
}

/** Collects uncaught errors in the page so a test can assert there were none. */
export function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}
