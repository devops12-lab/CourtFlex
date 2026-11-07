import { expect, test, type Page } from "@playwright/test";
import { openMauban, signIn } from "./helpers";

const PLAYER = "http://localhost:5174";
const JAMIE = "player1@example.test"; // runs Tara Pikol Mauban
const SAM = "player2@example.test";
const CARLA = "carla@example.test"; // runs Lucena Dinkers
const TRISHA = "trisha@example.test";

async function playerSignIn(page: Page, email: string) {
  await page.goto(`${PLAYER}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Signing in lands on Home; these tests start from the sessions list.
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await page.goto(`${PLAYER}/sessions`);
  await expect(page.getByRole("heading", { name: "Open play" })).toBeVisible();
}

async function openSession(page: Page, title: string) {
  await page
    .getByRole("link", { name: new RegExp(title) })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

/** Portal: desktop shows the sidebar; phones put extra pages under "More". */
async function portalGoTo(page: Page, name: string) {
  const link = page.getByRole("link", { name, exact: true });
  if (await link.first().isVisible()) return link.first().click();
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog").getByRole("link", { name, exact: true }).click();
}

test.describe("players", () => {
  test("register for a session, then cancel", async ({ page }) => {
    await playerSignIn(page, SAM);
    await openSession(page, "Beginner Clinic and Play");
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page.getByText("You're registered")).toBeVisible();
    await expect(page.getByText("Pay ₱100 to the host at check-in.")).toBeVisible();
    await page.getByRole("button", { name: "Cancel registration" }).click();
    await expect(page.getByText("Registration cancelled.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Register" })).toBeVisible();
  });

  test("a full session offers the waitlist", async ({ page }) => {
    await playerSignIn(page, SAM);
    await openSession(page, "Thursday Social Night");
    await expect(page.getByText("This session is full")).toBeVisible();
    await page.getByRole("button", { name: "Join waitlist" }).click();
    await expect(page.getByText("You're number 3 on the waitlist")).toBeVisible();
  });

  test("joining a club: details, profile, plan, agreement, then GCash receipt checked by an admin", async ({
    page,
  }) => {
    await playerSignIn(page, TRISHA);
    await page.goto(`${PLAYER}/clubs/community/lucena-dinkers`);
    await page.getByRole("link", { name: "Apply to join" }).click();
    await expect(page.getByRole("heading", { name: "Join Lucena Dinkers" })).toBeVisible();

    // Step 1: every detail is required.
    await page.getByRole("button", { name: "Next step" }).click();
    await expect(page.getByText("Enter your date of birth.")).toBeVisible();
    await page.getByLabel("Mobile number", { exact: true }).fill("09175550101");
    await page.getByLabel("Date of birth").fill("1996-08-21");
    await page.getByLabel("Gender").selectOption("female");
    await page.getByLabel("Their name").fill("Lorna Cruz");
    await page.getByLabel("Their mobile number").fill("09175550202");
    await page.getByRole("button", { name: "Next step" }).click();

    // Step 2: pickleball profile.
    await page.getByRole("radio", { name: /Intermediate/ }).click();
    await page.getByLabel("Playing hand").selectOption("right");
    await page.getByLabel("You mostly play for").selectOption("social");
    await page.getByLabel("Evenings (4–10 PM)").check();
    await page.getByRole("button", { name: "Next step" }).click();

    // Step 3: the club's one paid plan, paid by GCash.
    await expect(page.getByRole("heading", { name: "Membership plan" })).toBeVisible();
    await page.getByLabel("GCash").check();
    await page.getByRole("button", { name: "Next step" }).click();

    // Step 4: agree and sign by typing the same name.
    await page.getByLabel("I agree to the Lucena Dinkers membership agreement.").check();
    await page.getByText("Type your name", { exact: true }).click();
    await page.getByLabel("Type your full name to sign").fill("Wrong Name");
    await page.getByRole("button", { name: "Send application and pay" }).click();
    await expect(page.getByText(/Type your name exactly as on step 1/)).toBeVisible();
    const name = "Trisha Lim";
    await page.getByLabel("Type your full name to sign").fill(name);
    await page.getByRole("button", { name: "Send application and pay" }).click();

    // Pay and upload. An upload alone doesn't make them a member.
    await expect(page.getByRole("heading", { name: /Send ₱150 by GCash/ })).toBeVisible();
    await expect(page.getByText("09271234567")).toBeVisible();
    await page.getByRole("button", { name: "Send receipt" }).click();
    await expect(page.getByText("Add the screenshot of your receipt.")).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({
      name: "receipt.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
    await page.getByLabel("Reference number (optional)").fill("5566778899");
    await page.getByRole("button", { name: "Send receipt" }).click();
    await expect(page.getByRole("heading", { name: "Receipt sent" })).toBeVisible();

    // Carla, who runs the club, checks the receipt and confirms. Same tab, so the demo data carries over.
    await page.evaluate(() => fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" }));
    await playerSignIn(page, CARLA);
    await page.goto(`${PLAYER}/clubs/community/lucena-dinkers/manage`);
    await page.getByRole("tab", { name: /Requests/ }).click();
    await expect(page.getByText("Receipt to check")).toBeVisible();
    await page.getByRole("button", { name: `Open ${name}` }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("5566778899", { exact: true })).toBeVisible();
    await sheet.getByText("Join form and signature").click();
    await expect(sheet.getByText("Lorna Cruz, 09175550202")).toBeVisible();
    await sheet.getByRole("button", { name: "Confirm payment and approve" }).click();
    await expect(page.getByText(`Payment confirmed. ${name} is now a member.`)).toBeVisible();
  });

  test("starting a club sends it for review", async ({ page }) => {
    await playerSignIn(page, TRISHA);
    await page.goto(`${PLAYER}/clubs/new`);
    await page.getByLabel("Club name").fill("Daungan Dinkers");
    await page.getByLabel("One line about the club").fill("Sunday games by the port");
    await page.getByLabel("City or municipality").fill("Mauban");
    await page.getByRole("button", { name: "Send for review" }).click();
    await expect(page.getByRole("heading", { name: "Daungan Dinkers" })).toBeVisible();
    await expect(page.getByText("Waiting for CourtFlex review.")).toBeVisible();
  });
});

test.describe("community hosts", () => {
  test("run the live queue: finish a game and the next four go on", async ({ page }) => {
    await playerSignIn(page, JAMIE);
    await openSession(page, "Tara Pikol Night Rally");
    await page.getByRole("link", { name: "Open courts and queue" }).click();
    const court4 = page.getByRole("article", { name: "Court 4" });
    await expect(court4).toBeVisible();

    // Check two more players in so four are waiting.
    await page.getByRole("tab", { name: /Players/ }).click();
    for (let i = 0; i < 2; i++) {
      await page.getByRole("button", { name: "Check in" }).first().click();
      await expect(page.getByText(/checked in and added to the line/).first()).toBeVisible();
    }
    await page.getByRole("tab", { name: /Courts and queue/ }).click();
    await expect(page.getByRole("listitem").filter({ hasText: /waiting \d+ min/ })).toHaveCount(4);
    const firstInLine = (await page
      .getByRole("listitem")
      .filter({ hasText: /waiting/ })
      .first()
      .locator("span.truncate")
      .textContent())!;

    await court4.getByRole("button", { name: "Left side won" }).click();
    await expect(page.getByText("Court 4 finished. Next four are on.")).toBeVisible();
    await expect(court4).toContainText(firstInLine);
  });

  test("host a session at a venue that doesn't need approval", async ({ page }) => {
    await playerSignIn(page, JAMIE);
    await page.getByRole("link", { name: "Host a session" }).click();
    await page.getByLabel("Venue").selectOption({ label: "Quezon Sports Courts, Lucena" });
    const date = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel("Date").fill(date);
    await page.getByLabel("Starts").selectOption("08:00");
    await page.getByLabel("Ends").selectOption("10:00");
    await page.locator("label", { hasText: "Court B" }).click();
    await expect(page.getByText(/Court fee: ₱500/)).toBeVisible();
    await page.getByLabel("Name").fill("Tara Pikol in Lucena");
    await page.getByRole("button", { name: "Create session" }).click();
    await expect(page.getByRole("heading", { name: "Tara Pikol in Lucena" })).toBeVisible();
    await expect(page.getByText("You're running this session.")).toBeVisible();
  });

  test("approve a member request", async ({ page }) => {
    await playerSignIn(page, CARLA);
    await page.goto(`${PLAYER}/clubs/community/lucena-dinkers/manage`);
    await page.getByRole("tab", { name: /Requests/ }).click();
    await page.getByRole("button", { name: "Open Jamie Player" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Jamie Player is now a member.")).toBeVisible();
  });
});

test.describe("venue staff", () => {
  test("approve a community session on the venue's courts", async ({ page }) => {
    await openMauban(page);
    await portalGoTo(page, "Open play");
    await page.getByRole("tab", { name: /Needs approval/ }).click();
    await page.getByRole("link", { name: /Dinkers Away Day at Mauban/ }).click();
    await expect(page.getByRole("button", { name: "Record court fee" })).toHaveCount(0); // not until approved
    await page.getByRole("button", { name: "Approve session" }).click();
    await expect(page.getByText(/Approved\. Dinkers Away Day at Mauban is now open/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Record court fee" })).toBeVisible();
  });

  test("create a venue session", async ({ page }) => {
    await openMauban(page);
    await portalGoTo(page, "Open play");
    await page.getByRole("link", { name: "New session" }).click();
    const date = new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel("Date").fill(date);
    await page.getByLabel("Starts").selectOption("06:00");
    await page.getByLabel("Ends").selectOption("08:00");
    await page.locator("label", { hasText: "Court 4" }).click();
    await page.getByLabel("Name").fill("Sunrise Drills");
    await page.getByRole("button", { name: "Create session" }).click();
    await expect(page.getByText("Sunrise Drills is open for registration.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sunrise Drills" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Players/ })).toBeVisible();
  });

  test("venues have no members page: only clubs have members", async ({ page }) => {
    await openMauban(page);
    await expect(page.getByRole("link", { name: "Members" })).toHaveCount(0);
    await page.goto("/owner/v/mauban-pickleball-courts/members");
    await expect(page.getByRole("heading", { name: "Members" })).toHaveCount(0);
  });

  test("front desk sees open play but not payments", async ({ page }) => {
    await signIn(page, "staff@example.test");
    await expect(page.getByRole("heading", { name: "Court board" })).toBeVisible();
    await page.goto("/owner/v/mauban-pickleball-courts/open-play");
    await expect(page.getByRole("heading", { name: "Open play" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New session" })).toHaveCount(0);
    await page.goto("/owner/v/mauban-pickleball-courts/payments");
    await expect(page.getByText("Only owners and managers can see the venue's payments.")).toBeVisible();
  });
});
