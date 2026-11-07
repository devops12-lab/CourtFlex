// Club setup rules from the blueprint (§5.2 C, §8.5, §11, §13), checked
// against the mock API so the real Laravel API has an exact spec to meet.
import { setupServer } from "msw/node";
import { handlers } from "@courtflex/mocks";
import { ApiError, api, configureApi, shiftDate, todayIn } from "@courtflex/api";
import type {
  AvailabilitySlot,
  Booking,
  BookingDetail,
  CalendarDay,
  Club,
  CourtDetail,
  OperatingHours,
  StaffMember,
} from "@courtflex/api";

const server = setupServer(...handlers);
const TZ = "Asia/Manila";
const today = todayIn(TZ);
const day = (offset: number) => shiftDate(today, offset);
const at = (date: string, hm: string) => new Date(`${date}T${hm}:00+08:00`).toISOString();
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

beforeAll(() => {
  configureApi({ baseUrl: "http://localhost/api/v1" });
  server.listen({ onUnhandledFrame: "error" });
});
afterAll(() => server.close());
beforeEach(() => sessionStorage.clear());

const login = (email: string) =>
  api("/auth/login", { method: "POST", body: { email, password: "password" } });

async function expectApiError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  return error as ApiError;
}

const newCourt = (name: string, code: string) => ({
  name,
  court_code: code,
  indoor_outdoor: "outdoor",
  surface_type: "Concrete",
  base_price: "250",
  status: "active",
});

describe("courts", () => {
  test("the Starter plan stops at 3 courts", async () => {
    await login("owner@example.test");
    const added = await api<CourtDetail>("/clubs/c-002/courts", {
      method: "POST",
      body: newCourt("Court C", "CC"),
    });
    expect(added.base_price).toBe("250.00");
    expect(added.hours).toHaveLength(7); // copied from the club's first court
    const blocked = await expectApiError(
      api("/clubs/c-002/courts", { method: "POST", body: newCourt("Court D", "CD") }),
      403,
    );
    expect(blocked.message).toMatch(/Starter plan allows 3 courts/);
  });

  test("court names and codes are unique within a club", async () => {
    await login("owner@example.test");
    const dup = await expectApiError(
      api("/clubs/c-001/courts", { method: "POST", body: newCourt("Court 1", "C1") }),
      422,
    );
    expect(dup.field("name")).toMatch(/already has that name/);
    expect(dup.field("court_code")).toMatch(/already uses this code/);
  });

  test("a court with upcoming bookings can't be taken out of service", async () => {
    await login("owner@example.test");
    const court = await api<CourtDetail>("/clubs/c-001/courts/court-002");
    const err = await expectApiError(
      api(`/clubs/c-001/courts/court-002`, { method: "PATCH", body: { ...court, status: "maintenance" } }),
      409,
    );
    expect(err.errors.conflicts?.length).toBeGreaterThan(0);
  });
});

describe("opening hours", () => {
  test("new hours that strand a booking are refused, with the booking listed", async () => {
    await login("owner@example.test");
    const court = await api<CourtDetail>("/clubs/c-001/courts/court-002");
    const tomorrow = weekday(day(1));
    // Court 2 has Jamie Player booked 6–8 PM tomorrow.
    const hours: OperatingHours[] = court.hours.map((h) =>
      h.weekday === tomorrow ? { ...h, closes_at: "17:00" } : h,
    );
    const err = await expectApiError(
      api(`/clubs/c-001/courts/court-002/hours`, { method: "PUT", body: { hours } }),
      409,
    );
    expect(err.errors.conflicts?.[0]).toMatch(/Jamie Player/);
  });

  test("closing earlier on a day with no late bookings is saved and limits availability", async () => {
    await login("owner@example.test");
    const date = day(3);
    const court = await api<CourtDetail>("/clubs/c-001/courts/court-001");
    const hours = court.hours.map((h) => (h.weekday === weekday(date) ? { ...h, closes_at: "20:00" } : h));
    const saved = await api<CourtDetail>(`/clubs/c-001/courts/court-001/hours`, {
      method: "PUT",
      body: { hours },
    });
    expect(saved.hours.find((h) => h.weekday === weekday(date))?.closes_at).toBe("20:00");

    const slots = await api<AvailabilitySlot[]>("/clubs/c-001/courts/court-001/availability", {
      query: { date, duration_minutes: "60" },
    });
    expect(slots.at(-1)?.ends_at).toBe(at(date, "20:00"));
  });

  test("a day can't close before it opens", async () => {
    await login("owner@example.test");
    const court = await api<CourtDetail>("/clubs/c-001/courts/court-004");
    const hours = court.hours.map((h) =>
      h.weekday === 2 ? { ...h, opens_at: "18:00", closes_at: "08:00" } : h,
    );
    const err = await expectApiError(
      api(`/clubs/c-001/courts/court-004/hours`, { method: "PUT", body: { hours } }),
      422,
    );
    expect(err.field("hours.2")).toMatch(/closes before it opens/);
  });
});

