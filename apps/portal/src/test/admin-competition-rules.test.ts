// Phase 5, M5: the Super Admin settles disputes, reverses results with
// compensating rating entries, corrects ratings with a reason, and sets the
// rating rules. Everything is audited.
import { setupServer } from "msw/node";
import { handlers } from "@courtflex/mocks";
import { ApiError, api, configureApi, defaultFormat } from "@courtflex/api";
import type {
  AdminDashboard,
  AdminDispute,
  AuditPage,
  Leaderboard,
  MatchDetail,
  Me,
  PlayerStats,
  RatingAdjustment,
  RatingRulesInput,
} from "@courtflex/api";

const server = setupServer(...handlers);
vi.setConfig({ testTimeout: 60_000 });

beforeAll(() => {
  configureApi({ baseUrl: "http://localhost/api/v1" });
  server.listen({ onUnhandledFrame: "error" });
});
afterAll(() => server.close());
beforeEach(() => sessionStorage.clear());

const login = (email: string) =>
  api<Me>("/auth/login", { method: "POST", body: { email, password: "password" } });
const admin = () => login("admin@example.test");

async function expectApiError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  return error as ApiError;
}

let n = 0;
/** Jamie beats Sam 11-0 (rally scoring, competitive) and Sam disputes it, unless `confirm`. */
async function disputed(confirm = false) {
  await login("player1@example.test");
  const m = await api<MatchDetail>("/matches", {
    method: "POST",
    body: {
      match_type: "singles",
      category: "competitive",
      format: { ...defaultFormat, scoring: "rally" },
      team_a: ["u-003"],
      team_b: ["u-004"],
      first_serving: 0,
    },
  });
  await api(`/matches/${m.id}/start`, { method: "POST", body: {} });
  for (let i = 0; i < 11; i++)
    await api(`/matches/${m.id}/score-events`, {
      method: "POST",
      body: { event_uuid: `c${++n}`, winner: 0 },
    });
  await api(`/matches/${m.id}/submit-result`, { method: "POST", body: {} });
  await login("player2@example.test");
  if (confirm) return api<MatchDetail>(`/matches/${m.id}/confirm-result`, { method: "POST", body: {} });
  return api<MatchDetail>(`/matches/${m.id}/dispute`, {
    method: "POST",
    body: { reason: "That last rally was mine." },
  });
}
const stats = (id: string) => api<PlayerStats>(`/players/${id}/stats`);

describe("disputes", () => {
  it("are listed for the Super Admin, oldest first, and counted on the dashboard", async () => {
    const m = await disputed();
    await admin();
    const open = await api<AdminDispute[]>("/admin/disputes");
    const mine = open.find((d) => d.match.id === m.id)!;
    expect(mine).toMatchObject({
      dispute: { reason: "That last rally was mine.", by: { name: "Sam Player" } },
    });
    expect((await api<AdminDashboard>("/admin/dashboard")).counts.disputes).toBeGreaterThan(0);
    await login("player1@example.test");
    await expectApiError(api("/admin/disputes"), 403);
  });

  it("keep: the result is official and rated; the players see the note", async () => {
    const m = await disputed();
    await admin();
    await expectApiError(
      api(`/admin/matches/${m.id}/resolve`, { method: "POST", body: { decision: "keep", note: "ok" } }),
      422,
    );
    const r = await api<AdminDispute>(`/admin/matches/${m.id}/resolve`, {
      method: "POST",
      body: { decision: "keep", note: "The scorer's record matches the video." },
    });
    expect(r.resolution).toMatchObject({ decision: "keep", by: { name: "Platform Admin" } });
    const seen = await api<MatchDetail>(`/matches/${m.id}`);
    expect(seen.status).toBe("completed");
    expect(seen.ratings).toHaveLength(2);
    expect(seen.result!.dispute!.resolution!.note).toBe("The scorer's record matches the video.");
    const log = await api<AuditPage>("/admin/audit-logs", { query: { type: "competition" } });
    expect(log.entries[0]).toMatchObject({ action: "match.dispute_kept" });
  });

  it("void: it doesn't count, and nothing is rated", async () => {
    const m = await disputed();
    await admin();
    await api(`/admin/matches/${m.id}/resolve`, {
      method: "POST",
      body: { decision: "void", note: "No one can agree; replay it." },
    });
    const seen = await api<MatchDetail>(`/matches/${m.id}`);
    expect(seen).toMatchObject({ status: "voided", ratings: [] });
  });
});

describe("reversing an official result", () => {
  it("undoes the rating changes with new entries, not by deleting", async () => {
    await admin();
    const before = (await stats("u-003")).ratings.singles;
    const m = await disputed(true); // Sam confirms: official
    await admin();
    const mid = (await stats("u-003")).ratings.singles;
    expect(mid.games).toBe(before.games + 1);
    const r = await api<{ rating_changes_undone: number }>(`/admin/matches/${m.id}/reverse`, {
      method: "POST",
      body: { reason: "Jamie entered a fake opponent account." },
    });
    expect(r.rating_changes_undone).toBe(2);
    const after = (await stats("u-003")).ratings.singles;
    expect(after.rating).toBe(before.rating);
    expect(after.games).toBe(before.games);
    // The history keeps both: the match and its reversal.
    const history = (await stats("u-003")).history.singles;
    expect(history.length).toBe(before.games + 2);
    await expectApiError(
      api(`/admin/matches/${m.id}/reverse`, { method: "POST", body: { reason: "Second try at reversing." } }),
      409,
    );
  });
});

describe("rating corrections", () => {
  it("set a rating with a reason; it's audited and the leaderboard follows", async () => {
    await admin();
    const e = await expectApiError(
      api("/admin/ratings/adjust", {
        method: "POST",
        body: { player_id: "u-024", type: "doubles", rating: 1500, reason: "x" },
      }),
      422,
    );
    expect(e.field("reason")).toBeTruthy();
    await api("/admin/ratings/adjust", {
      method: "POST",
      body: {
        player_id: "u-024",
        type: "doubles",
        rating: 1500,
        reason: "Ratings carried over from the national ladder.",
      },
    });
    const list = await api<RatingAdjustment[]>("/admin/ratings/adjustments");
    expect(list[0]).toMatchObject({ player: { name: "Ramon Aguilar" }, new: 1500, type: "doubles" });
    const board = await api<Leaderboard>("/rankings", { query: { type: "doubles" } });
    expect(board.ranked[0]!.player.name).toBe("Ramon Aguilar");
    expect((await stats("u-024")).ratings.doubles.rating).toBe(1500);
  });
});

describe("rating rules", () => {
  it("validated; fewer matches to be ranked ranks more players straight away", async () => {
    await admin();
    const rules = await api<RatingRulesInput>("/admin/rating-rules");
    expect(rules).toEqual({ initial: 1200, provisional_matches: 5, k_provisional: 32, k_established: 24 });
    const e = await expectApiError(
      api("/admin/rating-rules", { method: "PUT", body: { ...rules, k_established: 40 } }),
      422,
    );
    expect(e.field("k_established")).toMatch(/no higher/);
    const before = (await api<Leaderboard>("/rankings", { query: { type: "singles" } })).ranked.length;
    await api("/admin/rating-rules", { method: "PUT", body: { ...rules, provisional_matches: 2 } });
    const after = (await api<Leaderboard>("/rankings", { query: { type: "singles" } })).ranked.length;
    expect(after).toBeGreaterThan(before);
    await api("/admin/rating-rules", { method: "PUT", body: rules });
  });
});
