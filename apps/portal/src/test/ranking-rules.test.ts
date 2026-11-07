// Phase 5, M3: geographic leaderboards from one rating per format.
import { setupServer } from "msw/node";
import { handlers } from "@courtflex/mocks";
import { ApiError, api, configureApi } from "@courtflex/api";
import type { Leaderboard, Me, PlayerStats, RankingArea } from "@courtflex/api";

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
const lb = (query: Record<string, string>) => api<Leaderboard>("/rankings", { query });

async function expectApiError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  return error as ApiError;
}

describe("leaderboards", () => {
  it("are public; visitors see the country", async () => {
    const b = await lb({ type: "doubles" });
    expect(b.area).toMatchObject({ scope: "country", name: "Philippines" });
    expect(b.ranked.length).toBeGreaterThan(5);
    expect(b.me).toBeNull();
    expect(b.my_areas).toEqual([]);
  });

  it("rank only players with enough rated matches, best first, with positions 1, 2, 3…", async () => {
    const b = await lb({ type: "doubles" });
    expect(b.ranked.every((e) => e.games >= b.minimum_matches && !e.provisional)).toBe(true);
    expect(b.ranked.map((e) => e.rank)).toEqual(b.ranked.map((_, i) => i + 1));
    for (let i = 1; i < b.ranked.length; i++)
      expect(b.ranked[i - 1]!.rating).toBeGreaterThanOrEqual(b.ranked[i]!.rating);
    expect(b.provisional.every((e) => e.rank === null && e.games < b.minimum_matches)).toBe(true);
  });

  it("singles and doubles are separate boards", async () => {
    const d = await lb({ type: "doubles" });
    const s = await lb({ type: "singles" });
    const someone = d.ranked[0]!.player.id;
    const inSingles = [...s.ranked, ...s.provisional].find((e) => e.player.id === someone);
    expect(inSingles?.rating).not.toBe(d.ranked[0]!.rating);
  });

  it("filter the same rating by area: a city board is a subset of the province board", async () => {
    const cities = await api<RankingArea[]>("/rankings/areas", { query: { scope: "city" } });
    const mauban = cities.find((c) => c.name.startsWith("Mauban"))!;
    const city = await lb({ type: "doubles", scope: "city", area: mauban.id });
    const country = await lb({ type: "doubles" });
    expect(city.ranked.length).toBeLessThan(country.ranked.length);
    for (const e of city.ranked) {
      const there = country.ranked.find((x) => x.player.id === e.player.id)!;
      expect(there.rating).toBe(e.rating);
    }
  });

  it("signed-in players start on their own areas and see their own row", async () => {
    await login("player1@example.test"); // Jamie, Mauban
    const b = await lb({ type: "doubles", scope: "city" });
    expect(b.area.name).toMatch(/^Mauban/);
    expect(b.my_areas.map((a) => a.scope)).toEqual(["barangay", "city", "province", "country"]);
    expect(b.me?.player.name).toBe("Jamie Player");
  });

  it("global is shown but switched off", async () => {
    const e = await expectApiError(lb({ type: "doubles", scope: "global" }), 409);
    expect(e.message).toMatch(/aren't open yet/);
  });

  it("the stats page shows where a ranked player stands", async () => {
    await login("player1@example.test");
    const board = await lb({ type: "doubles" });
    const top = board.ranked[0]!;
    const s = await api<PlayerStats>(`/players/${top.player.id}/stats`);
    expect(s.ranks).toContainEqual(
      expect.objectContaining({
        type: "doubles",
        rank: 1,
        area: expect.objectContaining({ scope: "country" }),
      }),
    );
  });
});
