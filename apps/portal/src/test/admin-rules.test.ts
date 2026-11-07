// Phase 6: the Super Admin owns the whole system. They review new venues and
// clubs, suspend and reactivate them, and can manage any venue. Every decision
// and every change they make at a venue is in the audit log.
import { setupServer } from "msw/node";
import { handlers } from "@courtflex/mocks";
import { ApiError, api, configureApi } from "@courtflex/api";
import type {
  AdminClubDetail,
  AdminDashboard,
  AdminVenueDetail,
  AdminVenueRow,
  Club,
  ClubListing,
  ClubSubscription,
  Court,
  Me,
  VenueResult,
} from "@courtflex/api";

const server = setupServer(...handlers);
vi.setConfig({ testTimeout: 30_000 });

beforeAll(() => {
  configureApi({ baseUrl: "http://localhost/api/v1" });
  server.listen({ onUnhandledFrame: "error" });
});
afterAll(() => server.close());
beforeEach(() => sessionStorage.clear());

const ADMIN = "admin@example.test";
const OWNER = "owner@example.test"; // Mauban (c-001) and Quezon (c-002)
const login = (email: string) =>
  api<Me>("/auth/login", { method: "POST", body: { email, password: "password" } });

async function expectApiError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  return error as ApiError;
}

const decide = (kind: "venues" | "clubs", id: string, action: string, reason?: string) =>
  api(`/admin/${kind}/${id}/decision`, { method: "POST", body: { action, reason } });

let courtN = 0;
const addCourt = (clubId: string) =>
  api<Court>(`/clubs/${clubId}/courts`, {
    method: "POST",
    body: {
      name: `Test Court ${++courtN}`,
      court_code: `T${courtN}`,
      indoor_outdoor: "outdoor",
      surface_type: "Acrylic",
      base_price: "300",
      status: "active",
    },
  });

describe("Super Admin", () => {
  it("is the only one let in", async () => {
    await expectApiError(api("/admin/dashboard"), 401);
    await login(OWNER);
    const e = await expectApiError(api("/admin/venues"), 403);
    expect(e.message).toBe("This area is for the Super Admin.");
    await login("player1@example.test");
    await expectApiError(api("/admin/clubs"), 403);
  });

  it("sees sign-ups to review, platform numbers and revenue", async () => {
    await login(ADMIN);
    const d = await api<AdminDashboard>("/admin/dashboard");
    expect(d.review.map((r) => r.name)).toEqual(
      expect.arrayContaining(["Mateuna Courts", "Sunrise Paddle Circle"]),
    );
    expect(d.review.find((r) => r.name === "Mateuna Courts")).toMatchObject({
      kind: "venue",
      submitted_by: { email: "owner.mateuna-courts@example.test" },
    });
    expect(d.counts.venues_pending).toBeGreaterThanOrEqual(1);
    expect(Number(d.revenue.mrr)).toBeGreaterThan(0);
    expect(d.revenue).toHaveProperty("bookings_paid_this_month");
  });

  it("approves a venue: it's listed and its 14-day trial starts, once", async () => {
    await login(ADMIN);
    await decide("venues", "c-015", "approve");
    const v = await api<AdminVenueDetail>("/admin/venues/c-015");
    expect(v.status).toBe("active");
    expect(v.decision).toMatchObject({ action: "approve", by: { name: "Platform Admin" } });
    expect(v.history[0]).toMatchObject({ summary: "Approved Mateuna Courts" });
    const sub = await api<ClubSubscription>("/clubs/c-015/subscription"); // Super Admin can open any venue
    expect(sub.trial_days_left).toBe(14);
    const found = await api<VenueResult[]>("/discovery/courts", { query: { q: "Mateuna" } });
    expect(found.map((x) => x.name)).toContain("Mateuna Courts");
    // Already active: can't be approved again.
    await expectApiError(decide("venues", "c-015", "approve"), 409);
  });

  it("needs a reason to decline or suspend, and the owner sees it", async () => {
    await login(ADMIN);
    const e = await expectApiError(decide("venues", "c-001", "suspend", "spam"), 422);
    expect(e.field("reason")).toMatch(/at least 10 characters/);
    await expectApiError(decide("venues", "c-001", "reject", "Not a real venue address."), 409); // only sign-ups

    await decide("venues", "c-001", "suspend", "Unpaid court fees reported by players.");
    // Hidden from players.
    const found = await api<VenueResult[]>("/discovery/courts", { query: { q: "Mauban Pickleball" } });
    expect(found).toEqual([]);
    await expectApiError(api("/courts/court-001"), 404);

    // The owner sees why, and can't make changes.
    await login(OWNER);
    const club = await api<Club>("/clubs/c-001");
    expect(club).toMatchObject({
      status: "suspended",
      status_reason: "Unpaid court fees reported by players.",
    });
    const refused = await expectApiError(addCourt("c-001"), 403);
    expect(refused.message).toMatch(/suspended by CourtFlex/);

    // The Super Admin still can, and it's recorded.
    await login(ADMIN);
    await addCourt("c-001");
    const v = await api<AdminVenueDetail>("/admin/venues/c-001");
    expect(v.history[0]).toMatchObject({
      action: "venue.changed_by_super_admin",
      summary: "Changed courts at Mauban Pickleball Courts",
    });

    await decide("venues", "c-001", "reactivate");
    await login(OWNER);
    await addCourt("c-001");
    expect((await api<Club>("/clubs/c-001")).status_reason).toBeNull();
  });

  it("finds venues by name, city or owner, and by status", async () => {
    await login(ADMIN);
    const byOwner = await api<AdminVenueRow[]>("/admin/venues", { query: { q: "owner@example.test" } });
    expect(byOwner.map((v) => v.name)).toEqual(
      expect.arrayContaining(["Mauban Pickleball Courts", "Quezon Sports Courts"]),
    );
    expect(byOwner.every((v) => v.owner?.email === "owner@example.test")).toBe(true);
    const waiting = await api<AdminVenueRow[]>("/admin/venues", { query: { status: "pending_review" } });
    expect(waiting.every((v) => v.status === "pending_review")).toBe(true);
  });

  it("reviews community clubs too: approve, then suspend hides it from players", async () => {
    await login(ADMIN);
    const sunrise = (await api<AdminClubDetail[]>("/admin/clubs", { query: { q: "Sunrise" } }))[0]!;
    expect(sunrise.status).toBe("pending_review");
    await decide("clubs", sunrise.id, "approve");
    await login("player1@example.test");
    expect((await api<ClubListing[]>("/discovery/clubs")).map((c) => c.name)).toContain(
      "Sunrise Paddle Circle",
    );

    await login(ADMIN);
    await decide("clubs", sunrise.id, "suspend", "Members reported unsafe play rules.");
    const detail = await api<AdminClubDetail>(`/admin/clubs/${sunrise.id}`);
    expect(detail.decision).toMatchObject({
      action: "suspend",
      reason: "Members reported unsafe play rules.",
    });
    await login("player1@example.test");
    expect((await api<ClubListing[]>("/discovery/clubs")).map((c) => c.name)).not.toContain(
      "Sunrise Paddle Circle",
    );
  });
});
