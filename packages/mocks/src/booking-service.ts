// One booking service for every channel (blueprint §8.4): the player app and
// staff walk-ins both validate and write through here. The `source` field
// records which channel made the booking.
//
// The check for an overlapping reservation and the insert run in one
// synchronous step, so two requests can't both take the same court and time.
// On the real API this is a database transaction with an exclusion constraint.

import type {
  Booking,
  BookingAlternative,
  BookingPayMethod,
  BookingQuote,
  Club,
  Court,
  PersonRef,
  PlayerBooking,
} from "@courtflex/api";
import { formatTimeRange, shiftDate, todayIn } from "@courtflex/api";
import {
  TZ,
  bookings,
  clockOf,
  clubs,
  courts,
  findOverlap,
  hourlyRate,
  hoursOn,
  nextBookingCode,
  nextId,
  person,
  priceFor,
  reservations,
  statusHistory,
  unbookableReason,
} from "./db";

export const PLAYER_DURATIONS = [60, 90, 120, 180] as const;
/** How long a GCash or Maya booking holds the court while the player sends a receipt. */
export const HOLD_MINUTES = 30;

/** The ways a venue takes payment for app bookings, in the order players see them. */
export function payMethodsFor(club: Club): BookingPayMethod[] {
  const p = club.settings.booking_payments;
  return [
    ...(p.pay_at_court && !p.require_prepayment ? (["pay_at_court"] as const) : []),
    ...(p.gcash ? (["gcash"] as const) : []),
    ...(p.maya ? (["maya"] as const) : []),
  ];
}

/** Problems with the time itself, the same for every channel. Null when it's bookable. */
export function timeProblem(c: Court, startsAt: string, endsAt: string): string | null {
  if (new Date(startsAt).getTime() < Date.now()) return "That time has already passed. Choose a later slot.";
  return unbookableReason(c, startsAt, endsAt);
}

export interface NewBooking {
  club: Club;
  court: Court;
  startsAt: string;
  endsAt: string;
  source: Booking["source"];
  actorId: string;
  /** Who made it, when that isn't a user (a guest). */
  actor?: PersonRef;
  playerId: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  guestEmail?: string | null;
  notes?: string | null;
  historyReason: string | null;
  /** Player bookings only. GCash and Maya hold the court as pending. */
  paymentMethod?: BookingPayMethod | null;
}

export type CreateResult =
  { booking: Booking; overlap: null } | { booking: null; overlap: { starts_at: string; ends_at: string } };

/**
 * Reserve the court and write the booking, or report what's in the way.
 * The price always comes from the server's own rates.
 */
export function createBooking(req: NewBooking): CreateResult {
  const overlap = findOverlap(req.court.id, req.startsAt, req.endsAt);
  if (overlap) return { booking: null, overlap };

  const total = priceFor(req.court, req.startsAt, req.endsAt).toFixed(2);
  const held = req.paymentMethod === "gcash" || req.paymentMethod === "maya";
  const createdAt = new Date().toISOString();
  const reservation = {
    id: nextId("res"),
    club_id: req.club.id,
    court_id: req.court.id,
    reservation_type: "booking" as const,
    starts_at: req.startsAt,
    ends_at: req.endsAt,
    status: held ? ("held" as const) : ("confirmed" as const),
    label: "",
  };
  reservations.push(reservation);
  const booking: Booking = {
    id: nextId("book"),
    club_id: req.club.id,
    court_id: req.court.id,
    reservation_id: reservation.id,
    booking_code: nextBookingCode(),
    source: req.source,
    starts_at: req.startsAt,
    ends_at: req.endsAt,
    // Pay at court: confirmed, unpaid (§8.5). GCash or Maya: pending until a receipt is approved.
    status: held ? "pending" : "confirmed",
    payment_status: "unpaid",
    subtotal: total,
    discount: "0.00",
    total,
    amount_paid: "0.00",
    balance_due: total,
    currency: "PHP",
    player: req.playerId ? person(req.playerId) : null,
    guest_name: req.playerId ? null : (req.guestName?.trim() ?? null),
    guest_phone: req.playerId ? null : req.guestPhone?.trim() || null,
    guest_email: req.playerId ? null : req.guestEmail?.trim().toLowerCase() || null,
    notes: req.notes?.trim() || null,
    created_by: req.actor ?? person(req.actorId),
    created_at: createdAt,
    payment_method: req.paymentMethod ?? null,
    hold_expires_at: held ? new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString() : null,
    receipt: null,
  };
  bookings.push(booking);
  statusHistory[booking.id] = [
    {
      old_status: null,
      new_status: booking.status,
      changed_by: req.actor ?? person(req.actorId),
      reason: req.historyReason,
      changed_at: booking.created_at,
    },
  ];
  return { booking, overlap: null };
}

