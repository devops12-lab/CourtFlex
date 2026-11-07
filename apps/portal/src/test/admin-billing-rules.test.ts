// Phase 6, A4: plans, every venue's subscription, trial extensions, invoices and
// revenue. The Super Admin's changes reach the owner portal and the audit log.
import { setupServer } from "msw/node";
import { handlers } from "@courtflex/mocks";
import { ApiError, api, configureApi } from "@courtflex/api";
import type {
  AdminInvoiceRow,
  AdminPlan,
  AdminRevenue,
  AdminSubscriptionRow,
  AdminVenueDetail,
  Club,
  ClubSubscription,
  Court,
  Me,
} from "@courtflex/api";

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
const admin = () => login("admin@example.test");

async function expectApiError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  return error as ApiError;
}

const subs = (query: Record<string, string> = {}) =>
  api<AdminSubscriptionRow[]>("/admin/subscriptions", { query });
const subOf = async (clubId: string) => (await subs()).find((s) => s.club_id === clubId)!;
const planBody = (p: AdminPlan, over: Partial<AdminPlan> = {}) => ({
  name: p.name,
  price: p.price,
  limits: p.limits,
  features: p.features,
  offered: p.offered,
  ...over,
});

describe("Super Admin: plans and subscriptions", () => {
  it("are for the Super Admin only", async () => {
    await login("owner@example.test");
    await expectApiError(api("/admin/plans"), 403);
    await expectApiError(api("/admin/revenue"), 403);
  });

  it("lists every venue's subscription with what's owed", async () => {
    await admin();
    const all = await subs();
    expect(all.length).toBeGreaterThanOrEqual(15);
    const lucena = all.find((s) => s.club_name === "Lucena Dink House")!;
    expect(lucena).toMatchObject({ status: "expired", overdue: true, amount_due: "990.00" });
    expect(all[0]!.overdue).toBe(true); // overdue first
    expect((await subs({ status: "trialing" })).every((s) => s.status === "trialing")).toBe(true);
  });

  it("extends a trial with a reason, and the owner sees the new end date", async () => {
    await admin();
    const mauban = await subOf("c-001");
    expect(mauban.trial_days_left).toBe(14);
    const e = await expectApiError(
      api(`/admin/subscriptions/${mauban.id}/extend-trial`, {
        method: "POST",
        body: { days: 45, reason: "x" },
      }),
      422,
    );
    expect(e.field("days")).toBeTruthy();
    expect(e.field("reason")).toBeTruthy();
    await api(`/admin/subscriptions/${mauban.id}/extend-trial`, {
      method: "POST",
      body: { days: 7, reason: "Typhoon closed the courts for a week." },
    });
    await login("owner@example.test");
    const sub = await api<ClubSubscription>("/clubs/c-001/subscription");
    expect(sub.trial_days_left).toBe(21);

    await admin();
    const venue = await api<AdminVenueDetail>("/admin/venues/c-001");
    expect(venue.history[0]).toMatchObject({
      summary: "Extended Mauban Pickleball Courts's trial by 7 days",
      reason: "Typhoon closed the courts for a week.",
    });
    // Not on a trial: nothing to extend.
    const quezon = await subOf("c-002");
    await expectApiError(
      api(`/admin/subscriptions/${quezon.id}/extend-trial`, {
        method: "POST",
        body: { days: 7, reason: "Goodwill extension for testing." },
      }),
      409,
    );
  });

  it("changes a venue's plan, unless it already has more than the plan allows", async () => {
    await admin();
    const mauban = await subOf("c-001"); // Pro, 5 courts
    const refused = await expectApiError(
      api(`/admin/subscriptions/${mauban.id}/change-plan`, {
        method: "POST",
        body: { plan_code: "plan-starter" },
      }),
      409,
    );
    expect(refused.message).toMatch(/courts \(Starter allows 3\)/);
    const quezon = await subOf("c-002");
    await api(`/admin/subscriptions/${quezon.id}/change-plan`, {
      method: "POST",
      body: { plan_code: "plan-pro" },
    });
    await login("owner@example.test");
    expect((await api<ClubSubscription>("/clubs/c-002/subscription")).plan.name).toBe("Pro");
  });

  it("edits a plan's limits, which apply to its venues right away", async () => {
    await admin();
    const starter = (await api<AdminPlan[]>("/admin/plans")).find((p) => p.code === "plan-starter")!;
    await api("/admin/plans/plan-starter", {
      method: "PATCH",
      body: planBody(starter, { limits: { courts: 2, staff: 3 }, price: "1090" }),
    });
    const updated = (await api<AdminPlan[]>("/admin/plans")).find((p) => p.code === "plan-starter")!;
    expect(updated).toMatchObject({ price: "1090.00", limits: { courts: 2 } });

    // Balibago (Starter, 2 courts) is now at its limit.
    await login("owner.balibago-paddle-center@example.test");
    const e = await expectApiError(
      api<Court>("/clubs/c-010/courts", {
        method: "POST",
        body: {
          name: "Court 9",
          court_code: "C9",
          indoor_outdoor: "outdoor",
          surface_type: "Acrylic",
          base_price: "300",
          status: "active",
        },
      }),
      403,
    );
    expect(e.message).toMatch(/Starter plan allows 2 courts/);
  });

  it("creates a plan, and won't retire the last plan offered", async () => {
    await admin();
    const created = await api<AdminPlan>("/admin/plans", {
      method: "POST",
      body: {
        name: "Barangay",
        price: "490",
        limits: { courts: 1, staff: 1 },
        features: { open_play: true, tournaments: false, reports: false },
        offered: true,
      },
    });
    expect(created).toMatchObject({ code: "plan-barangay", venues: 0 });
    await expectApiError(
      api("/admin/plans", { method: "POST", body: { ...planBody(created), name: "barangay" } }),
      422,
    );
    const plans = await api<AdminPlan[]>("/admin/plans");
    for (const p of plans.slice(0, -1))
      await api(`/admin/plans/${p.code}`, { method: "PATCH", body: planBody(p, { offered: false }) });
    const last = plans[plans.length - 1]!;
    await expectApiError(
      api(`/admin/plans/${last.code}`, { method: "PATCH", body: planBody(last, { offered: false }) }),
      409,
    );
  });
});

