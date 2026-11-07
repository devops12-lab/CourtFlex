// Phase 5, M4: tournaments. Organizers per the permissions table; entries;
// the draw seeded by rating; winners move on; standings; a champion.
import { setupServer } from "msw/node";
import { handlers } from "@courtflex/mocks";
import { ApiError, api, configureApi } from "@courtflex/api";
import type {
  MatchDetail,
  Me,
  TournamentDetail,
  TournamentHostOption,
  TournamentInput,
  TournamentSummary,
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
const OWNER = "owner@example.test"; // Mauban, Quezon Sports, Lucena Dink House
const DAY = 86_400_000;

async function expectApiError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  return error as ApiError;
}

const input = (over: Partial<TournamentInput> = {}): TournamentInput => ({
  host: { type: "venue", id: "c-001" },
  name: `Test Cup ${Math.random().toString(36).slice(2, 7)}`,
  description: "",
  match_type: "singles",
  format: "single_elimination",
  game: { target: 11, win_by: 2, best_of: 1, scoring: "rally" },
  venue_id: "c-001",
  court_ids: ["court-001", "court-002"],
  starts_at: new Date(Date.now() + 3 * DAY).toISOString(),
  registration_closes_at: new Date(Date.now() + 2 * DAY).toISOString(),
  capacity: 8,
  entry_fee: "0",
  ...over,
});
const create = (over: Partial<TournamentInput> = {}) =>
  api<TournamentDetail>("/tournaments", { method: "POST", body: input(over) });
const register = (id: string, partner_id?: string) =>
  api<TournamentDetail>(`/tournaments/${id}/register`, { method: "POST", body: { partner_id } });
const start = (id: string) => api<TournamentDetail>(`/tournaments/${id}/start`, { method: "POST", body: {} });

let tap = 0;
/** Plays one tournament match as its organizer: side `winner` takes it 11-0. */
async function play(matchId: string, winner: 0 | 1) {
  await api(`/matches/${matchId}/start`, { method: "POST", body: {} });
  for (let i = 0; i < 11; i++)
    await api(`/matches/${matchId}/score-events`, {
      method: "POST",
      body: { event_uuid: `tt${++tap}`, winner },
    });
  return api<MatchDetail>(`/matches/${matchId}/submit-result`, { method: "POST", body: {} });
}

/** Registers singles entries as each player in turn. */
async function fill(id: string, emails: string[]) {
  for (const e of emails) {
    await login(e);
    await register(id);
  }
}
const PLAYERS = [
  "player1@example.test",
  "player2@example.test",
  "andrea@example.test",
  "miguel@example.test",
  "carla@example.test",
];

describe("who runs tournaments", () => {
  it("court owners for their venue, club owners for their club, nobody else", async () => {
    await login(OWNER);
    const hosts = await api<TournamentHostOption[]>("/tournaments/hosting-options");
    expect(hosts.map((h) => h.name)).toContain("Mauban Pickleball Courts");
    expect(hosts.some((h) => h.type === "community")).toBe(false);

    await login("player1@example.test"); // Jamie owns Tara Pikol Mauban (a club), no venue
    const jamie = await api<TournamentHostOption[]>("/tournaments/hosting-options");
    expect(jamie).toEqual([
      expect.objectContaining({ type: "community", name: "Tara Pikol Mauban", venue_id: "c-001" }),
    ]);
    const e = await expectApiError(create(), 422); // not his venue
    expect(e.field("host")).toBeTruthy();
    const mine = await create({ host: { type: "community", id: "com-1" } });
    expect(mine.host.name).toBe("Tara Pikol Mauban");

    await login("player2@example.test");
    await expectApiError(start(mine.id), 403);
  });

  it("checks the details", async () => {
    await login(OWNER);
    const e = await expectApiError(
      create({
        capacity: 40,
        court_ids: ["court-003"], // not at Mauban
        registration_closes_at: new Date(Date.now() + 5 * DAY).toISOString(), // after it starts
        format: "pool_knockout",
        pools: 5,
      }),
      422,
    );
    expect(e.field("capacity")).toBeTruthy();
    expect(e.field("court_ids")).toBeTruthy();
    expect(e.field("registration_closes_at")).toMatch(/before the tournament starts/);
    expect(e.field("pools")).toBeTruthy();
  });
});

describe("registration", () => {
  it("one entry per player; doubles need a partner who isn't entered; withdraw before the draw", async () => {
    await login(OWNER);
    const t = await create({ match_type: "doubles", capacity: 4 });
    await login("player1@example.test");
    await expectApiError(register(t.id), 422); // no partner
    const after = await register(t.id, "u-010"); // with Bea
    expect(after).toMatchObject({ entries_count: 1, can_register: false });
    expect(after.entries[0]!.name).toBe("Jamie & Bea");
    await expectApiError(register(t.id, "u-011"), 409); // already in
    await login("player2@example.test");
    const e = await expectApiError(register(t.id, "u-010"), 422);
    expect(e.field("partner_id")).toMatch(/already in this tournament/);
    await login("player1@example.test");
    const out = await api<TournamentDetail>(`/tournaments/${t.id}/withdraw`, { method: "POST", body: {} });
    expect(out.entries_count).toBe(0);
  });

  it("stops at capacity", async () => {
    await login(OWNER);
    const t = await create({ capacity: 4 });
    await fill(t.id, PLAYERS.slice(0, 4));
    await login(PLAYERS[4]!);
    const e = await expectApiError(register(t.id), 409);
    expect(e.message).toBe("The draw is full.");
  });
});

