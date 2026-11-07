import { clearMockData } from "./persist";
import { notify, unmuteNotifications } from "./notify-db";
import { notificationHandlers } from "./handlers-notifications";
import { adminHandlers } from "./handlers-admin";
import { adminUserHandlers } from "./handlers-admin-users";
import { adminBillingHandlers } from "./handlers-admin-billing";
import { adminPlatformHandlers } from "./handlers-admin-platform";
import { matchHandlers } from "./handlers-matches";
import { rankingHandlers } from "./handlers-rankings";
import { tournamentHandlers } from "./handlers-tournaments";
import { adminCompetitionHandlers } from "./handlers-admin-competition";
import { suspendedUsers, supportLine } from "./admin-db";
import { http } from "msw";
import type {
  AdjustmentInput,
  AvailabilitySlot,
  Booking,
  BookingDetail,
  CalendarDay,
  DailySummary,
  PaymentAdjustment,
  PaymentMethod,
  PaymentRecord,
  PlayerSearchResult,
  RecordPaymentInput,
  WalkInBookingInput,
} from "@courtflex/api";
import { todayIn } from "@courtflex/api";
import {
  TZ,
  adjustments,
  bookings,
  calendarBlocks,
  closuresOn,
  clubWindow,
  courts,
  findOverlap,
  hoursOn,
  netOfPayment,
  nextId,
  payments,
  person,
  priceFor,
  recomputePayment,
  expireHolds,
  reservations,
  statusHistory,
  subscriptionFor,
  unbookableReason,
  users,
} from "./db";
import {
  API,
  DATE_RE,
  SESSION_KEY,
  authorize,
  authorizeChange,
  fail,
  invalid,
  latency,
  meFor,
  noContent,
  ok,
  sessionUser,
} from "./http-helpers";
import { setupHandlers } from "./handlers-setup";
import { openPlayHandlers } from "./handlers-open-play";
import { playerHandlers } from "./handlers-player";
import { passwordOf } from "./player-db";
import { createBooking, HOLD_MINUTES, overlapMessage, timeProblem } from "./booking-service";
import { playerBookingHandlers } from "./handlers-bookings";

function bookingDetail(b: Booking): BookingDetail {
  return {
    ...b,
    payments: payments
      .filter((p) => p.booking_id === b.id)
      .sort((x, y) => y.received_at.localeCompare(x.received_at)),
    adjustments: adjustments.filter((a) => a.booking_id === b.id),
    status_history: statusHistory[b.id] ?? [],
  };
}

