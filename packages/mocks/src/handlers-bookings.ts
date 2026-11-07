// Player court booking endpoints (Phase 2, blueprint §9.4).
import { http, HttpResponse } from "msw";
import type {
  Booking,
  BookingReceiptInput,
  GuestAccess,
  GuestBookingInput,
  GuestCodeRequest,
  GuestCodeSent,
  PersonRef,
  DayCell,
  PlayerBookingInput,
  VenueBookingDay,
  PlayerBookingTab,
  PriceChangedDetails,
  SlotTakenDetails,
} from "@courtflex/api";
import { shiftDate, todayIn } from "@courtflex/api";
import {
  TZ,
  bookings,
  clockOf,
  clubs,
  courts,
  expireHolds,
  findOverlap,
  hourlyRate,
  hoursOn,
  payments,
  person,
  priceFor,
  reservations,
  statusHistory,
  unbookableReason,
} from "./db";
import { places } from "./player-db";
import { needsOnboarding, unverified } from "./player-db";
import { API, fail, invalid, latency, ok, sessionUser } from "./http-helpers";
import { nextId } from "./db";
import {
  alternativesFor,
  checkPlayerRequest,
  createBooking,
  overlapMessage,
  payMethodsFor,
  playerBookingView,
  quoteFor,
} from "./booking-service";

const PNG_OR_JPEG = /^data:image\/(png|jpeg|webp);base64,/;
const MAX_RECEIPT = 7_000_000; // a 5 MB image is about 6.7 MB as a data URL

const conflict = (message: string, code: string, details: unknown) =>
  HttpResponse.json({ message, code, details }, { status: 409 });

/** Signed in, verified and onboarded: the same gate the app's routes use. */
function readyPlayer() {
  const user = sessionUser();
  if (!user) return { error: fail(401, "Your session has ended. Sign in again.") } as const;
  if (unverified.has(user.id))
    return { error: fail(403, "Verify your email before you book a court.") } as const;
  if (needsOnboarding(user.id))
    return { error: fail(403, "Finish setting up your player profile before you book a court.") } as const;
  return { user, error: null } as const;
}

const tabOf = (status: string, endsAt: string): PlayerBookingTab => {
  if (status === "cancelled" || status === "expired") return "cancelled";
  if (status === "completed" || status === "no_show") return "past";
  return new Date(endsAt).getTime() <= Date.now() ? "past" : "upcoming";
};