describe("Super Admin: invoices and revenue", () => {
  it("recording payment of an expired venue's overdue invoice makes its plan active again", async () => {
    await admin();
    const inv = (await api<AdminInvoiceRow[]>("/admin/invoices", { query: { status: "overdue" } })).find(
      (i) => i.club_name === "Lucena Dink House",
    )!;
    const e = await expectApiError(
      api(`/admin/invoices/${inv.id}/mark-paid`, { method: "POST", body: { method: "gcash" } }),
      422,
    );
    expect(e.field("reference")).toBeTruthy();
    await api(`/admin/invoices/${inv.id}/mark-paid`, {
      method: "POST",
      body: { method: "gcash", reference: "7012345678" },
    });
    await expectApiError(
      api(`/admin/invoices/${inv.id}/mark-paid`, { method: "POST", body: { method: "cash" } }),
      409,
    );
    await login("owner@example.test");
    expect(await api<Club>("/clubs/c-003")).toMatchObject({
      read_only: false,
      subscription_status: "active",
    });
  });

  it("voids an invoice with a reason", async () => {
    await admin();
    const inv = (await api<AdminInvoiceRow[]>("/admin/invoices", { query: { status: "issued" } }))[0]!;
    await expectApiError(
      api(`/admin/invoices/${inv.id}/void`, { method: "POST", body: { reason: "no" } }),
      422,
    );
    await api(`/admin/invoices/${inv.id}/void`, {
      method: "POST",
      body: { reason: "Billed twice for November." },
    });
    const after = (await api<AdminInvoiceRow[]>("/admin/invoices", { query: { q: inv.invoice_number } }))[0]!;
    expect(after).toMatchObject({ status: "void", void_reason: "Billed twice for November." });
  });

  it("adds up revenue: recurring, by plan and by month", async () => {
    await admin();
    const r = await api<AdminRevenue>("/admin/revenue");
    expect(r.by_month).toHaveLength(6);
    expect(Number(r.mrr)).toBe(r.by_plan.reduce((a, p) => a + Number(p.mrr), 0));
    expect(Number(r.arr)).toBe(Number(r.mrr) * 12);
    expect(r.paying_venues).toBe(r.by_plan.reduce((a, p) => a + p.venues, 0));
    expect(Number(r.unpaid)).toBeGreaterThanOrEqual(Number(r.overdue));
    expect(r.by_month.at(-1)!.label).toMatch(/2026/);
  });
});