export const overlapMessage = (c: Court, o: { starts_at: string; ends_at: string }) =>
  `${c.name} was just booked from ${formatTimeRange(o.starts_at, o.ends_at, TZ)}. Choose another time or court.`;

// ── Player rules ──────────────────────────────────────────

/** A venue players can find and book: listed, active and not read-only. */
export function bookableVenue(clubId: string) {
  const club = clubs.find((c) => c.id === clubId);
  return club && club.status === "active" && !club.read_only ? club : undefined;
}

const isAligned = (iso: string) => /:(00|30)$/.test(clockOf(iso)) && new Date(iso).getUTCSeconds() === 0;

/**
 * Validation for a player's request, before anything is written. Returns field
 * errors, or the court and club it resolved.
 */
export function checkPlayerRequest(
  playerId: string | null,
  input: { court_id?: string; starts_at?: string; duration_minutes?: number },
  /** Guests: their email stands in for the account when checking for a clash. */
  guestEmail?: string,
) {
  const errors: Record<string, string[]> = {};
  const court = courts.find((c) => c.id === input.court_id);
  const club = court && bookableVenue(court.club_id);
  if (!court || !club) {
    errors.court_id = ["This court isn't taking bookings."];
    return { errors } as const;
  }
  if (!club.settings.allow_online_booking) {
    errors.court_id = [`${club.name} doesn't take bookings in the app yet. Call them to book.`];
    return { errors } as const;
  }

  const minutes = Number(input.duration_minutes);
  if (!PLAYER_DURATIONS.includes(minutes as 60)) errors.duration_minutes = ["Choose 1, 1.5 or 2 hours."];

  const start = new Date(input.starts_at ?? "");
  if (!input.starts_at || Number.isNaN(start.getTime())) {
    errors.starts_at = ["Choose a start time."];
    return { errors } as const;
  }
  const startsAt = start.toISOString();
  const endsAt = new Date(start.getTime() + (minutes || 60) * 60_000).toISOString();
  const today = todayIn(TZ);
  const last = shiftDate(today, club.settings.booking_window_days);
  if (!isAligned(startsAt)) errors.starts_at = ["Bookings start on the hour or half hour."];
  else if (todayIn(TZ, start) > last) {
    errors.starts_at = [`${club.name} takes bookings up to ${club.settings.booking_window_days} days ahead.`];
  } else {
    const problem = timeProblem(court, startsAt, endsAt);
    if (problem) errors.starts_at = [problem];
  }
  if (Object.keys(errors).length) return { errors } as const;

  // One player, one court at a time: refuse a second booking that overlaps one they hold.
  const clash = bookings.find(
    (b) =>
      (playerId ? b.player?.id === playerId : !!guestEmail && b.guest_email === guestEmail.toLowerCase()) &&
      ["pending", "confirmed"].includes(b.status) &&
      b.starts_at < endsAt &&
      b.ends_at > startsAt,
  );
  if (clash) {
    const clashCourt = courts.find((c) => c.id === clash.court_id)!;
    const clashClub = clubs.find((c) => c.id === clash.club_id)!;
    errors.starts_at = [
      `You already have ${clashCourt.name} at ${clashClub.name} from ${formatTimeRange(clash.starts_at, clash.ends_at, TZ)}.`,
    ];
    return { errors } as const;
  }
  return { errors: null, court, club, startsAt, endsAt, minutes } as const;
}