export const playerBookingHandlers = [
  // The server's price for a slot. Checks everything a booking would, without writing anything.
  http.get(`${API}/bookings/quote`, async ({ request }) => {
    await latency();
    // Signed in: the player rules apply. Visitors (guest booking) get the same price check.
    const signed = !!sessionUser();
    const auth = signed ? readyPlayer() : null;
    if (auth?.error) return auth.error;
    const url = new URL(request.url);
    const check = checkPlayerRequest(auth?.user.id ?? null, {
      court_id: url.searchParams.get("court_id") ?? undefined,
      starts_at: url.searchParams.get("starts_at") ?? undefined,
      duration_minutes: Number(url.searchParams.get("duration_minutes") ?? 60),
    });
    if (check.errors) return invalid(check.errors);
    return ok(quoteFor(check.club, check.court, check.startsAt, check.endsAt));
  }),

  http.post(`${API}/bookings`, async ({ request }) => {
    await latency();
    const auth = readyPlayer();
    if (auth.error) return auth.error;
    const body = (await request.json()) as Partial<PlayerBookingInput>;
    const check = checkPlayerRequest(auth.user.id, body);
    if (check.errors) return invalid(check.errors);
    const notes = body.notes?.trim() ?? "";
    if (notes.length > 300) return invalid({ notes: ["Keep notes under 300 characters."] });
    const methods = payMethodsFor(check.club);
    if (!body.payment_method || !methods.includes(body.payment_method))
      return invalid({
        payment_method: [
          methods.length
            ? "Choose how you'll pay."
            : `${check.club.name} hasn't set up payments in the app yet.`,
        ],
      });

    const total = priceFor(check.court, check.startsAt, check.endsAt).toFixed(2);
    if (body.expected_total !== total) {
      const details: PriceChangedDetails = { total };
      return conflict(
        `The price for this time is now ₱${total}. Check it and confirm again.`,
        "price_changed",
        details,
      );
    }

    const result = createBooking({
      club: check.club,
      court: check.court,
      startsAt: check.startsAt,
      endsAt: check.endsAt,
      source: "player_app",
      actorId: auth.user.id,
      playerId: auth.user.id,
      notes,
      historyReason:
        body.payment_method === "pay_at_court"
          ? "Booked in the app, paying at the court"
          : `Held for ${body.payment_method === "gcash" ? "GCash" : "Maya"} payment`,
      paymentMethod: body.payment_method,
    });
    if (!result.booking) {
      const details: SlotTakenDetails = {
        alternatives: alternativesFor(check.court, check.startsAt, check.endsAt),
      };
      return conflict(overlapMessage(check.court, result.overlap), "slot_taken", details);
    }
    return ok(playerBookingView(result.booking, auth.user.id), 201);
  }),

  // The player sends a GCash or Maya receipt while the court is held. Staff check it; it never counts as paid by itself.
  http.post(`${API}/bookings/:booking/receipt`, async ({ params, request }) => {
    await latency();
    const auth = readyPlayer();
    if (auth.error) return auth.error;
    expireHolds();
    const b = bookings.find((x) => x.id === params.booking && x.player?.id === auth.user.id);
    if (!b) return fail(404, "Booking not found.");
    const body = (await request.json()) as Partial<BookingReceiptInput>;
    return receiptFor(b, body, person(auth.user.id), auth.user.id);
  }),

  // A venue's whole day for the booking grid. Open to visitors; booking needs an account.
  http.get(`${API}/venues/:slug/booking-day`, async ({ params, request }) => {
    await latency();
    const club = clubs.find((c) => c.slug === params.slug && c.status === "active" && !c.read_only);
    const place = club && places[club.id];
    if (!club || !place) return fail(404, "Venue not found.");
    const today = todayIn(TZ);
    const date = new URL(request.url).searchParams.get("date") ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return invalid({ date: ["Choose a date."] });
    if (date < today) return invalid({ date: ["That date has passed."] });
    if (date > shiftDate(today, club.settings.booking_window_days))
      return invalid({
        date: [`${club.name} takes bookings up to ${club.settings.booking_window_days} days ahead.`],
      });
    const list = courts.filter((c) => c.club_id === club.id && c.status === "active");
    expireHolds();
    // Rows: every hour from the earliest opening to the latest closing across courts.
    const spans = list.map((c) => hoursOn(c.id, date)).filter((h): h is NonNullable<typeof h> => !!h);
    const rows: string[] = [];
    if (spans.length) {
      const open = Math.min(...spans.map((h) => new Date(h.open).getTime()));
      const close = Math.max(...spans.map((h) => new Date(h.close).getTime()));
      for (let t = open; t + 3_600_000 <= close; t += 3_600_000) rows.push(new Date(t).toISOString());
    }
    const day: VenueBookingDay = {
      venue: {
        id: club.id,
        slug: club.slug,
        name: club.name,
        address: club.address,
        city: club.city,
        province: club.province,
        latitude: place.lat,
        longitude: place.lng,
        cover_url: club.cover_url,
        contact_phone: club.contact_phone,
        bookable: club.settings.allow_online_booking,
        booking_window_days: club.settings.booking_window_days,
        price_from: Math.min(...list.map((c) => Number(c.base_price))).toFixed(2),
        cancellation_policy: club.settings.cancellation_policy,
        payments: club.settings.booking_payments,
        guest_booking: club.settings.allow_guest_booking,
      },
      date,
      rows: rows.map(clockOf),
      courts: list.map((c) => {
        const hours = hoursOn(c.id, date);
        return {
          id: c.id,
          name: c.name,
          indoor_outdoor: c.indoor_outdoor,
          surface_type: c.surface_type,
          base_price: c.base_price,
          cells: rows.map((s): DayCell | null => {
            const start = new Date(s).getTime();
            const e = new Date(start + 3_600_000).toISOString();
            if (!hours || s < hours.open || e > hours.close) return null;
            const price = priceFor(c, s, e);
            const special = hourlyRate(c, s) !== Number(c.base_price);
            const state: DayCell["state"] =
              start <= Date.now()
                ? "past"
                : unbookableReason(c, s, e)
                  ? "closed"
                  : findOverlap(c.id, s, e)
                    ? "booked"
                    : "available";
            return { starts_at: s, ends_at: e, state, price: price.toFixed(2), special_rate: special };
          }),
        };
      }),
    };
    return ok(day);
  }),

  // Mock control for tests and demos: move every hold closer to its end.
  http.post(`${API}/__mock/age-holds`, async ({ request }) => {
    const { minutes } = (await request.json()) as { minutes: number };
    for (const b of bookings) {
      if (b.hold_expires_at)
        b.hold_expires_at = new Date(new Date(b.hold_expires_at).getTime() - minutes * 60_000).toISOString();
    }
    expireHolds();
    return ok({ aged: minutes });
  }),

  http.get(`${API}/player/bookings`, async ({ request }) => {
    await latency();
    expireHolds();
    const auth = readyPlayer();
    if (auth.error) return auth.error;
    const tab = (new URL(request.url).searchParams.get("tab") ?? "upcoming") as PlayerBookingTab;
    if (!["upcoming", "past", "cancelled"].includes(tab))
      return invalid({ tab: ["Choose upcoming, past or cancelled."] });
    const mine = bookings
      .filter((b) => b.player?.id === auth.user.id && tabOf(b.status, b.ends_at) === tab)
      .sort((a, b) =>
        tab === "upcoming" ? a.starts_at.localeCompare(b.starts_at) : b.starts_at.localeCompare(a.starts_at),
      );
    return ok(mine.map((b) => playerBookingView(b, auth.user.id)));
  }),

  // Players only ever see their own bookings. Anyone else's is "not found", not "forbidden".
  http.get(`${API}/bookings/:booking`, async ({ params }) => {
    await latency();
    const auth = readyPlayer();
    if (auth.error) return auth.error;
    expireHolds();
    const b = bookings.find((x) => x.id === params.booking && x.player?.id === auth.user.id);
    if (!b) return fail(404, "Booking not found.");
    return ok(playerBookingView(b, auth.user.id));
  }),

  http.post(`${API}/bookings/:booking/cancel`, async ({ params, request }) => {
    await latency();
    const auth = readyPlayer();
    if (auth.error) return auth.error;
    const b = bookings.find((x) => x.id === params.booking && x.player?.id === auth.user.id);
    if (!b) return fail(404, "Booking not found.");
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    return cancelFor(
      b,
      body.reason,
      person(auth.user.id),
      auth.user.id,
      "Cancelled by the player in the app",
    );
  }),

  // ── Guest booking (R4): no account; a code sent to the email confirms it ────

  http.post(`${API}/guest/code`, async ({ request }) => {
    await latency();
    const body = (await request.json()) as Partial<GuestCodeRequest>;
    const email = body.email?.trim().toLowerCase() ?? "";
    const errors: Record<string, string[]> = {};
    if (!body.name?.trim() || body.name.trim().length < 2) errors.name = ["Enter your full name."];
    if (!EMAIL_RE.test(email)) errors.email = ["Enter a valid email. The code goes there."];
    if (Object.keys(errors).length) return invalid(errors);
    // One unused code a minute per email, to stop resend spam. A code already used to book doesn't count.
    const recent = Object.values(guestCodes).filter(
      (g) => g.email === email && !g.used && Date.now() - g.sentAt < 60_000,
    );
    if (recent.length) return fail(429, "A code was just sent. Wait a minute before asking for another.");
    const id = nextId("gv");
    const now = Date.now();
    // The real API emails a random code. The mock always uses 246810 (shown on screen as a mock hint).
    guestCodes[id] = {
      email,
      code: "246810",
      sentAt: now,
      expiresAt: now + 10 * 60_000,
      attempts: 0,
      used: false,
    };
    const sent: GuestCodeSent = {
      verification_id: id,
      email,
      expires_at: new Date(now + 10 * 60_000).toISOString(),
      resend_after: new Date(now + 60_000).toISOString(),
    };
    return ok(sent, 201);
  }),

  http.post(`${API}/guest/bookings`, async ({ request }) => {
    await latency();
    const body = (await request.json()) as Partial<GuestBookingInput>;
    const email = body.email?.trim().toLowerCase() ?? "";
    const name = body.name?.trim() ?? "";
    const phone = body.phone?.replace(/[\s-]/g, "") ?? "";
    const errors: Record<string, string[]> = {};
    if (name.length < 2) errors.name = ["Enter your full name."];
    if (!EMAIL_RE.test(email)) errors.email = ["Enter a valid email."];
    if (!/^(\+?63|0)9\d{9}$/.test(phone)) errors.phone = ["Enter a mobile number, like 09171234567."];
    if (Object.keys(errors).length) return invalid(errors);

    // The code proves the email is real. Five wrong tries and it stops working.
    const g = guestCodes[body.verification_id ?? ""];
    if (!g || g.email !== email || g.used)
      return invalid({ code: ["Ask for a new code: this one isn't for this email."] });
    if (Date.now() > g.expiresAt) return invalid({ code: ["That code has expired. Ask for a new one."] });
    if (g.attempts >= 5) return invalid({ code: ["Too many wrong codes. Ask for a new one."] });
    if ((body.code ?? "").trim() !== g.code) {
      g.attempts++;
      return invalid({ code: [`That code doesn't match. ${5 - g.attempts} tries left.`] });
    }

    const check = checkPlayerRequest(null, body, email);
    if (check.errors) return invalid(check.errors);
    if (!check.club.settings.allow_guest_booking)
      return fail(
        403,
        `${check.club.name} asks everyone to sign in to book. Create a free account or sign in.`,
      );
    const notes = body.notes?.trim() ?? "";
    if (notes.length > 300) return invalid({ notes: ["Keep notes under 300 characters."] });
    const methods = payMethodsFor(check.club);
    if (!body.payment_method || !methods.includes(body.payment_method))
      return invalid({ payment_method: ["Choose how you'll pay."] });
    const total = priceFor(check.court, check.startsAt, check.endsAt).toFixed(2);
    if (body.expected_total !== total) {
      const details: PriceChangedDetails = { total };
      return conflict(
        `The price for this time is now ₱${total}. Check it and confirm again.`,
        "price_changed",
        details,
      );
    }
    g.used = true;
    const guest = guestRef(email, name);
    const result = createBooking({
      club: check.club,
      court: check.court,
      startsAt: check.startsAt,
      endsAt: check.endsAt,
      source: "guest_web",
      actorId: guest.id,
      actor: guest,
      playerId: null,
      guestName: name,
      guestPhone: phone,
      guestEmail: email,
      notes,
      historyReason:
        body.payment_method === "pay_at_court"
          ? "Booked as a guest, paying at the court"
          : `Booked as a guest, held for ${body.payment_method === "gcash" ? "GCash" : "Maya"} payment`,
      paymentMethod: body.payment_method,
    });
    if (!result.booking) {
      g.used = false;
      const details: SlotTakenDetails = {
        alternatives: alternativesFor(check.court, check.startsAt, check.endsAt),
      };
      return conflict(overlapMessage(check.court, result.overlap), "slot_taken", details);
    }
    return ok(playerBookingView(result.booking, guest.id), 201);
  }),

  // Find my booking: the code and the email it was made with. Anything else is "not found".
  http.post(`${API}/guest/booking`, async ({ request }) => {
    await latency();
    const found = guestLookup((await request.json()) as Partial<GuestAccess>);
    if (found.error) return found.error;
    return ok(playerBookingView(found.booking, found.guest.id));
  }),

  http.post(`${API}/guest/booking/receipt`, async ({ request }) => {
    await latency();
    const body = (await request.json()) as Partial<GuestAccess & BookingReceiptInput>;
    const found = guestLookup(body);
    if (found.error) return found.error;
    return receiptFor(found.booking, body, found.guest, found.guest.id);
  }),

  http.post(`${API}/guest/booking/cancel`, async ({ request }) => {
    await latency();
    const body = (await request.json()) as Partial<GuestAccess> & { reason?: string };
    const found = guestLookup(body);
    if (found.error) return found.error;
    return cancelFor(found.booking, body.reason, found.guest, found.guest.id, "Cancelled by the guest");
  }),
];

