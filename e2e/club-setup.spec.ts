import { expect, test, type Page } from "@playwright/test";
import { OWNER, STAFF, signIn, tomorrowInManila } from "./helpers";

const MANAGER = "manager@example.test";

async function openClub(page: Page, email: string, club: RegExp) {
  await signIn(page, email);
  await page.getByRole("link", { name: club }).click();
  await expect(page.getByRole("heading", { name: "Court board" })).toBeVisible();
}

/** Desktop shows the sidebar; phones put extra pages under "More". */
async function goTo(page: Page, name: string) {
  const link = page.getByRole("link", { name, exact: true });
  if (await link.first().isVisible()) return link.first().click();
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog").getByRole("link", { name, exact: true }).click();
}

test("owner adds a court and lands on its settings", async ({ page }) => {
  await openClub(page, OWNER, /Quezon Sports Courts/);
  await goTo(page, "Courts");
  await page.getByRole("button", { name: "Add court" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Name").fill("Court C");
  await panel.getByLabel("Code").fill("cc");
  await panel.getByLabel("Base rate per hour").fill("275");
  await panel.getByRole("button", { name: "Add court" }).click();
  await expect(page.getByText("Court C added.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Court C" })).toBeVisible();
  await page.getByRole("tab", { name: "Opening hours" }).click();
  await expect(page.getByRole("checkbox", { name: "Monday" })).toBeChecked();
});

test("a closure over a booking lists the booking; a clear one is saved", async ({ page }) => {
  await openClub(page, OWNER, /Mauban Pickleball Courts/);
  await goTo(page, "Courts");
  await page.getByRole("button", { name: "Add closure" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Date").fill(tomorrowInManila());
  await panel.getByLabel("From").selectOption("06:00");
  await panel.getByLabel("Until").selectOption("09:00");
  await panel.getByLabel("Reason").fill("Fun run on Rizal St.");
  await panel.getByRole("button", { name: "Add closure" }).click();
  // Joy Navarro has Court 1 at 7 AM tomorrow.
  await expect(panel.getByText(/Joy Navarro, Court 1/)).toBeVisible();

  await panel.getByLabel("From").selectOption("10:00");
  await panel.getByLabel("Until").selectOption("12:00");
  await panel.getByRole("button", { name: "Add closure" }).click();
  await expect(page.getByText("Closure added. That time is no longer bookable.")).toBeVisible();
  await expect(page.getByText("Fun run on Rizal St.")).toBeVisible();
});

test("owner adds a weekend rate", async ({ page }) => {
  await openClub(page, OWNER, /Mauban Pickleball Courts/);
  await page.goto("/owner/v/mauban-pickleball-courts/courts/court-002");
  await page.getByRole("tab", { name: "Rates" }).click();
  await page.getByRole("button", { name: "Add rate" }).click();
  await page.getByLabel("Rate 1 days").selectOption({ label: "Saturday" });
  await page.getByLabel("Rate 1 per hour").fill("480");
  await page.getByRole("button", { name: "Save rates" }).click();
  await expect(page.getByText("Rates for Court 2 saved. New bookings use them.")).toBeVisible();
});

test("owner invites staff, changes a role and removes an invite", async ({ page }) => {
  await openClub(page, OWNER, /Mauban Pickleball Courts/);
  await goTo(page, "Staff");
  await page.getByRole("button", { name: "Invite staff" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Email").fill("lito@example.test");
  await panel.getByLabel("Name").fill("Lito Ramos");
  await panel.getByText("Scorer", { exact: true }).click();
  await panel.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText("Invite sent to lito@example.test as scorer.")).toBeVisible();

  await page.getByRole("button", { name: "Manage Dana Cruz" }).click();
  await page.getByRole("dialog").getByText("Front desk", { exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save role" }).click();
  await expect(page.getByText("Dana Cruz is now front desk.")).toBeVisible();

  await page.getByRole("button", { name: "Manage Kim Aquino" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove from venue" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove Kim" }).click();
  await expect(page.getByText("Kim Aquino removed from Mauban Pickleball Courts.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage Kim Aquino" })).toHaveCount(0);

  // The owner's own row can't be opened.
  await expect(page.getByRole("button", { name: "Manage Alex Venue Owner" })).toHaveCount(0);
});

test("renaming the club updates the header", async ({ page }) => {
  await openClub(page, OWNER, /Mauban Pickleball Courts/);
  await goTo(page, "Settings");
  await page.getByLabel("Venue name").fill("Mauban Pickleball Courts & Cafe");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Venue settings saved.")).toBeVisible();
  await expect(page.getByRole("banner").getByText("Mauban Pickleball Courts & Cafe")).toBeVisible();
});

test("a refund marks the payment refunded and keeps the original", async ({ page }) => {
  await openClub(page, OWNER, /Mauban Pickleball Courts/);
  await page.goto("/owner/v/mauban-pickleball-courts/bookings");
  // Jamie Player paid ₱350 cash for Court 1 at 5 PM today.
  await page.getByRole("button", { name: /^Jamie Player, 5:00 PM/ }).click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "Refund or correct" }).click();
  await panel.getByLabel("Reason").fill("Rained out, refunded in cash");
  await panel.getByRole("button", { name: "Review" }).click();
  await panel.getByRole("button", { name: "Record refund" }).click();
  await expect(page.getByText("Refund of ₱350 recorded.")).toBeVisible();
  await expect(panel.getByText("Refunded", { exact: true })).toBeVisible();
  await expect(panel.getByText("Rained out, refunded in cash")).toBeVisible();
  await expect(panel.getByText("−₱350")).toBeVisible();
});

test("a manager runs courts and refunds but not staff, settings or the plan", async ({ page }) => {
  // Dana works at one venue, so signing in goes straight to it.
  await signIn(page, MANAGER);
  await expect(page.getByRole("heading", { name: "Court board" })).toBeVisible();
  await goTo(page, "Courts");
  await expect(page.getByRole("button", { name: "Add court" })).toBeVisible();
  for (const name of ["Staff", "Settings", "Plan"]) {
    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  }
  await page.goto("/owner/v/mauban-pickleball-courts/staff");
  await expect(page.getByText("Only the venue owner can manage staff.")).toBeVisible();
});

test("front desk can't refund", async ({ page }) => {
  await signIn(page, STAFF);
  await expect(page.getByRole("heading", { name: "Court board" })).toBeVisible();
  await page.goto("/owner/v/mauban-pickleball-courts/bookings");
  await page.getByRole("button", { name: /^Jamie Player, 5:00 PM/ }).click();
  await expect(page.getByRole("dialog").getByText("Cash", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Refund or correct" })).toHaveCount(0);
});

test("an expired venue can be viewed but not changed", async ({ page }) => {
  await signIn(page, OWNER);
  await page.getByRole("link", { name: /Lucena Dink House/ }).click();
  await expect(page.getByText("This venue is read-only.")).toBeVisible();
  await expect(page.getByRole("button", { name: "New walk-in", exact: true })).toHaveCount(0);

  await goTo(page, "Courts");
  await expect(page.getByRole("button", { name: "Add court" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open Court 1" }).click();
  await expect(page.getByLabel("Name")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save details" })).toHaveCount(0);

  await page.goto("/owner/v/lucena-dink-house/subscription");
  await expect(page.getByText(/The plan ended/)).toBeVisible();
});
