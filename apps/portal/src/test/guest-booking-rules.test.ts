// R4: booking without an account, confirmed by a code sent to the email, and
// "Find my booking" with the booking code and email. Checked against the mock API.
import { setupServer } from "msw/node";
import { handlers } from "@courtflex/mocks";
import { ApiError, api, configureApi, shiftDate, todayIn } from "@courtflex/api";
import type { BookingDetail, BookingQuote, GuestCodeSent, PlayerBooking } from "@courtflex/api";

const server = setupServer(...handlers);
vi.setConfig({ testTimeout: 30_000 });

beforeAll(() => {
  configureApi({ baseUrl: "http://localhost/api/v1" });
  server.listen({ onUnhandledFrame: "error" });
});
afterAll(() => server.close());
beforeEach(() => sessionStorage.clear()); // guests aren't signed in

const TZ = "Asia/Manila";
const CODE = "246810"; // the mock always sends this code
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const DAY = shiftDate(todayIn(TZ), 5);
const at = (h: number) => new Date(`${DAY}T${String(h).padStart(2, "0")}:00:00+08:00`).toISOString();
const COURT = "court-004"; // Mauban, Court 3

async function expectApiError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  return error as ApiError;
}

const sendCode = (email: string, name = "Lito Ramos") =>
  api<GuestCodeSent>("/guest/code", { method: "POST", body: { name, email } });

async function guestBook(
  email: string,
  h: number,
  opts: { court?: string; code?: string; verification?: string; payment_method?: string } = {},
) {
  const court = opts.court ?? COURT;
  const q = await api<BookingQuote>("/bookings/quote", {
    query: { court_id: court, starts_at: at(h), duration_minutes: "60" },
  });
  const verification_id = opts.verification ?? (await sendCode(email)).verification_id;
  return api<PlayerBooking>("/guest/bookings", {
    method: "POST",
    body: {
      verification_id,
      code: opts.code ?? CODE,
      name: "Lito Ramos",
      phone: "09171230000",
      email,
      court_id: court,
      starts_at: at(h),
      duration_minutes: 60,
      expected_total: q.total,
      payment_method: opts.payment_method ?? "pay_at_court",
    },
  });
}
const lookup = (booking_code: string, email: string) =>
  api<PlayerBooking>("/guest/booking", { method: "POST", body: { booking_code, email } });

describe("guest booking", () => {
  test("a code is needed, it's checked, and asking again too soon is refused", async () => {
    const bad = await expectApiError(
      api("/guest/code", { method: "POST", body: { name: "", email: "nope" } }),
      422,
    );
    expect(bad.field("email")).toBeTruthy();
    await sendCode("first@example.test");
    await expectApiError(sendCode("first@example.test"), 429);
  });

  test("a wrong code counts down, then stops working", async () => {
    const { verification_id } = await sendCode("wrong@example.test");
    const first = await expectApiError(
      guestBook("wrong@example.test", 6, { verification: verification_id, code: "111111" }),
      422,
    );
    expect(first.field("code")).toMatch(/4 tries left/);
    for (let i = 0; i < 4; i++)
      await expectApiError(
        guestBook("wrong@example.test", 6, { verification: verification_id, code: "111111" }),
        422,
      );
    const locked = await expectApiError(
      guestBook("wrong@example.test", 6, { verification: verification_id }),
      422,
    );
    expect(locked.field("code")).toMatch(/Too many wrong codes/);
  });

  test("with the right code the booking is made for the guest, and the code can't be used twice", async () => {
    const { verification_id } = await sendCode("lito@example.test");
    const b = await guestBook("lito@example.test", 7, { verification: verification_id });
    expect(b.status).toBe("confirmed");
    expect(b.source).toBe("guest_web");
    await expectApiError(guestBook("lito@example.test", 9, { verification: verification_id }), 422);

    // The venue sees a guest with their details.
    await api("/auth/login", { method: "POST", body: { email: "owner@example.test", password: "password" } });
    const detail = await api<BookingDetail>(`/clubs/c-001/bookings/${b.id}`);
    expect(detail).toMatchObject({
      player: null,
      guest_name: "Lito Ramos",
      guest_email: "lito@example.test",
    });
  });

  test("one email can't hold two overlapping bookings", async () => {
    await guestBook("twice@example.test", 10);
    const err = await expectApiError(guestBook("twice@example.test", 10, { court: "court-008" }), 422);
    expect(err.field("starts_at")).toMatch(/You already have/);
  });

  test("a venue can turn guest booking off", async () => {
    // Quezon Sports Courts asks everyone to sign in.
    const err = await expectApiError(guestBook("quezon@example.test", 9, { court: "court-005" }), 403);
    expect(err.message).toMatch(/sign in/);
  });

  test("find my booking needs the code and the same email", async () => {
    const b = await guestBook("Find.Me@Example.test", 11);
    expect((await lookup(b.booking_code.toLowerCase(), "find.me@example.test")).id).toBe(b.id);
    await expectApiError(lookup(b.booking_code, "someone.else@example.test"), 404);
    for (let i = 0; i < 9; i++) await expectApiError(lookup(b.booking_code, `guess${i}@example.test`), 404);
    await expectApiError(lookup(b.booking_code, "find.me@example.test"), 429);
  });

  test("guests pay by GCash with a receipt, and can cancel before the deadline", async () => {
    const paid = await guestBook("gcash.guest@example.test", 12, { payment_method: "gcash" });
    expect(paid.status).toBe("pending");
    const access = { booking_code: paid.booking_code, email: "gcash.guest@example.test" };
    const sent = await api<PlayerBooking>("/guest/booking/receipt", {
      method: "POST",
      body: { ...access, receipt: PNG, reference_number: "GUEST-123456" },
    });
    expect(sent.receipt?.status).toBe("in_review");

    const other = await guestBook("cancel.guest@example.test", 13);
    const cancelled = await api<PlayerBooking>("/guest/booking/cancel", {
      method: "POST",
      body: { booking_code: other.booking_code, email: "cancel.guest@example.test", reason: "Plans changed" },
    });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancellation?.by_player).toBe(true);
  });
});