// ── Shared by players and guests ───────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Codes sent to guests' emails, by verification id. In memory: a code is used within one visit. */
const guestCodes: Record<
  string,
  { email: string; code: string; sentAt: number; expiresAt: number; attempts: number; used: boolean }
> = {};
/** Wrong emails tried per booking code, to slow down guessing. */
const lookupFailures: Record<string, { count: number; until: number }> = {};

/** A guest has no account, so their email stands in for one in history and checks. */
const guestRef = (email: string, name: string) => ({
  id: `guest:${email.toLowerCase()}`,
  name: `${name} (guest)`,
});

function guestLookup(access: Partial<GuestAccess>) {
  const code = access.booking_code?.trim().toUpperCase() ?? "";
  const email = access.email?.trim().toLowerCase() ?? "";
  if (!code || !EMAIL_RE.test(email))
    return {
      error: invalid({
        booking_code: code ? [] : ["Enter your booking code."],
        email: EMAIL_RE.test(email) ? [] : ["Enter the email you booked with."],
      }),
    } as const;
  const lock = lookupFailures[code];
  if (lock && lock.count >= 10 && Date.now() < lock.until)
    return { error: fail(429, "Too many tries for this code. Wait 15 minutes, or call the venue.") } as const;
  expireHolds();
  const booking = bookings.find(
    (b) => b.booking_code === code && b.guest_email === email && b.source === "guest_web",
  );
  if (!booking) {
    const f = (lookupFailures[code] ??= { count: 0, until: 0 });
    f.count++;
    if (f.count >= 10) f.until = Date.now() + 15 * 60_000;
    return {
      error: fail(404, "No booking matches that code and email. Check both, or call the venue."),
    } as const;
  }
  delete lookupFailures[code];
  return { booking, guest: guestRef(email, booking.guest_name ?? "Guest"), error: null } as const;
}

