import { expect, test, type Page } from "@playwright/test";

// Phase 5, M1: log a match, keep score with the Live Scorer, watch it live.

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("a player logs a singles match and scores it to the end", async ({ page }) => {
  await signIn(page, "player1@example.test");
  await page.goto("/matches/new");
  await expect(page.getByRole("heading", { name: "Log a match" })).toBeVisible();
  await page
    .locator("label")
    .filter({ hasText: /^Singles$/ })
    .click();
  await page.getByLabel("Find a player for Side B").fill("Sam");
  await page.getByRole("button", { name: /Sam Player/ }).click();
  await page.getByLabel("Scoring").selectOption("rally");
  await page.getByRole("button", { name: "Create match" }).click();

  await expect(page.getByRole("heading", { name: "Jamie vs Sam" })).toBeVisible();
  await page.getByRole("button", { name: "Start match" }).click();
  const jamie = page.getByRole("button", { name: /^Rally to Jamie/ });
  const sam = page.getByRole("button", { name: /^Rally to Sam/ });
  await expect(jamie).toBeVisible();

  await jamie.click();
  await expect(page.getByLabel("Called score 1-0")).toBeVisible();
  await sam.click();
  await expect(page.getByLabel("Called score 1-1")).toBeVisible();
  await page.getByRole("button", { name: "Undo last rally" }).click();
  await expect(page.getByLabel("Called score 1-0")).toBeVisible();

  for (let i = 2; i <= 10; i++) {
    await jamie.click();
    await expect(page.getByLabel(`Called score ${i}-0`)).toBeVisible();
  }
  await expect(page.getByText("Match point")).toBeVisible();
  await jamie.click();
  await expect(page.getByText("Jamie Player win 11-0.")).toBeVisible();
  await page.getByRole("button", { name: "Submit result" }).click();
  await expect(page.getByText("Result submitted.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Result" })).toContainText("Jamie Player won 11-0");

  await page.getByRole("button", { name: "Point history" }).click();
  await expect(page.getByRole("dialog").getByText("Undo")).toBeVisible();
});

test("anyone can watch a live match; only the scorer scores", async ({ page }) => {
  await page.goto("/matches/m-1");
  await expect(page.getByRole("heading", { name: /Andrea & Miguel vs Carla & Paolo/ })).toBeVisible();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Rally to/ })).toHaveCount(0);

  // The front desk keeps score; a visitor watching sees it update.
  await signIn(page, "staff@example.test");
  await page.goto("/matches/m-1");
  const before = await page.getByLabel(/^Called score/).getAttribute("aria-label");
  await page.getByRole("button", { name: /^Rally to Andrea/ }).click();
  await expect(page.getByLabel(/^Called score/)).not.toHaveAttribute("aria-label", before!);
});

