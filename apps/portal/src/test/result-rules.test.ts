// Phase 5, M2: results become official when the other side confirms (or after
// 48 hours, or by an organizer); disputes stop them counting; only verified
// competitive matches change ratings, once.
import { setupServer } from "msw/node";
import { handlers } from "@courtflex/mocks";
import { ApiError, api, configureApi, defaultFormat } from "@courtflex/api";
import type { MatchDetail, MatchInput, Me, PlayerStats } from "@courtflex/api";

const server = setupServer(...handlers);
vi.setConfig({ testTimeout: 30_000 });

beforeAll(() => {
  configureApi({ baseUrl: "http://localhost/api/v1" });
  server.listen({ onUnhandledFrame: "error" });
});
afterAll(() => server.close());
beforeEach(() => sessionStorage.clear());

const login = (email: string) =>
  api<Me>("/auth/login", { method: "POST", body: { email, password: "password" } });
const JAMIE = "player1@example.test"; // u-003
const SAM = "player2@example.test"; // u-004

async function expectApiError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  return error as ApiError;
}

const stats = (id = "me") => api<PlayerStats>(`/players/${id}/stats`);
let n = 0;

/** Jamie logs and scores a rally-scored singles match against Sam; `winner` 0 is Jamie. */
async function played(winner: 0 | 1, over: Partial<MatchInput> = {}) {
  await login(JAMIE);
  const m = await api<MatchDetail>("/matches", {
    method: "POST",
    body: {
      match_type: "singles",
      category: "competitive",
      format: { ...defaultFormat, scoring: "rally" },
      team_a: ["u-003"],
      team_b: ["u-004"],
      first_serving: 0,
      ...over,
    },
  });
  await api(`/matches/${m.id}/start`, { method: "POST", body: {} });
  for (let i = 0; i < 11; i++)
    await api(`/matches/${m.id}/score-events`, { method: "POST", body: { event_uuid: `r${++n}`, winner } });
  return api<MatchDetail>(`/matches/${m.id}/submit-result`, { method: "POST", body: {} });
}