function receiptFor(b: Booking, body: Partial<BookingReceiptInput>, actor: PersonRef, viewerId: string) {
  expireHolds();
  if (b.payment_method !== "gcash" && b.payment_method !== "maya")
    return fail(409, "This booking is paid at the court, so there's no receipt to send.");
  if (b.status === "expired")
    return fail(409, "The 30-minute hold ended, so the court was freed. Book again.");
  if (b.status !== "pending") return fail(409, "This booking isn't waiting for a payment.");
  if (b.receipt?.status === "in_review")
    return fail(409, "Your receipt is already with the venue. You'll see here when it's checked.");
  const errors: Record<string, string[]> = {};
  if (!body.receipt || !PNG_OR_JPEG.test(body.receipt))
    errors.receipt = ["Upload a screenshot of the receipt (PNG, JPG or WebP)."];
  else if (body.receipt.length > MAX_RECEIPT)
    errors.receipt = ["That image is over 5 MB. Use a smaller screenshot."];
  const ref = body.reference_number?.replace(/\s/g, "") ?? "";
  if (!/^[A-Za-z0-9-]{6,30}$/.test(ref))
    errors.reference_number = [
      "Enter the reference number from the receipt: letters and numbers, at least 6.",
    ];
  else {
    // One payment, one booking: the same reference can't pay for two bookings at this venue.
    const used =
      bookings.some(
        (x) =>
          x.id !== b.id &&
          x.club_id === b.club_id &&
          x.receipt &&
          x.receipt.status !== "rejected" &&
          x.receipt.reference_number.toLowerCase() === ref.toLowerCase(),
      ) ||
      payments.some(
        (pay) =>
          pay.reference_number?.toLowerCase() === ref.toLowerCase() &&
          bookings.find((x) => x.id === pay.booking_id)?.club_id === b.club_id,
      );
    if (used) errors.reference_number = ["This reference number is already on another booking."];
  }
  if (Object.keys(errors).length) return invalid(errors);
  b.receipt = {
    image_url: body.receipt!,
    reference_number: ref,
    submitted_at: new Date().toISOString(),
    status: "in_review",
    rejection_reason: null,
    reviewed_by: null,
    reviewed_at: null,
  };
  (statusHistory[b.id] ??= []).push({
    old_status: "pending",
    new_status: "pending",
    changed_by: actor,
    reason: `Sent a ${b.payment_method === "gcash" ? "GCash" : "Maya"} receipt, ref ${ref}`,
    changed_at: b.receipt.submitted_at,
  });
  return ok(playerBookingView(b, viewerId));
}

function cancelFor(
  b: Booking,
  rawReason: string | undefined,
  actor: PersonRef,
  viewerId: string,
  fallback: string,
) {
  const reason = rawReason?.trim() ?? "";
  if (reason.length > 300) return invalid({ reason: ["Keep it under 300 characters."] });
  const view = playerBookingView(b, viewerId);
  if (b.status === "cancelled") return fail(409, "This booking is already cancelled.");
  if (!["pending", "confirmed"].includes(b.status) || new Date(b.starts_at).getTime() <= Date.now())
    return fail(409, "This booking has already started, so it can't be cancelled.");
  if (!view.can_cancel) return fail(409, view.cancel_blocked_reason ?? "This booking can't be cancelled.");
  const old = b.status;
  b.status = "cancelled";
  b.hold_expires_at = null;
  const r = reservations.find((x) => x.id === b.reservation_id);
  if (r) r.status = "cancelled";
  (statusHistory[b.id] ??= []).push({
    old_status: old,
    new_status: "cancelled",
    changed_by: actor,
    reason: reason || fallback,
    changed_at: new Date().toISOString(),
  });
  return ok(playerBookingView(b, viewerId));
}
