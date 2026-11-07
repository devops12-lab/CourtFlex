// Phase 7, P1: in-app notifications, created where things happen, private to
// each player, and switchable per category.
import { setupServer } from "msw/node";
import { handlers } from "@courtflex/mocks";
import { ApiError, api, configureApi, defaultFormat } from "@courtflex/api";
import type { MatchDetail, Me, NotificationPage, NotificationPreferences } from "@courtflex/api";

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
const inbox = () => api<NotificationPage>("/notifications");

async function expectApiError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  return error as ApiError;
}

let n = 0;
async function jamieBeatsSam() {
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
      body: { event_uuid: `nn${++n}`, winner: 0 },
    });
  await api(`/matches/${m.id}/submit-result`, { method: "POST", body: {} });
  return m;
}

describe("notifications", () => {
  it("are private and need sign-in", async () => {
    await expectApiError(inbox(), 401);
    await login("player2@example.test");
    const sam = await inbox();
    expect(sam.items.some((x) => x.title === "Confirm your result")).toBe(true);
    await login("player1@example.test");
    const jamie = await inbox();
    expect(jamie.items.some((x) => x.link === "/matches/m-2" && x.title === "Confirm your result")).toBe(
      false,
    );
  });

  it("follow a match: confirm your result, then it's official with the rating change", async () => {
    const m = await jamieBeatsSam();
    await login("player2@example.test");
    const asked = (await inbox()).items.find((x) => x.link === `/matches/${m.id}`)!;
    expect(asked).toMatchObject({ type: "result_to_confirm", category: "matches", read_at: null });
    await api(`/matches/${m.id}/confirm-result`, { method: "POST", body: {} });
    await login("player1@example.test");
    const official = (await inbox()).items.find((x) => x.link === `/matches/${m.id}`)!;
    expect(official.title).toBe("You won: it's official");
    expect(official.body).toMatch(/Your singles rating rose \d+ to \d+\./);
  });

  it("disputes reach the other players", async () => {
    const m = await jamieBeatsSam();
    await login("player2@example.test");
    await api(`/matches/${m.id}/dispute`, { method: "POST", body: { reason: "It was 9-11 the other way." } });
    await login("player1@example.test");
    const d = (await inbox()).items.find(
      (x) => x.link === `/matches/${m.id}` && x.type === "result_disputed",
    )!;
    expect(d.body).toMatch(/It was 9-11 the other way\./);
  });

  it("mark read, one or all; the unread count follows", async () => {
    await login("player1@example.test");
    const before = await inbox();
    expect(before.unread).toBeGreaterThan(0);
    const first = before.items.find((x) => !x.read_at)!;
    await api(`/notifications/${first.id}/read`, { method: "POST" });
    expect((await inbox()).unread).toBe(before.unread - 1);
    await api("/notifications/read-all", { method: "POST" });
    expect((await inbox()).unread).toBe(0);
    await login("player2@example.test");
    await expectApiError(api(`/notifications/${first.id}/read`, { method: "POST" }), 404); // not Sam's
  });

  it("a category switched off isn't sent", async () => {
    await login("player2@example.test");
    const prefs = await api<NotificationPreferences>("/notification-preferences");
    expect(prefs.matches).toEqual({ in_app: true, email: false });
    await api("/notification-preferences", {
      method: "PUT",
      body: { ...prefs, matches: { in_app: false, email: false } },
    });
    const count = (await inbox()).items.length;
    await jamieBeatsSam();
    await login("player2@example.test");
    expect((await inbox()).items.length).toBe(count);
    await api("/notification-preferences", { method: "PUT", body: prefs });
  });
});
