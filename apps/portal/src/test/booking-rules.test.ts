// Checks the mock API enforces the blueprint's booking rules (§13, §15.3),
// so the UI is built against the same behaviour the Laravel API must have.
import { setupServer } from "msw/node";
import { handlers } from "@courtflex/mocks";
import { ApiError, api, configureApi, shiftDate, todayIn } from "@courtflex/api";
import type { AvailabilitySlot, Booking, ClubSubscription } from "@courtflex/api";

const server = setupServer(...handlers);
const TZ = "Asia/Manila";
const tomorrow = shiftDate(todayIn(TZ), 1);
const at = (hm: string) => new Date(`${tomorrow}T${hm}:00+08:00`).toISOString();

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

test("a walk-in can't overlap an existing booking on the same court", async () => {
  await login("staff@example.test");
  const first = await api<Booking>("/clubs/c-001/bookings/walk-in", {
    method: "POST",
    body: { court_id: "court-002", starts_at: at("10:00"), ends_at: at("11:00"), guest_name: "Walk-in A" },
  });
  expect(first.status).toBe("confirmed");
  expect(first.total).toBe("400.00"); // indoor court, server price

  const clash = await expectApiError(
    api("/clubs/c-001/bookings/walk-in", {
      method: "POST",
      body: { court_id: "court-002", starts_at: at("10:30"), ends_at: at("11:30"), guest_name: "Walk-in B" },
    }),
    422,
  );
  expect(clash.field("starts_at")).toMatch(/Court 2 was just booked/);
});

test("back-to-back bookings are allowed (half-open time ranges)", async () => {
  await login("staff@example.test");
  const next = await api<Booking>("/clubs/c-001/bookings/walk-in", {
    method: "POST",
    body: { court_id: "court-002", starts_at: at("11:00"), ends_at: at("12:00"), guest_name: "Walk-in C" },
  });
  expect(next.status).toBe("confirmed");
});

test("availability marks booked slots as unavailable and prices peak hours", async () => {
  await login("owner@example.test");
  const slots = await api<AvailabilitySlot[]>("/clubs/c-001/courts/court-001/availability", {
    query: { date: tomorrow, duration_minutes: "60" },
  });
  const sevenAm = slots.find((s) => s.starts_at === at("07:00"));
  const sixPm = slots.find((s) => s.starts_at === at("18:00"));
  expect(sevenAm?.available).toBe(false); // seeded booking
  expect(sixPm?.price).toBe("350.00"); // outdoor floodlight rate after 5 PM
});

test("payments can't exceed the balance and update payment status", async () => {
  await login("staff@example.test");
  const booking = await api<Booking>("/clubs/c-001/bookings/walk-in", {
    method: "POST",
    body: { court_id: "court-002", starts_at: at("14:00"), ends_at: at("15:00"), guest_name: "Payer" },
  });
  expect(booking.payment_status).toBe("unpaid");

  const over = await expectApiError(
    api(`/clubs/c-001/bookings/${booking.id}/payments`, {
      method: "POST",
      body: { amount: "500.00", method: "cash" },
    }),
    422,
  );
  expect(over.field("amount")).toMatch(/balance/);

  await api(`/clubs/c-001/bookings/${booking.id}/payments`, {
    method: "POST",
    body: { amount: "150.00", method: "cash" },
  });
  const partial = await api<Booking>(`/clubs/c-001/bookings/${booking.id}`);
  expect(partial.payment_status).toBe("partially_paid");
  expect(partial.status).toBe("confirmed"); // booking and payment status stay separate
});

test("front desk staff can't see the club subscription", async () => {
  await login("staff@example.test");
  await expectApiError(api("/clubs/c-001/subscription"), 403);
});

test("staff can't reach another club's data", async () => {
  await login("staff@example.test");
  await expectApiError(api("/clubs/c-002/calendar"), 404);
});

test("each club has its own subscription", async () => {
  await login("owner@example.test");
  const a = await api<ClubSubscription>("/clubs/c-001/subscription");
  const b = await api<ClubSubscription>("/clubs/c-002/subscription");
  expect(a.status).toBe("trialing");
  expect(a.trial_days_left).toBeLessThanOrEqual(14);
  expect(b.status).toBe("active");
  expect(b.plan.code).not.toBe(a.plan.code);
});

test("signed-out requests are rejected", async () => {
  const error = await expectApiError(api("/me"), 401);
  expect(error.isUnauthenticated).toBe(true);
});
