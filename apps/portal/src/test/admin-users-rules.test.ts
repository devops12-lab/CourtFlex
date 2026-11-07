// Phase 6, A3: the Super Admin manages every user account. Suspended accounts
// can't sign in and are signed out; every change is in the audit log.
import { setupServer } from "msw/node";
import { handlers } from "@courtflex/mocks";
import { ApiError, api, configureApi } from "@courtflex/api";
import type { AdminUserDetail, AdminUserRow, Me } from "@courtflex/api";

const server = setupServer(...handlers);
vi.setConfig({ testTimeout: 30_000 });

beforeAll(() => {
  configureApi({ baseUrl: "http://localhost/api/v1" });
  server.listen({ onUnhandledFrame: "error" });
});
afterAll(() => server.close());
beforeEach(() => sessionStorage.clear());

const ADMIN = "admin@example.test";
const login = (email: string, password = "password") =>
  api<Me>("/auth/login", { method: "POST", body: { email, password } });

async function expectApiError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  return error as ApiError;
}

const users = (query: Record<string, string> = {}) => api<AdminUserRow[]>("/admin/users", { query });
const idOf = async (email: string) => (await users({ q: email }))[0]!.id;
const setStatus = (id: string, status: string, reason?: string) =>
  api(`/admin/users/${id}/status`, { method: "PATCH", body: { status, reason } });

describe("Super Admin: users", () => {
  it("only the Super Admin can see accounts", async () => {
    await login("owner@example.test");
    await expectApiError(users(), 403);
  });

  it("finds accounts by name, email or mobile, and by role", async () => {
    await login(ADMIN);
    expect((await users({ q: "jamie" })).map((u) => u.email)).toContain("player1@example.test");
    expect((await users({ q: "0917 123 0003" })).map((u) => u.email)).toEqual(["player1@example.test"]);
    const staff = await users({ role: "venue_staff" });
    expect(staff.map((u) => u.email)).toEqual(
      expect.arrayContaining(["owner@example.test", "staff@example.test"]),
    );
    expect(staff.every((u) => u.roles.includes("venue_staff"))).toBe(true);
    expect((await users({ role: "super_admin" })).map((u) => u.email)).toEqual([ADMIN]);
  });

  it("shows an account across the system", async () => {
    await login(ADMIN);
    const owner = await api<AdminUserDetail>(`/admin/users/${await idOf("owner@example.test")}`);
    expect(owner.venue_roles).toContainEqual(
      expect.objectContaining({ club_name: "Mauban Pickleball Courts", role_key: "owner" }),
    );
    expect(owner.roles).toEqual(expect.arrayContaining(["venue_staff", "player"]));
    const jamie = await api<AdminUserDetail>(`/admin/users/${await idOf("player1@example.test")}`);
    expect(jamie.player).not.toBeNull();
    expect(jamie.bookings.total).toBeGreaterThan(0);
  });

  it("suspends with a reason: signed out, can't sign in, until reactivated", async () => {
    // Sam is signed in.
    await login("player2@example.test");
    await login(ADMIN);
    const sam = await idOf("player2@example.test");

    const e = await expectApiError(setStatus(sam, "suspended", "rude"), 422);
    expect(e.field("reason")).toMatch(/at least 10 characters/);
    await setStatus(sam, "suspended", "Repeated no-shows at three venues.");
    await expectApiError(setStatus(sam, "suspended", "Repeated no-shows at three venues."), 409);

    const refused = await expectApiError(login("player2@example.test"), 403);
    expect(refused.message).toMatch(/suspended/);
    expect(refused.message).toMatch(/Repeated no-shows at three venues\./);

    // A session that was already open ends too.
    sessionStorage.setItem("courtflex-mock-session", sam);
    await expectApiError(api("/me"), 401);

    await login(ADMIN);
    const detail = await api<AdminUserDetail>(`/admin/users/${sam}`);
    expect(detail).toMatchObject({
      status: "suspended",
      suspension: { reason: "Repeated no-shows at three venues.", by: { name: "Platform Admin" } },
    });
    expect(detail.history[0]).toMatchObject({
      action: "user.suspended",
      reason: "Repeated no-shows at three venues.",
    });

    await setStatus(sam, "active");
    expect((await login("player2@example.test")).email).toBe("player2@example.test");
  });

  it("won't suspend the Super Admin, including yourself", async () => {
    await login(ADMIN);
    const me = await idOf(ADMIN);
    const e = await expectApiError(setStatus(me, "suspended", "Testing suspension of self."), 409);
    expect(e.message).toBe("You can't suspend your own account.");
  });

  it("sends a password reset link, and records it", async () => {
    await login(ADMIN);
    const carla = await idOf("carla@example.test");
    const sent = await api<{ sent: true; mock_reset_url: string }>(`/admin/users/${carla}/password-reset`, {
      method: "POST",
    });
    const token = new URL(sent.mock_reset_url, "http://x").searchParams.get("token")!;
    await api("/auth/reset-password", {
      method: "POST",
      body: { token, password: "newpass99", password_confirmation: "newpass99" },
    });
    expect((await login("carla@example.test", "newpass99")).email).toBe("carla@example.test");
    await login(ADMIN);
    const detail = await api<AdminUserDetail>(`/admin/users/${carla}`);
    expect(detail.history[0]).toMatchObject({ action: "user.password_reset_sent" });
  });
});
