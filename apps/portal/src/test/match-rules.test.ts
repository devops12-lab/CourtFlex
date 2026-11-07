// Phase 5, M1: matches and the Live Scorer, against the mock API. The server's
// score is official; a retried tap never counts twice; undo is its own event.
import { setupServer } from "msw/node";
import { handlers } from "@courtflex/mocks";
import { ApiError, api, configureApi, defaultFormat } from "@courtflex/api";
import type { MatchDetail, MatchInput, MatchSummary, Me, ScoreEventView } from "@courtflex/api";

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
const JAMIE = "u-003";
const SAM = "u-004";

async function expectApiError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  return error as ApiError;
}

const create = (over: Partial<MatchInput> = {}) =>
  api<MatchDetail>("/matches", {
    method: "POST",
    body: {
      match_type: "singles",
      category: "casual",
      format: defaultFormat,
      team_a: [JAMIE],
      team_b: [SAM],
      first_serving: 0,
      ...over,
    },
  });
let tap = 0;
const point = (id: string, winner: 0 | 1, uuid = `t-${++tap}`) =>
  api<MatchDetail>(`/matches/${id}/score-events`, { method: "POST", body: { event_uuid: uuid, winner } });

describe("creating matches", () => {
  it("players log their own match; they must be in it", async () => {
    await login("player1@example.test");
    const m = await create();
    expect(m).toMatchObject({ status: "scheduled", scorer: { name: "Jamie Player" }, can_score: true });
    const e = await expectApiError(create({ team_a: ["u-010"], team_b: [SAM] }), 422);
    expect(e.field("teams")).toMatch(/Add yourself/);
  });

  it("checks the teams for singles and doubles", async () => {
    await login("player1@example.test");
    const e = await expectApiError(create({ match_type: "doubles" }), 422);
    expect(e.field("teams")).toMatch(/two players on each side/);
    const dup = await expectApiError(create({ team_b: [JAMIE] }), 422);
    expect(dup.field("teams")).toMatch(/only be on one side/);
  });

  it("only venue staff put a match on the venue's court", async () => {
    await login("player1@example.test");
    const e = await expectApiError(create({ court_id: "court-001" }), 422);
    expect(e.field("court_id")).toMatch(/venue's staff/);
    await login("staff@example.test");
    const m = await create({ court_id: "court-001" });
    expect(m).toMatchObject({ venue: { name: "Mauban Pickleball Courts" }, court: { name: "Court 1" } });
  });
});

describe("Live Scorer", () => {
  it("scores side-out doubles with the server's official score", async () => {
    await login("player1@example.test");
    let m = await create({ match_type: "doubles", team_a: [JAMIE, "u-010"], team_b: ["u-011", "u-012"] });
    await expectApiError(point(m.id, 0), 409); // not started
    m = await api<MatchDetail>(`/matches/${m.id}/start`, { method: "POST", body: {} });
    expect(m.state.called).toBe("0-0-2");
    await point(m.id, 0);
    await point(m.id, 0);
    m = await point(m.id, 1); // side out
    expect(m.state.called).toBe("0-2-1");
    expect(m.version).toBe(3);
  });

  it("never counts a retried tap twice", async () => {
    await login("player1@example.test");
    const m = await create();
    await api(`/matches/${m.id}/start`, { method: "POST", body: {} });
    await point(m.id, 0, "same-tap");
    const again = await point(m.id, 0, "same-tap");
    expect(again.state.games[0]!.points).toEqual([1, 0]);
    expect(again.version).toBe(1);
  });

  it("undoes as a new event and keeps the history", async () => {
    await login("player1@example.test");
    const m = await create();
    await api(`/matches/${m.id}/start`, { method: "POST", body: {} });
    await expectApiError(api(`/matches/${m.id}/undo`, { method: "POST", body: { event_uuid: "u-0" } }), 409); // nothing to undo
    await point(m.id, 0);
    await point(m.id, 0);
    const after = await api<MatchDetail>(`/matches/${m.id}/undo`, {
      method: "POST",
      body: { event_uuid: "u-1" },
    });
    expect(after.state.games[0]!.points).toEqual([1, 0]);
    const history = await api<ScoreEventView[]>(`/matches/${m.id}/events`);
    expect(history.map((e) => e.type)).toEqual(["undo", "rally", "rally"]);
    expect(history[0]!.called_after).toBe("1-0");
  });

  it("only the scorer or an organizer scores; anyone can watch", async () => {
    await login("player1@example.test");
    const m = await create();
    await api(`/matches/${m.id}/start`, { method: "POST", body: {} });
    await login("player2@example.test"); // Sam plays, but isn't the scorer
    const watching = await api<MatchDetail>(`/matches/${m.id}`);
    expect(watching.can_score).toBe(false);
    await expectApiError(point(m.id, 1), 403);
    sessionStorage.clear();
    expect((await api<MatchDetail>(`/matches/${m.id}`)).status).toBe("in_progress");
  });

  it("finishes: no points after the end, submit, and competitive results wait for confirmation", async () => {
    await login("player1@example.test");
    const m = await create({ category: "competitive", format: { ...defaultFormat, scoring: "rally" } });
    await api(`/matches/${m.id}/start`, { method: "POST", body: {} });
    await expectApiError(api(`/matches/${m.id}/submit-result`, { method: "POST", body: {} }), 409);
    for (let i = 0; i < 11; i++) await point(m.id, 0);
    await expectApiError(point(m.id, 1), 409);
    const done = await api<MatchDetail>(`/matches/${m.id}/submit-result`, { method: "POST", body: {} });
    expect(done).toMatchObject({
      status: "awaiting_confirmation",
      score: "11-0",
      winner: 0,
      can_score: false,
    });
    const mine = await api<MatchSummary[]>("/player/matches");
    expect(mine.find((x) => x.id === m.id)?.status).toBe("awaiting_confirmation");
  });

  it("an organizer voids a match with a reason", async () => {
    await login("player1@example.test");
    const m = await create();
    await expectApiError(api(`/matches/${m.id}/void`, { method: "POST", body: { reason: "rain" } }), 422);
    const v = await api<MatchDetail>(`/matches/${m.id}/void`, {
      method: "POST",
      body: { reason: "Rain stopped play at 4-4." },
    });
    expect(v.status).toBe("voided");
    await login("player2@example.test");
    await expectApiError(
      api(`/matches/${m.id}/void`, { method: "POST", body: { reason: "Not my match to void." } }),
      403,
    );
  });

  it("the samples: a live match to watch, a result waiting, one ready to start", async () => {
    const live = await api<MatchDetail>("/matches/m-1");
    expect(live).toMatchObject({ status: "in_progress", match_type: "doubles" });
    expect(live.state.winner).toBeNull();
    const yesterday = await api<MatchDetail>("/matches/m-2");
    expect(yesterday).toMatchObject({ status: "awaiting_confirmation", score: "11-7", winner: 0 });
  });
});
