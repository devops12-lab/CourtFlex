import { expect, test, type Page } from "@playwright/test";

// Phase 5, M4: tournaments.

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("a player registers a doubles team, then withdraws", async ({ page }) => {
  await signIn(page, "player1@example.test");
  await page.goto("/tournaments");
  await page.getByRole("link", { name: /Mauban Doubles Open/ }).click();
  await expect(page.getByRole("heading", { name: "Mauban Doubles Open", level: 1 })).toBeVisible();
  const register = page.getByRole("region", { name: "Register" });
  await register.getByLabel("Find a player for Your partner").fill("Bea");
  await register.getByRole("button", { name: /Bea Mendoza/ }).click();
  await register.getByRole("button", { name: "Register our team" }).click();
  await expect(page.getByText("You're registered for Mauban Doubles Open.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Your entry" })).toContainText("Jamie & Bea");
  await page.getByRole("button", { name: "Withdraw" }).click();
  await expect(page.getByText("You've withdrawn.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Register" })).toBeVisible();
});

test("the organizer starts the tournament: a seeded bracket with byes, matches ready to score", async ({
  page,
}) => {
  await signIn(page, "owner@example.test");
  await page.goto("/tournaments/mauban-doubles-open");
  await page.getByRole("button", { name: /Start tournament \(6 teams\)/ }).click();
  await expect(page.getByText("The draw is made.")).toBeVisible();
  const bracket = page.getByRole("region", { name: "Bracket" });
  await expect(bracket.getByRole("heading", { name: "Quarterfinals" })).toBeVisible();
  await expect(bracket.getByRole("heading", { name: "Final", exact: true })).toBeVisible();
  await expect(bracket.getByText("Bye")).toHaveCount(2);
  await bracket
    .getByRole("link", { name: /^Quarterfinals:/ })
    .first()
    .click();
  await expect(page.getByRole("button", { name: "Start match" })).toBeVisible();
});

test("a finished tournament shows its champion, pools and knockout", async ({ page }) => {
  await page.goto("/tournaments/saturday-shootout");
  await expect(page.getByRole("region", { name: "Champion" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Pool A standings" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Pool B standings" })).toBeVisible();
  const knockout = page.getByRole("region", { name: "Knockout" });
  await expect(knockout.getByRole("heading", { name: "Semifinals" })).toBeVisible();
  await expect(knockout.getByRole("heading", { name: "Final", exact: true })).toBeVisible();
});

test("a club owner runs a round robin", async ({ page }) => {
  await signIn(page, "player1@example.test"); // owns Tara Pikol Mauban
  await page.goto("/tournaments");
  await page.getByRole("link", { name: "Run a tournament" }).click();
  await expect(page.getByRole("heading", { name: "Run a tournament" })).toBeVisible();
  await page.getByLabel("Name").fill("Tara Pikol Singles Night");
  await page
    .locator("label")
    .filter({ hasText: /^Singles$/ })
    .click();
  await page.getByLabel("Format").selectOption("round_robin");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Open registration" }).click();
  await expect(page.getByRole("heading", { name: "Tara Pikol Singles Night", level: 1 })).toBeVisible();
  await expect(page.getByText("Taking entries")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Organizer" })).toBeVisible();
});

test("the venue sees its tournaments and sets up a match on a court", async ({ page }) => {
  await signIn(page, "owner@example.test");
  await page.goto("/owner/v/mauban-pickleball-courts/tournaments");
  await expect(page.getByRole("heading", { name: "Tournaments", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /Saturday Shootout/ })).toBeVisible();

  await page.goto("/owner/v/mauban-pickleball-courts/matches");
  await page.getByRole("link", { name: "New match on a court" }).click();
  await expect(page.getByRole("heading", { name: "Log a match" })).toBeVisible();
  await page.getByLabel("Court", { exact: true }).selectOption({ label: "Court 2" });
  await page
    .locator("label")
    .filter({ hasText: /^Singles$/ })
    .click();
  await page.getByLabel("Find a player for Side A").fill("Andrea");
  await page.getByRole("button", { name: /Andrea Santos/ }).click();
  await page.getByLabel("Find a player for Side B").fill("Miguel");
  await page.getByRole("button", { name: /Miguel Reyes/ }).click();
  await page.getByRole("button", { name: "Create match" }).click();
  await expect(page.getByText(/Court 2, Mauban Pickleball Courts/)).toBeVisible();
});