describe("rates", () => {
  test("overlapping rates for the same days are refused", async () => {
    await login("owner@example.test");
    const err = await expectApiError(
      api(`/clubs/c-001/courts/court-002/price-rules`, {
        method: "PUT",
        body: {
          rules: [
            { day_of_week: null, starts_at: "17:00", ends_at: "22:00", price: "450" },
            { day_of_week: null, starts_at: "20:00", ends_at: "22:00", price: "500" },
          ],
        },
      }),
      422,
    );
    expect(err.field("rules.1")).toMatch(/Overlaps rule 1/);
  });

  test("a one-day rate beats the every-day rate, and new bookings use it", async () => {
    await login("owner@example.test");
    const date = day(4);
    await api(`/clubs/c-001/courts/court-002/price-rules`, {
      method: "PUT",
      body: {
        rules: [
          { day_of_week: null, starts_at: "17:00", ends_at: "22:00", price: "450" },
          { day_of_week: weekday(date), starts_at: "19:00", ends_at: "21:00", price: "500" },
        ],
      },
    });
    const slots = await api<AvailabilitySlot[]>("/clubs/c-001/courts/court-002/availability", {
      query: { date, duration_minutes: "60" },
    });
    expect(slots.find((s) => s.starts_at === at(date, "10:00"))?.price).toBe("400.00"); // base rate
    expect(slots.find((s) => s.starts_at === at(date, "17:00"))?.price).toBe("450.00");
    expect(slots.find((s) => s.starts_at === at(date, "19:00"))?.price).toBe("500.00");
  });
});

describe("closures", () => {
  test("a closure over a booking is refused; a clear one blocks booking", async () => {
    await login("owner@example.test");
    const tomorrow = day(1);
    const clash = await expectApiError(
      api("/clubs/c-001/court-exceptions", {
        method: "POST",
        body: {
          court_id: "court-002",
          starts_at: at(tomorrow, "17:00"),
          ends_at: at(tomorrow, "21:00"),
          reason: "Typhoon",
        },
      }),
      409,
    );
    expect(clash.errors.conflicts?.[0]).toMatch(/Jamie Player/);

    await api("/clubs/c-001/court-exceptions", {
      method: "POST",
      body: {
        court_id: "court-002",
        starts_at: at(tomorrow, "11:00"),
        ends_at: at(tomorrow, "14:00"),
        reason: "Roof repair",
      },
    });
    const blocked = await expectApiError(
      api("/clubs/c-001/bookings/walk-in", {
        method: "POST",
        body: {
          court_id: "court-002",
          starts_at: at(tomorrow, "12:00"),
          ends_at: at(tomorrow, "13:00"),
          guest_name: "Walk-in",
        },
      }),
      422,
    );
    expect(blocked.field("starts_at")).toMatch(/Roof repair/);

    const cal = await api<CalendarDay>("/clubs/c-001/calendar", { query: { date: tomorrow } });
    expect(cal.closures.some((c) => c.court_id === "court-002" && c.reason === "Roof repair")).toBe(true);
  });
});

describe("staff", () => {
  test("only the owner can see and manage staff", async () => {
    await login("staff@example.test");
    await expectApiError(api("/clubs/c-001/staff"), 403);
    await login("manager@example.test");
    await expectApiError(api("/clubs/c-001/staff"), 403);
  });

  test("the owner can't be removed and can't demote themselves", async () => {
    await login("owner@example.test");
    const staff = await api<StaffMember[]>("/clubs/c-001/staff");
    const owner = staff.find((m) => m.role_key === "owner")!;
    expect(owner.is_you).toBe(true);
    await expectApiError(api(`/clubs/c-001/staff/${owner.membership_id}`, { method: "DELETE" }), 403);
    await expectApiError(
      api(`/clubs/c-001/staff/${owner.membership_id}`, { method: "PATCH", body: { role_key: "manager" } }),
      403,
    );
  });

  test("invites count toward the plan's staff limit", async () => {
    await login("owner@example.test");
    // Quezon (Starter) allows 3; the owner is 1.
    await api("/clubs/c-002/staff", {
      method: "POST",
      body: { email: "a@example.test", name: "Ana", role_key: "front_desk" },
    });
    await api("/clubs/c-002/staff", {
      method: "POST",
      body: { email: "b@example.test", name: "Ben", role_key: "scorer" },
    });
    const err = await expectApiError(
      api("/clubs/c-002/staff", {
        method: "POST",
        body: { email: "c@example.test", name: "Cy", role_key: "scorer" },
      }),
      403,
    );
    expect(err.message).toMatch(/allows 3 staff accounts/);
  });

  test("a role change takes effect on the person's permissions", async () => {
    await login("owner@example.test");
    const staff = await api<StaffMember[]>("/clubs/c-001/staff");
    const taylor = staff.find((m) => m.user.email === "staff@example.test")!;
    await api(`/clubs/c-001/staff/${taylor.membership_id}`, {
      method: "PATCH",
      body: { role_key: "scorer" },
    });
    await login("staff@example.test");
    await expectApiError(
      api("/clubs/c-001/bookings/walk-in", {
        method: "POST",
        body: {
          court_id: "court-001",
          starts_at: at(day(2), "09:00"),
          ends_at: at(day(2), "10:00"),
          guest_name: "X",
        },
      }),
      403,
    );
  });
});

