// Phase 6, A5: the audit log, announcements and platform settings.
import { setupServer } from "msw/node";
import { handlers } from "@courtflex/mocks";
import { ApiError, api, configureApi } from "@courtflex/api";
import type {
  AdminSubscriptionRow,
  AdminUserRow,
  Announcement,
  AuditPage,
  ClubSubscription,
  Me,
  PlatformSettings,
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

const settings = () => api<PlatformSettings>("/platform/settings");
const saveSettings = (over: Partial<PlatformSettings>) =>
  settings().then((s) =>
    api<PlatformSettings>("/admin/settings", { method: "PUT", body: { ...s, ...over } }),
  );
const live = (audience: string) => api<Announcement[]>("/announcements", { query: { for: audience } });
const post = (body: Record<string, unknown>) =>
  api<Announcement>("/admin/announcements", {
    method: "POST",
    body: { tone: "info", audience: "everyone", ...body },
  });

describe("audit log", () => {
  it("is for the Super Admin, newest first, filterable and searchable", async () => {
    await login("owner@example.test");
    await expectApiError(api("/admin/audit-logs"), 403);

    await admin();
    const mauban = (
      await api<AdminSubscriptionRow[]>("/admin/subscriptions", { query: { q: "Mauban" } })
    )[0]!;
    await api(`/admin/subscriptions/${mauban.id}/extend-trial`, {
      method: "POST",
      body: { days: 3, reason: "Late court surface delivery." },
    });
    const all = await api<AuditPage>("/admin/audit-logs");
    expect(all.entries[0]).toMatchObject({
      action: "subscription.trial_extended",
      reason: "Late court surface delivery.",
    });

    const billing = await api<AuditPage>("/admin/audit-logs", { query: { type: "billing" } });
    expect(billing.entries.every((e) => /^(subscription|invoice)\./.test(e.action))).toBe(true);
    const venues = await api<AuditPage>("/admin/audit-logs", { query: { type: "venue" } });
    expect(venues.entries.some((e) => e.action.startsWith("subscription."))).toBe(false);

    const found = await api<AuditPage>("/admin/audit-logs", { query: { q: "surface delivery" } });
    expect(found.total).toBe(1);
  });

  it("pages 25 at a time", async () => {
    await admin();
    const sam = (await api<AdminUserRow[]>("/admin/users", { query: { q: "player2@" } }))[0]!;
    for (let i = 0; i < 13; i++) {
      await api(`/admin/users/${sam.id}/status`, {
        method: "PATCH",
        body: { status: "suspended", reason: `Test suspension number ${i}.` },
      });
      await api(`/admin/users/${sam.id}/status`, { method: "PATCH", body: { status: "active" } });
    }
    const p1 = await api<AuditPage>("/admin/audit-logs");
    expect(p1.entries).toHaveLength(25);
    expect(p1.pages).toBeGreaterThanOrEqual(2);
    const p2 = await api<AuditPage>("/admin/audit-logs", { query: { page: "2" } });
    expect(p2.page).toBe(2);
    expect(p2.entries[0]!.id).not.toBe(p1.entries[0]!.id);
  });
});

describe("announcements", () => {
  it("shows to the right app while live, until ended", async () => {
    await admin();
    const e = await expectApiError(post({ title: "Hi", message: "short" }), 422);
    expect(e.field("title")).toBeTruthy();
    expect(e.field("message")).toBeTruthy();

    const forPlayers = await post({
      title: "Rainy week",
      message: "Outdoor courts may close on short notice.",
      audience: "players",
    });
    const forOwners = await post({
      title: "New payouts report",
      message: "See every GCash and Maya receipt in one place.",
      audience: "owners",
    });
    const later = await post({
      title: "Maintenance Sunday",
      message: "CourtFlex is down 2 to 3 AM for upgrades.",
      starts_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    });
    expect(later.status).toBe("scheduled");

    sessionStorage.clear(); // public: no sign-in needed
    expect((await live("players")).map((a) => a.title)).toEqual(["Rainy week"]);
    expect((await live("owners")).map((a) => a.title)).toEqual(["New payouts report"]);

    await admin();
    await api(`/admin/announcements/${forPlayers.id}/end`, { method: "POST" });
    expect(await live("players")).toEqual([]);
    await expectApiError(
      api(`/admin/announcements/${forPlayers.id}`, {
        method: "PATCH",
        body: {
          title: "Rainy week",
          message: "Outdoor courts may close.",
          audience: "players",
          tone: "info",
        },
      }),
      409,
    );
    await api(`/admin/announcements/${forOwners.id}/end`, { method: "POST" });
  });
});

describe("platform settings", () => {
  it("are public to read, and only the Super Admin changes them", async () => {
    expect((await settings()).trial_days).toBe(14);
    await login("owner@example.test");
    await expectApiError(saveSettings({ trial_days: 30 }), 403);
    await admin();
    const e = await expectApiError(saveSettings({ trial_days: 90, support_email: "nope" }), 422);
    expect(e.field("trial_days")).toBeTruthy();
    expect(e.field("support_email")).toBeTruthy();
  });

  it("new trials use the set length", async () => {
    await admin();
    await saveSettings({ trial_days: 30 });
    await api("/admin/venues/c-015/decision", { method: "POST", body: { action: "approve" } });
    const sub = await api<ClubSubscription>("/clubs/c-015/subscription");
    expect(sub.trial_days_left).toBe(30);
    await saveSettings({ trial_days: 14 });
  });

  it("pausing owner sign-up refuses new venues", async () => {
    await admin();
    await saveSettings({ venue_signups_open: false });
    sessionStorage.clear();
    const e = await expectApiError(
      api("/owner-signup/code", { method: "POST", body: { name: "New Owner", email: "new@owner.test" } }),
      403,
    );
    expect(e.message).toMatch(/isn't taking new venues/);
    await admin();
    await saveSettings({ venue_signups_open: true });
  });

  it("support contact appears where people are told to get help", async () => {
    await admin();
    await saveSettings({ support_email: "help@courtflex.test", support_phone: "0917 000 1111" });
    const sam = (await api<AdminUserRow[]>("/admin/users", { query: { q: "player2@" } }))[0]!;
    await api(`/admin/users/${sam.id}/status`, {
      method: "PATCH",
      body: { status: "suspended", reason: "Testing the support line." },
    });
    const e = await expectApiError(login("player2@example.test"), 403);
    expect(e.message).toMatch(/help@courtflex\.test or 0917 000 1111/);
    const audit = await api<AuditPage>("/admin/audit-logs", { query: { type: "settings" } });
    expect(audit.entries[0]!.summary).toMatch(/support email help@courtflex\.test/);
  });
});