const bookingHandlers = [
  // Auth (§9.1)
  http.post(`${API}/auth/login`, async ({ request }) => {
    await latency();
    const body = (await request.json()) as { email?: string; password?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const user = users.find((u) => u.email === email);
    if (!user || body.password !== passwordOf(user.id)) {
      return fail(422, "That email and password don't match an account.", {
        email: ["That email and password don't match an account."],
      });
    }
    const suspended = suspendedUsers[user.id];
    if (suspended)
      return fail(
        403,
        `This account is suspended. Reason: ${suspended.reason} If you think this is a mistake, ${supportLine()}`,
      );
    sessionStorage.setItem(SESSION_KEY, user.id);
    return ok(meFor(user.id));
  }),

  http.post(`${API}/auth/logout`, async () => {
    sessionStorage.removeItem(SESSION_KEY);
    return noContent();
  }),

  http.get(`${API}/me`, async () => {
    const user = sessionUser();
    if (!user) return fail(401, "Unauthenticated.");
    return ok(meFor(user.id));
  }),

  http.get(`${API}/clubs/:club/calendar`, async ({ params, request }) => {
    await latency();
    const auth = authorize(String(params.club), "viewBookings");
    if (auth.error) return auth.error;
    const date = new URL(request.url).searchParams.get("date") ?? todayIn(TZ);
    if (!DATE_RE.test(date)) return invalid({ date: ["Use a date like 2026-11-04."] });
    const { open, close } = clubWindow(auth.club.id, date);
    const day: CalendarDay = {
      date,
      opens_at: open,
      closes_at: close,
      courts: courts.filter((c) => c.club_id === auth.club.id),
      blocks: calendarBlocks(auth.club.id, open, close),
      closures: closuresOn(auth.club.id, date),
    };
    return ok(day);
  }),

  http.get(`${API}/clubs/:club/reports/daily`, async ({ params, request }) => {
    await latency();
    const auth = authorize(String(params.club), "viewBookings");
    if (auth.error) return auth.error;
    const date = new URL(request.url).searchParams.get("date") ?? todayIn(TZ);
    const { open, close } = clubWindow(auth.club.id, date);
    const dayBookings = bookings.filter(
      (b) =>
        b.club_id === auth.club.id &&
        b.starts_at >= open &&
        b.starts_at < close &&
        b.status !== "cancelled" &&
        b.status !== "expired",
    );
    const dayPayments = payments.filter(
      (p) => p.status === "paid" && dayBookings.some((b) => b.id === p.booking_id),
    );
    // Money collected, net of refunds and corrections.
    const byMethod = new Map<PaymentMethod, number>();
    for (const p of dayPayments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + netOfPayment(p.id));
    const clubCourts = courts.filter((c) => c.club_id === auth.club.id && c.status === "active");
    const openHours = clubCourts.reduce((s, c) => {
      const h = hoursOn(c.id, date);
      return s + (h ? (new Date(h.close).getTime() - new Date(h.open).getTime()) / 3_600_000 : 0);
    }, 0);
    const bookedHours = calendarBlocks(auth.club.id, open, close).reduce(
      (s, b) => s + (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 3_600_000,
      0,
    );
    const summary: DailySummary = {
      date,
      bookings_count: dayBookings.length,
      checked_out_count: dayBookings.filter((b) => b.status === "completed").length,
      collected_total: [...byMethod.values()].reduce((s, n) => s + n, 0).toFixed(2),
      balance_due_total: dayBookings
        .filter((b) => b.status !== "no_show")
        .reduce((s, b) => s + Number(b.balance_due), 0)
        .toFixed(2),
      currency: "PHP",
      by_method: [...byMethod.entries()]
        .filter(([, amount]) => amount > 0)
        .map(([method, amount]) => ({ method, amount: amount.toFixed(2) })),
      booked_hours: bookedHours,
      open_hours: openHours,
    };
    return ok(summary);
  }),

  http.get(`${API}/clubs/:club/courts/:court/availability`, async ({ params, request }) => {
    await latency();
    const auth = authorize(String(params.club), "viewBookings");
    if (auth.error) return auth.error;
    const c = courts.find((x) => x.id === params.court && x.club_id === auth.club.id);
    if (!c) return fail(404, "Court not found.");
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? todayIn(TZ);
    const length = Number(url.searchParams.get("duration_minutes") ?? 60);
    const hours = hoursOn(c.id, date);
    if (!hours) return ok([] as AvailabilitySlot[]);
    const slots: AvailabilitySlot[] = [];
    for (
      let t = new Date(hours.open).getTime();
      t + length * 60_000 <= new Date(hours.close).getTime();
      t += 30 * 60_000
    ) {
      const starts = new Date(t).toISOString();
      const ends = new Date(t + length * 60_000).toISOString();
      slots.push({
        starts_at: starts,
        ends_at: ends,
        available: t > Date.now() && !unbookableReason(c, starts, ends) && !findOverlap(c.id, starts, ends),
        price: priceFor(c, starts, ends).toFixed(2),
        currency: "PHP",
      });
    }
    return ok(slots);
  }),

  http.get(`${API}/clubs/:club/players`, async ({ params, request }) => {
    await latency();
    const auth = authorize(String(params.club), "createWalkInBooking");
    if (auth.error) return auth.error;
    const q = (new URL(request.url).searchParams.get("search") ?? "").trim().toLowerCase();
    const results: PlayerSearchResult[] = users
      .filter(
        (u) => u.has_player_profile && (u.name.toLowerCase().includes(q) || (u.phone ?? "").includes(q)),
      )
      .slice(0, 8)
      .map((u) => ({
        id: u.id,
        name: u.name,
        home_city: u.home_city,
        phone_last4: u.phone?.slice(-4) ?? null,
      }));
    return ok(results);
  }),

  http.get(`${API}/clubs/:club/bookings/:booking`, async ({ params }) => {
    await latency();
    const auth = authorize(String(params.club), "viewBookings");
    if (auth.error) return auth.error;
    const b = bookings.find((x) => x.id === params.booking && x.club_id === auth.club.id);
    if (!b) return fail(404, "Booking not found.");
    return ok(bookingDetail(b));
  }),

  // Walk-in booking: same validation path a player booking would use (§8.4, §12.3).
  http.post(`${API}/clubs/:club/bookings/walk-in`, async ({ params, request }) => {
    await latency();
    const auth = authorizeChange(String(params.club), "createWalkInBooking");
    if (auth.error) return auth.error;
    if (!auth.club.settings.allow_walk_ins)
      return fail(403, "Walk-in bookings are turned off for this venue.");

    const body = (await request.json()) as WalkInBookingInput;
    const errors: Record<string, string[]> = {};
    const c = courts.find((x) => x.id === body.court_id && x.club_id === auth.club.id);
    if (!c) errors.court_id = ["Choose a court."];
    if (!body.player_id && !body.guest_name?.trim())
      errors.player = ["Choose a player or enter a guest name."];
    if (body.player_id && !users.some((u) => u.id === body.player_id)) {
      errors.player = ["That player account no longer exists."];
    }
    const s = new Date(body.starts_at).getTime();
    const e = new Date(body.ends_at).getTime();
    if (!body.starts_at || Number.isNaN(s) || Number.isNaN(e) || e <= s) {
      errors.starts_at = ["Choose a start time."];
    } else if (c) {
      const problem = timeProblem(c, new Date(s).toISOString(), new Date(e).toISOString());
      if (problem) errors.starts_at = [problem];
    }
    if (Object.keys(errors).length) return invalid(errors);

    const result = createBooking({
      club: auth.club,
      court: c!,
      startsAt: new Date(s).toISOString(),
      endsAt: new Date(e).toISOString(),
      source: "staff_walk_in",
      actorId: auth.user.id,
      playerId: body.player_id ?? null,
      guestName: body.guest_name,
      guestPhone: body.guest_phone,
      notes: body.notes,
      historyReason: "Walk-in",
    });
    if (!result.booking) return invalid({ starts_at: [overlapMessage(c!, result.overlap)] });
    const booking = result.booking;
    return ok(booking, 201);
  }),

  // On-site payment: staff record money actually collected (§8.5).
  http.post(`${API}/clubs/:club/bookings/:booking/payments`, async ({ params, request }) => {
    await latency();
    const auth = authorizeChange(String(params.club), "recordOnsitePayment");
    if (auth.error) return auth.error;
    const b = bookings.find((x) => x.id === params.booking && x.club_id === auth.club.id);
    if (!b) return fail(404, "Booking not found.");
    if (b.status === "cancelled" || b.status === "expired") {
      return fail(409, "This booking was cancelled. Payments can't be recorded on it.");
    }
    const body = (await request.json()) as RecordPaymentInput;
    const amount = Number(body.amount);
    const balance = Number(b.balance_due);
    const methods: PaymentMethod[] = ["cash", "gcash_at_venue", "maya_at_venue", "card_at_venue", "other"];
    const errors: Record<string, string[]> = {};
    if (!Number.isFinite(amount) || amount <= 0) errors.amount = ["Enter the amount you collected."];
    else if (amount > balance) errors.amount = [`The balance is only ₱${balance.toFixed(2)}.`];
    else if (amount < balance && !auth.club.settings.allow_partial_payments) {
      errors.amount = [`This venue collects the full balance (₱${balance.toFixed(2)}) in one payment.`];
    }
    if (!methods.includes(body.method)) errors.method = ["Choose how the player paid."];
    if (Object.keys(errors).length) return invalid(errors);

    const record: PaymentRecord = {
      id: nextId("pay"),
      booking_id: b.id,
      amount: amount.toFixed(2),
      currency: "PHP",
      method: body.method,
      status: "paid",
      reference_number: body.reference_number?.trim() || null,
      received_by: person(auth.user.id),
      received_at: new Date().toISOString(),
    };
    payments.push(record);
    recomputePayment(b);
    return ok(record, 201);
  }),

  // ── GCash and Maya receipts (R3) ──────────────────────
  http.get(`${API}/clubs/:club/receipts`, async ({ params }) => {
    await latency();
    const auth = authorize(String(params.club), "viewBookings");
    if (auth.error) return auth.error;
    expireHolds();
    return ok(
      bookings
        .filter(
          (b) => b.club_id === auth.club.id && b.status === "pending" && b.receipt?.status === "in_review",
        )
        .sort((a, b) => a.receipt!.submitted_at.localeCompare(b.receipt!.submitted_at)),
    );
  }),

  http.post(`${API}/clubs/:club/bookings/:booking/receipt/:action`, async ({ params, request }) => {
    await latency();
    const auth = authorizeChange(String(params.club), "recordOnsitePayment");
    if (auth.error) return auth.error;
    expireHolds();
    const b = bookings.find((x) => x.id === params.booking && x.club_id === auth.club.id);
    if (!b) return fail(404, "Booking not found.");
    if (b.status !== "pending" || b.receipt?.status !== "in_review")
      return fail(409, "There's no receipt waiting to be checked on this booking.");
    const now = new Date().toISOString();
    const r = reservations.find((x) => x.id === b.reservation_id);
    if (params.action === "approve") {
      const amount = Number(b.balance_due);
      payments.push({
        id: nextId("pay"),
        booking_id: b.id,
        amount: amount.toFixed(2),
        currency: "PHP",
        method: b.payment_method === "maya" ? "maya_at_venue" : "gcash_at_venue",
        status: "paid",
        reference_number: b.receipt.reference_number,
        received_by: person(auth.user.id),
        received_at: now,
      });
      recomputePayment(b);
      Object.assign(b.receipt, { status: "approved", reviewed_by: person(auth.user.id), reviewed_at: now });
      b.status = "confirmed";
      b.hold_expires_at = null;
      if (r) r.status = "confirmed";
      (statusHistory[b.id] ??= []).push({
        old_status: "pending",
        new_status: "confirmed",
        changed_by: person(auth.user.id),
        reason: `Receipt approved, ref ${b.receipt.reference_number}`,
        changed_at: now,
      });
      notify(
        b.player?.id,
        "bookings",
        "receipt_approved",
        "Your booking is confirmed",
        `${auth.club.name} checked your ${b.payment_method === "maya" ? "Maya" : "GCash"} receipt. See you on court.`,
        `/bookings/${b.id}`,
      );
      return ok(b);
    }
    if (params.action === "reject") {
      const body = (await request.json().catch(() => ({}))) as { reason?: string };
      const reason = body.reason?.trim() ?? "";
      if (!reason)
        return invalid({ reason: ["Say what's wrong, so the player can send the right receipt."] });
      if (reason.length > 300) return invalid({ reason: ["Keep it under 300 characters."] });
      Object.assign(b.receipt, {
        status: "rejected",
        rejection_reason: reason,
        reviewed_by: person(auth.user.id),
        reviewed_at: now,
      });
      // A fresh 30 minutes to send the right receipt.
      b.hold_expires_at = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString();
      (statusHistory[b.id] ??= []).push({
        old_status: "pending",
        new_status: "pending",
        changed_by: person(auth.user.id),
        reason: `Receipt turned down: ${reason}`,
        changed_at: now,
      });
      notify(
        b.player?.id,
        "bookings",
        "receipt_rejected",
        "Send another receipt",
        `${auth.club.name} couldn't accept your receipt: ${reason} The court is held for 30 more minutes.`,
        `/bookings/${b.id}`,
      );
      return ok(b);
    }
    return fail(404, "Unknown action.");
  }),

  // Staff switch a held booking to paying at the court: confirmed, unpaid, no hold.
  http.post(`${API}/clubs/:club/bookings/:booking/pay-at-court`, async ({ params }) => {
    await latency();
    const auth = authorizeChange(String(params.club), "recordOnsitePayment");
    if (auth.error) return auth.error;
    expireHolds();
    const b = bookings.find((x) => x.id === params.booking && x.club_id === auth.club.id);
    if (!b) return fail(404, "Booking not found.");
    if (b.status !== "pending" || (!b.hold_expires_at && b.receipt?.status !== "in_review"))
      return fail(409, "Only a booking waiting for GCash or Maya payment can switch to paying at the court.");
    const now = new Date().toISOString();
    b.payment_method = "pay_at_court";
    b.status = "confirmed";
    b.hold_expires_at = null;
    if (b.receipt?.status === "in_review")
      Object.assign(b.receipt, {
        status: "rejected",
        rejection_reason: "Switched to paying at the court",
        reviewed_by: person(auth.user.id),
        reviewed_at: now,
      });
    const r = reservations.find((x) => x.id === b.reservation_id);
    if (r) r.status = "confirmed";
    (statusHistory[b.id] ??= []).push({
      old_status: "pending",
      new_status: "confirmed",
      changed_by: person(auth.user.id),
      reason: "Switched to paying at the court",
      changed_at: now,
    });
    return ok(b);
  }),

  // Refunds and corrections never edit the original payment (§8.5, §13.2).
  http.post(
    `${API}/clubs/:club/bookings/:booking/payments/:payment/adjustments`,
    async ({ params, request }) => {
      await latency();
      const auth = authorizeChange(String(params.club), "adjustOnsitePayment");
      if (auth.error) return auth.error;
      const b = bookings.find((x) => x.id === params.booking && x.club_id === auth.club.id);
      const p = payments.find((x) => x.id === params.payment && x.booking_id === b?.id);
      if (!b || !p) return fail(404, "Payment not found.");
      const body = (await request.json()) as AdjustmentInput;
      const amount = Number(body.amount);
      const held = netOfPayment(p.id);
      const errors: Record<string, string[]> = {};
      if (!["refund", "correction"].includes(body.adjustment_type))
        errors.adjustment_type = ["Choose refund or correction."];
      if (!Number.isFinite(amount) || amount <= 0) errors.amount = ["Enter an amount above zero."];
      else if (amount > held) errors.amount = [`Only ₱${held.toFixed(2)} of this payment is left to adjust.`];
      if (!body.reason?.trim()) errors.reason = ["Add a reason. It's kept in the payment history."];
      if (Object.keys(errors).length) return invalid(errors);

      const adjustment: PaymentAdjustment = {
        id: nextId("adj"),
        payment_record_id: p.id,
        booking_id: b.id,
        amount: amount.toFixed(2),
        currency: "PHP",
        adjustment_type: body.adjustment_type,
        reason: body.reason.trim(),
        approved_by: person(auth.user.id),
        created_at: new Date().toISOString(),
      };
      adjustments.push(adjustment);
      recomputePayment(b);
      return ok(adjustment, 201);
    },
  ),

  http.post(`${API}/clubs/:club/bookings/:booking/cancel`, async ({ params, request }) => {
    await latency();
    const auth = authorizeChange(String(params.club), "cancelBooking");
    if (auth.error) return auth.error;
    const b = bookings.find((x) => x.id === params.booking && x.club_id === auth.club.id);
    if (!b) return fail(404, "Booking not found.");
    if (!["pending", "confirmed"].includes(b.status))
      return fail(409, "Only upcoming bookings can be cancelled.");
    const body = (await request.json()) as { reason?: string };
    if (!body.reason?.trim())
      return invalid({ reason: ["Add a reason. It's saved in the booking history."] });
    const old = b.status;
    b.status = "cancelled";
    const r = reservations.find((x) => x.id === b.reservation_id);
    if (r) r.status = "cancelled";
    statusHistory[b.id]?.push({
      old_status: old,
      new_status: "cancelled",
      changed_by: person(auth.user.id),
      reason: body.reason.trim(),
      changed_at: new Date().toISOString(),
    });
    return ok(b);
  }),

  http.get(`${API}/clubs/:club/subscription`, async ({ params }) => {
    await latency();
    const auth = authorize(String(params.club), "manageClubSubscription");
    if (auth.error) return auth.error;
    return ok(subscriptionFor(auth.club.id));
  }),
];

// Setup routes go first so /courts/:court doesn't swallow more specific paths.
export const handlers = [
  // Mock controls: forget the saved demo data so the next page load starts from the sample data.
  http.post(`${API}/__mock/reset`, () => {
    clearMockData();
    return noContent();
  }),
  ...adminHandlers,
  ...adminUserHandlers,
  ...adminBillingHandlers,
  ...adminPlatformHandlers,
  ...matchHandlers,
  ...rankingHandlers,
  ...tournamentHandlers,
  ...adminCompetitionHandlers,
  ...notificationHandlers,
  ...playerBookingHandlers,
  ...playerHandlers,
  ...openPlayHandlers,
  ...setupHandlers,
  ...bookingHandlers,
];

// The sample data is built: from now on, things that happen notify people.
unmuteNotifications();
