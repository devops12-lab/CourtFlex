// R3: player booking with pay at court, or GCash/Maya with a 30-minute hold and a
// receipt that venue staff check. Checked against the mock API.
import { setupServer } from "msw/node";
import { handlers } from "@courtflex/mocks";
import { ApiError, api, configureApi, shiftDate, todayIn } from "@courtflex/api";
import type { Booking, BookingQuote, PlayerBooking, SlotTakenDetails, VenueBookingDay } from "@courtflex/api";

const server = setupServer(...handlers);
vi.setConfig({ testTimeout: 30_000 });

beforeAll(() => {
  configureApi({ baseUrl: "http://localhost/api/v1" });
  server.listen({ onUnhandledFrame: "error" });
});
afterAll(() => server.close());

const TZ = "Asia/Manila";
const JAMIE = "player1@example.test";
const SAM = "player2@example.test";
const OWNER = "owner@example.test"; // Mauban
const DESK = "staff@example.test"; // Mauban front desk
const MAUBAN = "c-001";
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const login = (email: string) => {
  sessionStorage.clear();
  return api("/auth/login", { method: "POST", body: { email, password: "password" } });
};
async function expectApiError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  return error as ApiError;
}

/** An hour on Mauban's Court 2, three days out, so no sample booking is in the way. */
const DAY = shiftDate(todayIn(TZ), 3);
const at = (h: number) => new Date(`${DAY}T${String(h).padStart(2, "0")}:00:00+08:00`).toISOString();
const COURT = "court-002";

async function book(h: number, payment_method: "pay_at_court" | "gcash" | "maya", court = COURT) {
  const q = await api<BookingQuote>("/bookings/quote", {
    query: { court_id: court, starts_at: at(h), duration_minutes: "60" },
  });
  return api<PlayerBooking>("/bookings", {
    method: "POST",
    body: {
      court_id: court,
      starts_at: at(h),
      duration_minutes: 60,
      expected_total: q.total,
      payment_method,
    },
  });
}
const sendReceipt = (id: string, reference_number: string, receipt = PNG) =>
  api<PlayerBooking>(`/bookings/${id}/receipt`, { method: "POST", body: { receipt, reference_number } });
const review = (id: string, action: string, body: object = {}) =>
  api<Booking>(`/clubs/${MAUBAN}/bookings/${id}/${action}`, { method: "POST", body });
const ageHolds = (minutes: number) => api("/__mock/age-holds", { method: "POST", body: { minutes } });
const cellAt = async (h: number) => {
  const day = await api<VenueBookingDay>("/venues/mauban-pickleball-courts/booking-day", {
    query: { date: DAY },
  });
  return day.courts.find((c) => c.id === COURT)!.cells.find((c) => c?.starts_at === at(h))!;
};