describe("results", () => {
  it("wait for the other side; confirming makes it official and rates it once", async () => {
    await login(JAMIE);
    const before = (await stats()).ratings.singles;
    const m = await played(0);
    expect(m).toMatchObject({
      status: "awaiting_confirmation",
      can_confirm: false,
      can_dispute: true,
      ratings: [],
    });
    expect(m.result).toMatchObject({ awaiting_side: 1, submitted_by: { name: "Jamie Player" } });
    expect(m.result!.auto_verify_at).toBeTruthy();
    expect((await stats()).ratings.singles.games).toBe(before.games); // not rated yet

    await expectApiError(api(`/matches/${m.id}/confirm-result`, { method: "POST", body: {} }), 403); // Jamie can't

    await login(SAM);
    const seen = await api<MatchDetail>(`/matches/${m.id}`);
    expect(seen.can_confirm).toBe(true);
    const done = await api<MatchDetail>(`/matches/${m.id}/confirm-result`, { method: "POST", body: {} });
    expect(done.status).toBe("completed");
    expect(done.result!.verified_by!.name).toBe("Sam Player");
    const jamie = done.ratings.find((r) => r.player.name === "Jamie Player")!;
    const sam = done.ratings.find((r) => r.player.name === "Sam Player")!;
    expect(jamie.change).toBeGreaterThan(0);
    expect(sam.change).toBeLessThan(0);

    await login(JAMIE);
    const after = (await stats()).ratings.singles;
    expect(after.games).toBe(before.games + 1);
    expect(after.rating).toBe(jamie.new);
    // Confirming twice can't rate it twice.
    await login(SAM);
    await expectApiError(api(`/matches/${m.id}/confirm-result`, { method: "POST", body: {} }), 409);
  });

  it("a dispute stops it counting until an organizer who isn't playing decides", async () => {
    const m = await played(0);
    await login(SAM);
    await expectApiError(api(`/matches/${m.id}/dispute`, { method: "POST", body: { reason: "no" } }), 422);
    const d = await api<MatchDetail>(`/matches/${m.id}/dispute`, {
      method: "POST",
      body: { reason: "The last two points went to me." },
    });
    expect(d).toMatchObject({ status: "disputed", ratings: [] });
    expect(d.result!.dispute!.reason).toBe("The last two points went to me.");

    // Jamie made the match and plays in it: he can't settle his own dispute.
    await login(JAMIE);
    await expectApiError(api(`/matches/${m.id}/verify`, { method: "POST", body: {} }), 403);
    // The Super Admin can.
    await login("admin@example.test");
    const v = await api<MatchDetail>(`/matches/${m.id}/verify`, { method: "POST", body: {} });
    expect(v.status).toBe("completed");
    expect(v.ratings).toHaveLength(2);
  });

  it("become official after 48 hours with no dispute", async () => {
    const m = await played(1);
    await api(`/__mock/age-result/${m.id}`, { method: "POST" });
    const settled = await api<MatchDetail>(`/matches/${m.id}`);
    expect(settled.status).toBe("completed");
    expect(settled.result!.verified_by).toBeNull();
    expect(settled.ratings.find((r) => r.player.name === "Sam Player")!.change).toBeGreaterThan(0);
  });

  it("casual matches are final straight away and never rated", async () => {
    await login(JAMIE);
    const before = (await stats()).ratings.singles.games;
    const m = await played(0, { category: "casual" });
    expect(m).toMatchObject({ status: "completed", ratings: [] });
    expect((await stats()).ratings.singles.games).toBe(before);
    expect((await stats()).totals.casual).toBeGreaterThan(0);
  });

  it("an organizer who isn't playing submits: official now", async () => {
    await login("staff@example.test");
    const m = await api<MatchDetail>("/matches", {
      method: "POST",
      body: {
        match_type: "singles",
        category: "competitive",
        format: { ...defaultFormat, scoring: "rally" },
        team_a: ["u-006"],
        team_b: ["u-007"],
        first_serving: 0,
        court_id: "court-001",
      },
    });
    await api(`/matches/${m.id}/start`, { method: "POST", body: {} });
    for (let i = 0; i < 11; i++)
      await api(`/matches/${m.id}/score-events`, {
        method: "POST",
        body: { event_uuid: `s${++n}`, winner: 0 },
      });
    const done = await api<MatchDetail>(`/matches/${m.id}/submit-result`, { method: "POST", body: {} });
    expect(done.status).toBe("completed");
    expect(done.ratings).toHaveLength(2);
  });
});

describe("statistics", () => {
  it("separate singles and doubles ratings, provisional until 5 rated matches, with history and form", async () => {
    await login(JAMIE);
    const s = await stats();
    expect(s.ratings.singles.type).toBe("singles");
    expect(s.ratings.doubles.type).toBe("doubles");
    for (const r of [s.ratings.singles, s.ratings.doubles]) {
      expect(r.provisional).toBe(r.games < 5);
      expect(r.matches_to_rank).toBe(Math.max(5 - r.games, 0));
      expect(r.wins + r.losses).toBe(r.games);
    }
    expect(s.history.doubles.length).toBe(s.ratings.doubles.games);
    if (s.history.doubles.length) expect(s.history.doubles.at(-1)!.rating).toBe(s.ratings.doubles.rating);
    expect(s.form.length).toBeLessThanOrEqual(5);
    expect(s.totals.wins + s.totals.losses).toBe(s.totals.played);
  });

  it("the sample month gives players real ratings", async () => {
    await login(JAMIE);
    const jun = await stats("u-022"); // advanced
    const ramon = await stats("u-024"); // novice
    const total = jun.ratings.doubles.games + jun.ratings.singles.games;
    expect(total).toBeGreaterThan(0);
    expect(ramon.player.skill).toBe("novice");
    await expectApiError(stats("u-001"), 404); // the Super Admin has no player profile
  });
});