describe("refunds and corrections", () => {
  // Each call books its own hour so the bookings don't collide.
  let hour = 8;
  async function paidBooking() {
    await login("owner@example.test");
    const date = day(5);
    const from = `${String(hour).padStart(2, "0")}:00`;
    const to = `${String(++hour).padStart(2, "0")}:00`;
    const b = await api<Booking>("/clubs/c-001/bookings/walk-in", {
      method: "POST",
      body: {
        court_id: "court-001",
        starts_at: at(date, from),
        ends_at: at(date, to),
        guest_name: "Refund test",
      },
    });
    await api(`/clubs/c-001/bookings/${b.id}/payments`, {
      method: "POST",
      body: { amount: "300.00", method: "cash" },
    });
    return api<BookingDetail>(`/clubs/c-001/bookings/${b.id}`);
  }

  test("a full refund marks the booking refunded and keeps the original payment", async () => {
    const b = await paidBooking();
    const payment = b.payments[0]!;
    await api(`/clubs/c-001/bookings/${b.id}/payments/${payment.id}/adjustments`, {
      method: "POST",
      body: { amount: "300.00", adjustment_type: "refund", reason: "Rained out" },
    });
    const after = await api<BookingDetail>(`/clubs/c-001/bookings/${b.id}`);
    expect(after.payment_status).toBe("refunded");
    expect(after.amount_paid).toBe("0.00");
    expect(after.payments[0]!.amount).toBe("300.00");
    expect(after.adjustments).toHaveLength(1);
  });

  test("adjustments can't exceed what's left of the payment", async () => {
    const b = await paidBooking();
    const payment = b.payments[0]!;
    const url = `/clubs/c-001/bookings/${b.id}/payments/${payment.id}/adjustments`;
    await api(url, {
      method: "POST",
      body: { amount: "50.00", adjustment_type: "correction", reason: "Typo" },
    });
    const err = await expectApiError(
      api(url, { method: "POST", body: { amount: "260.00", adjustment_type: "refund", reason: "Too much" } }),
      422,
    );
    expect(err.field("amount")).toMatch(/Only ₱250.00/);
  });

  test("front desk can record payments but not refund them", async () => {
    const b = await paidBooking();
    await login("staff@example.test");
    await expectApiError(
      api(`/clubs/c-001/bookings/${b.id}/payments/${b.payments[0]!.id}/adjustments`, {
        method: "POST",
        body: { amount: "10.00", adjustment_type: "refund", reason: "x" },
      }),
      403,
    );
  });
});

describe("read-only club", () => {
  test("an expired club can be viewed but not changed", async () => {
    await login("owner@example.test");
    const club = await api<Club>("/clubs/c-003");
    expect(club.read_only).toBe(true);
    const cal = await api<CalendarDay>("/clubs/c-003/calendar", { query: { date: day(-1) } });
    expect(cal.blocks.length).toBeGreaterThan(0); // history is kept
    const err = await expectApiError(api("/clubs/c-003", { method: "PATCH", body: club }), 403);
    expect(err.message).toMatch(/read-only/);
    await expectApiError(
      api("/clubs/c-003/bookings/walk-in", {
        method: "POST",
        body: {
          court_id: "court-006",
          starts_at: at(day(3), "09:00"),
          ends_at: at(day(3), "10:00"),
          guest_name: "X",
        },
      }),
      403,
    );
  });
});

describe("club settings", () => {
  test("settings are validated and saved", async () => {
    await login("owner@example.test");
    const club = await api<Club>("/clubs/c-001");
    const bad = await expectApiError(
      api("/clubs/c-001", {
        method: "PATCH",
        body: { ...club, settings: { ...club.settings, cancellation_policy: " " } },
      }),
      422,
    );
    expect(bad.field("settings.cancellation_policy")).toBeTruthy();
    const saved = await api<Club>("/clubs/c-001", {
      method: "PATCH",
      body: {
        ...club,
        name: "Mauban Pickleball Courts & Cafe",
        settings: { ...club.settings, allow_player_open_play: false },
      },
    });
    expect(saved.name).toBe("Mauban Pickleball Courts & Cafe");
    // Approval only makes sense when players can host.
    expect(saved.settings.require_open_play_approval).toBe(false);
  });

  test("only the owner can change settings", async () => {
    await login("manager@example.test");
    const club = await api<Club>("/clubs/c-001");
    await expectApiError(api("/clubs/c-001", { method: "PATCH", body: club }), 403);
  });
});