describe("booking and paying", () => {
  test("pay at court: confirmed straight away, unpaid, nothing held", async () => {
    await login(JAMIE);
    const b = await book(6, "pay_at_court");
    expect(b.status).toBe("confirmed");
    expect(b.payment_status).toBe("unpaid");
    expect(b.hold_expires_at).toBeNull();
    expect((await cellAt(6)).state).toBe("booked");
  });

  test("GCash: the court is held as pending for 30 minutes with the venue's account", async () => {
    await login(JAMIE);
    const b = await book(7, "gcash");
    expect(b.status).toBe("pending");
    expect(b.pay_to?.account_number).toBe("09175550101");
    const mins = (new Date(b.hold_expires_at!).getTime() - Date.now()) / 60_000;
    expect(mins).toBeGreaterThan(29);
    expect(mins).toBeLessThanOrEqual(30);
    expect((await cellAt(7)).state).toBe("booked");
  });

  test("two players, one slot: the second is refused and offered other times", async () => {
    await login(JAMIE);
    await book(8, "gcash");
    await login(SAM);
    const err = await expectApiError(book(8, "pay_at_court"), 409);
    expect(err.code).toBe("slot_taken");
    expect((err.details as SlotTakenDetails).alternatives.length).toBeGreaterThan(0);
  });

  test("no receipt in time: the hold expires and the court is free again", async () => {
    await login(JAMIE);
    const b = await book(9, "maya");
    await ageHolds(31);
    const after = await api<PlayerBooking>(`/bookings/${b.id}`);
    expect(after.status).toBe("expired");
    expect((await cellAt(9)).state).toBe("available");
    await expectApiError(sendReceipt(b.id, "MAYA123456"), 409);
    await login(SAM);
    expect((await book(9, "pay_at_court")).status).toBe("confirmed");
  });

  test("receipt: checked, turned down with a reason, sent again, then approved and paid", async () => {
    await login(JAMIE);
    const b = await book(10, "gcash");
    await expectApiError(sendReceipt(b.id, "1234567890", "not an image"), 422);
    await expectApiError(sendReceipt(b.id, "12"), 422);
    const sent = await sendReceipt(b.id, "1234567890");
    expect(sent.receipt?.status).toBe("in_review");
    expect(sent.status).toBe("pending"); // an upload alone never confirms

    // A receipt waiting to be checked keeps the hold, even past 30 minutes.
    await ageHolds(45);
    expect((await api<PlayerBooking>(`/bookings/${b.id}`)).status).toBe("pending");

    await login(DESK);
    const waiting = await api<Booking[]>(`/clubs/${MAUBAN}/receipts`);
    expect(waiting.some((x) => x.id === b.id)).toBe(true);
    await expectApiError(review(b.id, "receipt/reject"), 422); // needs a reason
    const turnedDown = await review(b.id, "receipt/reject", {
      reason: "Amount is ₱300, the booking is ₱400.",
    });
    expect(turnedDown.receipt?.status).toBe("rejected");
    expect(turnedDown.status).toBe("pending");

    await login(JAMIE);
    const mine = await api<PlayerBooking>(`/bookings/${b.id}`);
    expect(mine.receipt?.rejection_reason).toMatch(/₱300/);
    expect((await sendReceipt(b.id, "1234567891")).receipt?.status).toBe("in_review");

    await login(DESK);
    const done = await review(b.id, "receipt/approve");
    expect(done.status).toBe("confirmed");
    expect(done.payment_status).toBe("paid");
    expect(done.balance_due).toBe("0.00");
    const detail = await api<{ payments: Array<{ reference_number: string | null; method: string }> }>(
      `/clubs/${MAUBAN}/bookings/${b.id}`,
    );
    expect(detail.payments.at(-1)).toMatchObject({
      reference_number: "1234567891",
      method: "gcash_at_venue",
    });
  });

  test("a reference number can't pay for two bookings", async () => {
    await login(JAMIE);
    const a = await book(11, "gcash");
    await sendReceipt(a.id, "REF-777777");
    await login(SAM);
    const b = await book(12, "gcash");
    const err = await expectApiError(sendReceipt(b.id, "ref-777777"), 422);
    expect(err.field("reference_number")).toMatch(/already on another booking/);
  });

  test("staff can switch a held booking to paying at the court", async () => {
    await login(SAM);
    const b = await book(13, "gcash");
    await login(OWNER);
    const switched = await review(b.id, "pay-at-court");
    expect(switched.status).toBe("confirmed");
    expect(switched.payment_method).toBe("pay_at_court");
    expect(switched.hold_expires_at).toBeNull();
  });

  test("only the venue's staff review receipts", async () => {
    await login(JAMIE);
    const b = await book(14, "gcash");
    await sendReceipt(b.id, "PLAYER-888888");
    await expectApiError(review(b.id, "receipt/approve"), 404);
  });

  test("payment choices come from the venue", async () => {
    await login(JAMIE);
    // Quezon takes GCash and pay at court, not Maya.
    const q = await api<BookingQuote>("/bookings/quote", {
      query: { court_id: "court-005", starts_at: at(9), duration_minutes: "60" },
    });
    const err = await expectApiError(
      api("/bookings", {
        method: "POST",
        body: {
          court_id: "court-005",
          starts_at: at(9),
          duration_minutes: 60,
          expected_total: q.total,
          payment_method: "maya",
        },
      }),
      422,
    );
    expect(err.field("payment_method")).toBeTruthy();
    // Balibago asks for payment before play: no pay at court.
    const day = await api<VenueBookingDay>("/venues/balibago-paddle-center/booking-day", {
      query: { date: DAY },
    });
    expect(day.venue.payments.require_prepayment).toBe(true);
    const court = day.courts[0]!.id;
    const free = day.courts[0]!.cells.find((c) => c?.state === "available")!;
    const q2 = await api<BookingQuote>("/bookings/quote", {
      query: { court_id: court, starts_at: free.starts_at, duration_minutes: "60" },
    });
    await expectApiError(
      api("/bookings", {
        method: "POST",
        body: {
          court_id: court,
          starts_at: free.starts_at,
          duration_minutes: 60,
          expected_total: q2.total,
          payment_method: "pay_at_court",
        },
      }),
      422,
    );
  });

  test("the booking grid is open to visitors and shows the server's prices", async () => {
    sessionStorage.clear();
    const day = await api<VenueBookingDay>("/venues/mauban-pickleball-courts/booking-day", {
      query: { date: DAY },
    });
    expect(day.courts.length).toBe(5);
    expect(day.rows.length).toBeGreaterThan(10);
    const cell = day.courts[0]!.cells.find((c) => c)!;
    expect(Number(cell.price)).toBeGreaterThan(0);
    await expectApiError(
      api("/venues/mauban-pickleball-courts/booking-day", { query: { date: shiftDate(todayIn(TZ), -1) } }),
      422,
    );
  });

  test("venue payment settings are checked when saved", async () => {
    await login(OWNER);
    const club = await api<{ settings: Record<string, unknown> } & Record<string, unknown>>(
      `/clubs/${MAUBAN}`,
    );
    const save = (booking_payments: object) =>
      api(`/clubs/${MAUBAN}`, {
        method: "PATCH",
        body: { ...club, settings: { ...club.settings, booking_payments } },
      });
    const none = await expectApiError(
      save({ pay_at_court: false, gcash: null, maya: null, require_prepayment: false }),
      422,
    );
    expect(none.field("settings.booking_payments")).toBeTruthy();
    const prepayNoWallet = await expectApiError(
      save({ pay_at_court: true, gcash: null, maya: null, require_prepayment: true }),
      422,
    );
    expect(prepayNoWallet.field("settings.booking_payments")).toMatch(/GCash or Maya/);
    const badNumber = await expectApiError(
      save({
        pay_at_court: true,
        gcash: { account_name: "Mauban", account_number: "12345", qr_url: null },
        maya: null,
        require_prepayment: false,
      }),
      422,
    );
    expect(badNumber.field("settings.booking_payments.gcash.account_number")).toBeTruthy();
  });
});