describe("single elimination", () => {
  it("seeds by rating, gives byes to the top seeds, moves winners on, and crowns a champion", async () => {
    await login(OWNER);
    const t = await create();
    await fill(t.id, PLAYERS); // 5 entries in an 8 bracket: 3 byes
    await login(OWNER);
    const drawn = await start(t.id);
    expect(drawn.status).toBe("in_progress");
    // Seeds follow rating.
    const ratings = drawn.entries.map((e) => e.rating);
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
    const first = drawn.matches.filter((m) => m.round === 1);
    expect(first).toHaveLength(4);
    expect(first.filter((m) => m.bye)).toHaveLength(3);
    // The bye winners are already in round 2.
    const semis = drawn.matches.filter((m) => m.round_name === "Semifinals");
    expect(semis.flatMap((m) => m.entries).filter(Boolean).length).toBe(3);

    // Play it out: side A always wins.
    for (;;) {
      const now = await api<TournamentDetail>(`/tournaments/${t.id}`);
      const next = now.matches.find((m) => m.match && m.match.status === "scheduled");
      if (!next) break;
      const done = await play(next.match!.id, 0);
      expect(done.status).toBe("completed"); // the organizer submitted, isn't playing: official
    }
    const end = await api<TournamentDetail>(`/tournaments/${t.id}`);
    expect(end.status).toBe("completed");
    expect(end.champion?.seed).toBe(1);
    const final = end.matches.find((m) => m.round_name === "Final")!;
    expect(final.winner_entry_id).toBe(end.champion!.id);
  });

  it("tournament results are rated", async () => {
    await login(OWNER);
    const t = await create({ capacity: 4 });
    await fill(t.id, PLAYERS.slice(0, 2));
    await login(OWNER);
    const d = await start(t.id);
    const m = await play(d.matches[0]!.match!.id, 0);
    expect(m.category).toBe("tournament");
    expect(m.ratings).toHaveLength(2);
  });
});

describe("round robin and pools", () => {
  it("round robin: everyone plays everyone; standings; the leader wins it", async () => {
    await login(OWNER);
    const t = await create({ format: "round_robin" });
    await fill(t.id, PLAYERS.slice(0, 4));
    await login(OWNER);
    const d = await start(t.id);
    expect(d.matches).toHaveLength(6);
    for (const x of d.matches) await play(x.match!.id, 0);
    const end = await api<TournamentDetail>(`/tournaments/${t.id}`);
    expect(end.status).toBe("completed");
    const table = end.standings[0]!.rows;
    expect(table.map((r) => r.played)).toEqual([3, 3, 3, 3]);
    expect(end.champion!.id).toBe(table[0]!.entry.id);
  });

  it("pool play then knockout: the top two of each pool go through", async () => {
    await login(OWNER);
    const t = await create({ format: "pool_knockout", pools: 2, capacity: 8 });
    await fill(t.id, [...PLAYERS, "paolo@example.test"]); // 6 entries, 3 per pool
    await login(OWNER);
    const d = await start(t.id);
    expect(d.standings.map((s) => s.pool)).toEqual(["A", "B"]);
    for (const x of d.matches.filter((m) => m.stage === "pool")) await play(x.match!.id, 0);
    const mid = await api<TournamentDetail>(`/tournaments/${t.id}`);
    const semis = mid.matches.filter((m) => m.stage === "knockout" && m.round_name === "Semifinals");
    expect(semis).toHaveLength(2);
    const into = semis.flatMap((m) => m.entries.map((e) => e!.id));
    const top2 = mid.standings.flatMap((s) => s.rows.slice(0, 2).map((r) => r.entry.id));
    expect(new Set(into)).toEqual(new Set(top2));
    // No pool's first two meet again in the semifinals.
    const poolOf = new Map(mid.standings.flatMap((s) => s.rows.map((r) => [r.entry.id, s.pool])));
    for (const m of semis) expect(poolOf.get(m.entries[0]!.id)).not.toBe(poolOf.get(m.entries[1]!.id));
    // Pool winners don't meet each other in the semifinals.
    const winners = mid.standings.map((s) => s.rows[0]!.entry.id);
    expect(semis.some((m) => winners.every((w) => m.entries.some((e) => e!.id === w)))).toBe(false);
  });
});

describe("the samples", () => {
  it("one taking entries, one being played, one finished", async () => {
    const list = await api<TournamentSummary[]>("/tournaments");
    const byName = Object.fromEntries(list.map((t) => [t.name, t]));
    expect(byName["Mauban Doubles Open"]).toMatchObject({ status: "registration", entries_count: 6 });
    expect(byName["Lucena Dinkers Singles Round Robin"]!.status).toBe("in_progress");
    expect(byName["Saturday Shootout"]!.status).toBe("completed");
    expect(byName["Saturday Shootout"]!.champion).not.toBeNull();
  });
});