/** Rate bands the booking crosses, so the player sees how the total was reached. */
export function quoteFor(club: Club, court: Court, startsAt: string, endsAt: string): BookingQuote {
  const lines: BookingQuote["lines"] = [];
  for (let t = new Date(startsAt).getTime(); t < new Date(endsAt).getTime(); t += 30 * 60_000) {
    const s = new Date(t).toISOString();
    const e = new Date(t + 30 * 60_000).toISOString();
    const rate = hourlyRate(court, s);
    const last = lines.at(-1);
    if (last && Number(last.hourly_rate) === rate) {
      last.ends_at = e;
      last.amount = (Number(last.amount) + rate / 2).toFixed(2);
    } else {
      lines.push({ starts_at: s, ends_at: e, hourly_rate: rate.toFixed(2), amount: (rate / 2).toFixed(2) });
    }
  }
  return {
    court_id: court.id,
    court_name: court.name,
    venue_id: club.id,
    venue_slug: club.slug,
    venue_name: club.name,
    starts_at: startsAt,
    ends_at: endsAt,
    duration_minutes: (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000,
    lines,
    total: priceFor(court, startsAt, endsAt).toFixed(2),
    currency: "PHP",
    cancel_until: cancelUntil(club, startsAt),
    cancellation_policy: club.settings.cancellation_policy,
    payment_instructions: club.settings.payment_instructions,
  };
}

export const cancelUntil = (club: Club, startsAt: string) =>
  new Date(new Date(startsAt).getTime() - club.settings.player_cancellation_hours * 3_600_000).toISOString();

/**
 * Free slots to offer when the one the player wanted was just taken: the
 * same time on the venue's other courts, then the nearest times on the same court.
 */
export function alternativesFor(court: Court, startsAt: string, endsAt: string): BookingAlternative[] {
  const length = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  const free = (c: Court, s: string, e: string) => !timeProblem(c, s, e) && !findOverlap(c.id, s, e);
  const option = (c: Court, s: string, e: string): BookingAlternative => ({
    court_id: c.id,
    court_name: c.name,
    starts_at: s,
    ends_at: e,
    total: priceFor(c, s, e).toFixed(2),
  });

  const sameTime = courts
    .filter((c) => c.club_id === court.club_id && c.id !== court.id && c.status === "active")
    .filter((c) => free(c, startsAt, endsAt))
    .map((c) => option(c, startsAt, endsAt));

  const hours = hoursOn(court.id, todayIn(TZ, new Date(startsAt)));
  const nearby: BookingAlternative[] = [];
  if (hours) {
    for (
      let t = new Date(hours.open).getTime();
      t + length <= new Date(hours.close).getTime();
      t += 30 * 60_000
    ) {
      const s = new Date(t).toISOString();
      const e = new Date(t + length).toISOString();
      if (s !== startsAt && free(court, s, e)) nearby.push(option(court, s, e));
    }
    const target = new Date(startsAt).getTime();
    nearby.sort(
      (a, b) =>
        Math.abs(new Date(a.starts_at).getTime() - target) -
        Math.abs(new Date(b.starts_at).getTime() - target),
    );
  }
  return [...sameTime.slice(0, 3), ...nearby.slice(0, 3)];
}

// ── The player's view of a booking ────────────────────────

export function playerBookingView(b: Booking, viewerId: string): PlayerBooking {
  const club = clubs.find((c) => c.id === b.club_id)!;
  const court = courts.find((c) => c.id === b.court_id)!;
  const until = cancelUntil(club, b.starts_at);
  const upcoming =
    ["pending", "confirmed"].includes(b.status) && new Date(b.starts_at).getTime() > Date.now();
  let blocked: string | null = null;
  if (upcoming) {
    if (Number(b.amount_paid) > 0) {
      blocked = `You've paid ₱${b.amount_paid} at the venue. Call ${club.name} to cancel so they can refund you.`;
    } else if (new Date(until).getTime() <= Date.now()) {
      blocked = `It's too late to cancel in the app. Call ${club.name} to cancel.`;
    } else if (club.read_only) {
      blocked = `${club.name} can't take changes in CourtFlex right now. Call them to cancel.`;
    }
  }
  const cancelled =
    b.status === "cancelled"
      ? [...(statusHistory[b.id] ?? [])].reverse().find((h) => h.new_status === "cancelled")
      : undefined;
  return {
    id: b.id,
    booking_code: b.booking_code,
    source: b.source,
    status: b.status,
    payment_status: b.payment_status,
    starts_at: b.starts_at,
    ends_at: b.ends_at,
    duration_minutes: (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000,
    total: b.total,
    amount_paid: b.amount_paid,
    balance_due: b.balance_due,
    currency: "PHP",
    notes: b.notes,
    court: {
      id: court.id,
      name: court.name,
      indoor_outdoor: court.indoor_outdoor,
      surface_type: court.surface_type,
    },
    venue: {
      id: club.id,
      slug: club.slug,
      name: club.name,
      address: club.address,
      city: club.city,
      province: club.province,
      contact_phone: club.contact_phone,
    },
    cancellation_policy: club.settings.cancellation_policy,
    payment_instructions: club.settings.payment_instructions,
    payment_method: b.payment_method,
    hold_expires_at: b.hold_expires_at,
    pay_to:
      b.payment_method === "gcash"
        ? club.settings.booking_payments.gcash
        : b.payment_method === "maya"
          ? club.settings.booking_payments.maya
          : null,
    receipt: b.receipt
      ? {
          image_url: b.receipt.image_url,
          reference_number: b.receipt.reference_number,
          submitted_at: b.receipt.submitted_at,
          status: b.receipt.status,
          rejection_reason: b.receipt.rejection_reason,
          reviewed_at: b.receipt.reviewed_at,
        }
      : null,
    cancel_until: until,
    can_cancel: upcoming && !blocked,
    cancel_blocked_reason: blocked,
    cancellation: cancelled
      ? {
          cancelled_at: cancelled.changed_at,
          by_player: cancelled.changed_by.id === viewerId,
          // Staff notes stay with staff; the player only sees their own reason.
          reason: cancelled.changed_by.id === viewerId ? cancelled.reason : null,
        }
      : null,
    created_at: b.created_at,
  };
}