test("matches show on the player's Matches page", async ({ page }) => {
  await signIn(page, "player1@example.test");
  await page.goto("/matches");
  await expect(page.getByRole("heading", { name: "Ready to start" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent" })).toBeVisible();
  await page.getByRole("link", { name: /Jamie & Bea/ }).click();
  await expect(page.getByRole("button", { name: "Start match" })).toBeVisible();
});

test("an open play host scores a game straight from the court, and the venue sees it", async ({ page }) => {
  await signIn(page, "player1@example.test");
  await page
    .getByRole("link", { name: /Tara Pikol Night Rally/ })
    .first()
    .click();
  await page.getByRole("link", { name: "Open courts and queue" }).click();
  const court4 = page.getByRole("article", { name: "Court 4" });
  await expect(court4).toBeVisible();
  await court4.getByRole("button", { name: "Score this game" }).click();

  await expect(page.getByRole("button", { name: "Start match" })).toBeVisible();
  await page.getByRole("button", { name: "Start match" }).click();
  await page
    .getByRole("button", { name: /^Rally to / })
    .first()
    .click();
  await expect(page.getByLabel("Called score 1-0-2")).toBeVisible();

  // Back on the queue, the court shows the live score.
  await page.goBack();
  await expect(court4.getByText("Live score")).toBeVisible();
  await expect(court4.getByRole("button", { name: /Live score 1-0-2 Open/ })).toBeVisible();
});

test("the venue's staff see matches on their courts; organizers can void one", async ({ page }) => {
  await signIn(page, "owner@example.test");
  await page.goto("/owner/v/mauban-pickleball-courts/matches");
  await expect(page.getByRole("heading", { name: "Matches", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Live.*Andrea Santos & Miguel Reyes/ })).toBeVisible();

  await page.goto("/matches/m-1");
  await expect(page.getByRole("heading", { name: "Organizer" })).toBeVisible();
  await page.getByRole("button", { name: "Void match" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Reason").fill("Players switched courts halfway.");
  await dialog.getByRole("button", { name: "Void match" }).click();
  await expect(page.getByText("This match was voided. It doesn't count.")).toBeVisible();
});

test("the other side confirms a result: it's official and ratings change", async ({ page }) => {
  await signIn(page, "player2@example.test"); // Sam lost to Jamie yesterday
  await page.goto("/matches");
  const needs = page.getByRole("region", { name: "Needs your confirmation" });
  await expect(needs.getByRole("link", { name: /Jamie/ })).toBeVisible();
  await needs.getByRole("link", { name: /Jamie/ }).click();
  await expect(page.getByText(/Waiting for Sam to confirm/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm result" }).click();
  await expect(page.getByText("Result confirmed. It's official.")).toBeVisible();
  const result = page.getByRole("region", { name: "Result" });
  await expect(result.getByText(/confirmed by Sam Player/)).toBeVisible();
  await expect(result.getByRole("heading", { name: "Rating changes (singles)" })).toBeVisible();
  await expect(result.getByText(/^\+\d+$/)).toBeVisible();
  await expect(result.getByText(/^-\d+$/)).toBeVisible();
});

test("a player disputes a result with a reason", async ({ page }) => {
  await signIn(page, "player2@example.test");
  await page.goto("/matches/m-2");
  await page.getByRole("button", { name: "Dispute" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("What's wrong?").fill("We stopped at 9-7, it never reached 11.");
  await dialog.getByRole("button", { name: "Dispute result" }).click();
  await expect(page.getByText("Result disputed. An organizer will look at it.")).toBeVisible();
  await expect(page.getByText(/Disputed by Sam Player/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm result" })).toHaveCount(0);
});

test("my stats: ratings, record, rating over time", async ({ page }) => {
  await signIn(page, "player1@example.test");
  await page.goto("/players/me");
  await expect(page.getByRole("heading", { name: "My stats" })).toBeVisible();
  const ratings = page.getByRole("region", { name: "Ratings" });
  await expect(ratings.getByText("Singles rating")).toBeVisible();
  await expect(ratings.getByText("Doubles rating")).toBeVisible();
  await expect(page.getByRole("heading", { name: /rating over time/ })).toBeVisible();
  const chart = page.getByRole("img", { name: /^Rating from/ });
  if (await chart.count()) {
    await page.getByText("Show as a table").click();
    await expect(page.getByRole("table", { name: "Rating after each rated match" })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Recent matches" })).toBeVisible();
});

test("rankings: visitors see the country board; players start on their city and see their position", async ({
  page,
}) => {
  await page.goto("/rankings");
  await expect(page.getByRole("heading", { name: "Philippines" })).toBeVisible();
  const board = page.getByRole("list", { name: /Philippines doubles rankings/ });
  await expect(board.getByRole("listitem").first()).toContainText("1");
  await page.getByRole("tab", { name: "Global" }).click();
  await expect(page.getByText("Global rankings aren't open yet.")).toBeVisible();

  await signIn(page, "player1@example.test");
  await page.goto("/rankings");
  await expect(page.getByRole("heading", { name: /^Mauban/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your position" })).toBeVisible();
  await page
    .locator("label")
    .filter({ hasText: /^Singles$/ })
    .click();
  await expect(
    page.getByRole("list", { name: /singles rankings/ }).or(page.getByText(/No one here has/)),
  ).toBeVisible();

  // A ranked player's name opens their stats.
  await page.goto("/rankings?scope=country");
  await page
    .getByRole("list", { name: /Philippines doubles rankings/ })
    .getByRole("link")
    .first()
    .click();
  await expect(page.getByRole("list", { name: "Rankings" }).getByText("#1").first()).toBeVisible();
});
