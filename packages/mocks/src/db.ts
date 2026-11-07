// In-memory mock database seeded from blueprint §7 sample rows.
// Lives until the page reloads. Times are generated around "today" in Manila.

import type {
  Booking,
  BookingDetail,
  CalendarBlock,
  CalendarDay,
  Club,
  ClubRole,
  ClubSubscription,
  Court,
  OperatingHours,
  PaymentAdjustment,
  PaymentMethod,
  PaymentRecord,
  Permission,
  PersonRef,
  PriceRule,
  ReservationType,
  ScheduleException,
  SubscriptionInvoice,
  SubscriptionStatus,
  Weekday,
} from "@courtflex/api";
import { formatTimeRange, shiftDate, todayIn } from "@courtflex/api";

export const TZ = "Asia/Manila";
const OFFSET = "+08:00";

export function at(date: string, hm: string): string {
  return new Date(`${date}T${hm}:00${OFFSET}`).toISOString();
}

/** Weekday of a club-local date (0 = Sunday). */
export function weekdayOf(date: string): Weekday {
  return new Date(`${date}T12:00:00Z`).getUTCDay() as Weekday;
}

/** "HH:MM" of an instant in Manila. */
export function clockOf(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: TZ,
  }).format(new Date(iso));
}

// ── People ────────────────────────────────────────────────

export interface MockUser {
  id: string;
  name: string;
  email: string;
  super_admin: boolean;
  has_player_profile: boolean;
  home_city: string | null;
  phone: string | null;
}

const player = (id: string, name: string, email: string, city: string): MockUser => ({
  id,
  name,
  email,
  super_admin: false,
  has_player_profile: true,
  home_city: city,
  phone: `0917123${id.slice(2).padStart(4, "0")}`,
});

export const users: MockUser[] = [
  {
    id: "u-001",
    name: "Platform Admin",
    email: "admin@example.test",
    super_admin: true,
    has_player_profile: false,
    home_city: null,
    phone: null,
  },
  player("u-002", "Alex Venue Owner", "owner@example.test", "Mauban"),
  player("u-003", "Jamie Player", "player1@example.test", "Mauban"),
  player("u-004", "Sam Player", "player2@example.test", "Lucena"),
  player("u-005", "Taylor Staff", "staff@example.test", "Mauban"),
  player("u-006", "Andrea Santos", "andrea@example.test", "Mauban"),
  player("u-007", "Miguel Reyes", "miguel@example.test", "Sampaloc"),
  player("u-008", "Carla Dizon", "carla@example.test", "Lucena"),
  player("u-009", "Paolo Villanueva", "paolo@example.test", "Mauban"),
  player("u-010", "Bea Mendoza", "bea@example.test", "Tayabas"),
  player("u-011", "Rico Bautista", "rico@example.test", "Mauban"),
  player("u-012", "Joy Navarro", "joy@example.test", "Lucban"),
  player("u-013", "Dana Cruz", "manager@example.test", "Mauban"),
  player("u-014", "Kim Aquino", "kim@example.test", "Mauban"),
];

export const person = (id: string): PersonRef => {
  const u = users.find((x) => x.id === id);
  if (!u) throw new Error(`Unknown user ${id}`);
  return { id: u.id, name: u.name };
};

// ── Roles and memberships (§8.3, §11) ─────────────────────

/** What each club role can do. The server owns this mapping; the UI only reads it. */
export const rolePermissions: Record<ClubRole, Permission[]> = {
  owner: [
    "viewClub",
    "updateClub",
    "manageCourts",
    "manageCourtSchedules",
    "viewBookings",
    "createWalkInBooking",
    "recordOnsitePayment",
    "adjustOnsitePayment",
    "cancelBooking",
    "manageOpenPlay",
    "approvePlayerOpenPlay",
    "checkInOpenPlay",
    "manageClubMembers",
    "manageClubStaff",
    "viewClubReports",
    "manageClubSubscription",
  ],
  manager: [
    "viewClub",
    "manageCourts",
    "manageCourtSchedules",
    "viewBookings",
    "createWalkInBooking",
    "recordOnsitePayment",
    "adjustOnsitePayment",
    "cancelBooking",
    "manageOpenPlay",
    "approvePlayerOpenPlay",
    "checkInOpenPlay",
    "manageClubMembers",
    "viewClubReports",
  ],
  front_desk: [
    "viewClub",
    "viewBookings",
    "createWalkInBooking",
    "recordOnsitePayment",
    "cancelBooking",
    "checkInOpenPlay",
  ],
  court_attendant: ["viewClub", "viewBookings", "createWalkInBooking", "checkInOpenPlay"],
  scorer: ["viewClub", "viewBookings"],
};

export interface MockMembership {
  id: string;
  club_id: string;
  user_id: string;
  role_key: ClubRole;
  status: "active" | "invited" | "removed";
  invited_by: string | null;
  joined_at: string | null;
}

export const memberships: MockMembership[] = [
  {
    id: "cm-001",
    club_id: "c-001",
    user_id: "u-002",
    role_key: "owner",
    status: "active",
    invited_by: null,
    joined_at: "2026-10-20T01:00:00.000Z",
  },
  {
    id: "cm-002",
    club_id: "c-001",
    user_id: "u-005",
    role_key: "front_desk",
    status: "active",
    invited_by: "u-002",
    joined_at: "2026-10-22T02:30:00.000Z",
  },
  {
    id: "cm-004",
    club_id: "c-001",
    user_id: "u-013",
    role_key: "manager",
    status: "active",
    invited_by: "u-002",
    joined_at: "2026-10-21T03:00:00.000Z",
  },
  {
    id: "cm-005",
    club_id: "c-001",
    user_id: "u-014",
    role_key: "court_attendant",
    status: "invited",
    invited_by: "u-002",
    joined_at: null,
  },
  {
    id: "cm-003",
    club_id: "c-002",
    user_id: "u-002",
    role_key: "owner",
    status: "active",
    invited_by: null,
    joined_at: "2026-06-02T01:00:00.000Z",
  },
  {
    id: "cm-006",
    club_id: "c-003",
    user_id: "u-002",
    role_key: "owner",
    status: "active",
    invited_by: null,
    joined_at: "2026-03-10T01:00:00.000Z",
  },
];

export const activeMembership = (clubId: string, userId: string): MockMembership | undefined =>
  memberships.find((m) => m.club_id === clubId && m.user_id === userId && m.status === "active") ??
  superAdminAccess(clubId, userId);

/**
 * The Super Admin owns the whole system: owner-level access to every venue,
 * without being on its staff list. Their changes are recorded in the audit log.
 */
function superAdminAccess(clubId: string, userId: string): MockMembership | undefined {
  if (!users.find((u) => u.id === userId)?.super_admin) return undefined;
  if (!clubs.some((c) => c.id === clubId)) return undefined;
  return {
    id: `sa-${clubId}`,
    club_id: clubId,
    user_id: userId,
    role_key: "owner",
    status: "active",
    invited_by: null,
    joined_at: null,
  };
}

/** True when the person's access comes from being Super Admin, not from the venue's staff list. */
export const viaSuperAdmin = (clubId: string, userId: string) =>
  !memberships.some((m) => m.club_id === clubId && m.user_id === userId && m.status === "active") &&
  !!users.find((u) => u.id === userId)?.super_admin;

// ── Clubs and courts ──────────────────────────────────────

const defaultSettings: Club["settings"] = {
  allow_walk_ins: true,
  allow_partial_payments: true,
  default_slot_minutes: 60,
  booking_window_days: 14,
  allow_player_open_play: true,
  require_open_play_approval: true,
  cancellation_policy:
    "Free cancellation up to 24 hours before your booking. After that, call the front desk; the court fee may still be due.",
  player_cancellation_hours: 24,
  allow_online_booking: true,
  booking_payments: { pay_at_court: true, gcash: null, maya: null, require_prepayment: false },
  allow_guest_booking: true,
  payment_instructions:
    "Pay at the front desk when you arrive, before you go on court. We take cash, GCash and Maya. Show your booking code.",
  member_join_policy: "open",
  open_play_cancellation_hours: 6,
};

export const clubs: Club[] = [
  {
    id: "c-001",
    slug: "mauban-pickleball-courts",
    name: "Mauban Pickleball Courts",
    tagline: "Five courts by the port, open till 10 every night.",
    description:
      "Five courts by the Mauban port, one of them covered. Paddles for rent at the front desk. Courts 4 and 5 are kept for open play most evenings.",
    rules: "Non-marking shoes only. Rotate every game at open play. Settle court fees at the front desk.",
    logo_url: null,
    cover_url: null,
    contact_phone: "0917 555 0101",
    contact_email: "hello@maubanpickleball.test",
    address: "Rizal St., Brgy. Daungan",
    city: "Mauban",
    province: "Quezon",
    timezone: TZ,
    status: "active",
    subscription_status: "trialing",
    read_only: false,
    settings: {
      ...defaultSettings,
      booking_payments: {
        pay_at_court: true,
        gcash: { account_name: "Mauban Pickleball Courts", account_number: "09175550101", qr_url: null },
        maya: { account_name: "Mauban Pickleball Courts", account_number: "09185550101", qr_url: null },
        require_prepayment: false,
      },
    },
  },
  {
    id: "c-002",
    slug: "quezon-sports-courts",
    name: "Quezon Sports Courts",
    tagline: "Outdoor courts along the highway, lights on till 10.",
    description: "Outdoor courts along the Maharlika Highway.",
    rules: "Members show their pass at the gate.",
    logo_url: null,
    cover_url: null,
    contact_phone: "0917 555 0202",
    contact_email: "book@quezonsports.test",
    address: "Maharlika Hwy., Brgy. Ibabang Dupay",
    city: "Lucena",
    province: "Quezon",
    timezone: TZ,
    status: "active",
    subscription_status: "active",
    read_only: false,
    settings: {
      ...defaultSettings,
      allow_partial_payments: false,
      require_open_play_approval: false,
      member_join_policy: "approval",
      player_cancellation_hours: 12,
      cancellation_policy:
        "Cancel in the app up to 12 hours before. Later than that, call us; late cancellations pay half the court fee.",
      payment_instructions: "Pay in full at the counter before your game. Cash or GCash only.",
      booking_payments: {
        pay_at_court: true,
        gcash: { account_name: "Quezon Sports Courts Inc.", account_number: "09175550202", qr_url: null },
        maya: null,
        require_prepayment: false,
      },
      // Quezon wants every booking tied to an account.
      allow_guest_booking: false,
    },
  },
  {
    id: "c-003",
    slug: "lucena-dink-house",
    name: "Lucena Dink House",
    tagline: "Two indoor courts in the city proper.",
    description: "Two indoor courts in the Lucena city proper.",
    rules: "",
    logo_url: null,
    cover_url: null,
    contact_phone: "0917 555 0303",
    contact_email: "play@lucenadink.test",
    address: "Quezon Ave., Brgy. 4",
    city: "Lucena",
    province: "Quezon",
    timezone: TZ,
    status: "active",
    subscription_status: "expired",
    // Expired subscription: everything stays visible, nothing can be changed (§13.6).
    read_only: true,
    settings: { ...defaultSettings },
  },
];

const court = (
  id: string,
  club_id: string,
  name: string,
  code: string,
  io: Court["indoor_outdoor"],
  surface: string,
  price: string,
): Court => ({
  id,
  club_id,
  name,
  court_code: code,
  indoor_outdoor: io,
  surface_type: surface,
  base_price: price,
  currency: "PHP",
  status: "active",
});

export const courts: Court[] = [
  court("court-001", "c-001", "Court 1", "C1", "outdoor", "Acrylic", "300.00"),
  court("court-002", "c-001", "Court 2", "C2", "indoor", "Sport tile", "400.00"),
  court("court-004", "c-001", "Court 3", "C3", "outdoor", "Acrylic", "300.00"),
  court("court-008", "c-001", "Court 4", "C4", "outdoor", "Acrylic", "300.00"),
  court("court-009", "c-001", "Court 5", "C5", "outdoor", "Acrylic", "300.00"),
  court("court-003", "c-002", "Court A", "CA", "outdoor", "Concrete", "250.00"),
  court("court-005", "c-002", "Court B", "CB", "outdoor", "Concrete", "250.00"),
  court("court-006", "c-003", "Court 1", "L1", "indoor", "Sport tile", "450.00"),
  court("court-007", "c-003", "Court 2", "L2", "indoor", "Sport tile", "450.00"),
];

// ── Opening hours, prices, closures (§5.2) ────────────────

const week = (
  opens: string,
  closes: string,
  overrides: Partial<Record<Weekday, [string, string] | null>> = {},
) =>
  ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((weekday): OperatingHours => {
    const o = overrides[weekday];
    if (o === null) return { weekday, is_closed: true, opens_at: null, closes_at: null };
    return { weekday, is_closed: false, opens_at: o?.[0] ?? opens, closes_at: o?.[1] ?? closes };
  });

export const courtHours: Record<string, OperatingHours[]> = {
  "court-001": week("06:00", "22:00"),
  "court-002": week("06:00", "22:00"),
  "court-004": week("06:00", "22:00"),
  "court-008": week("06:00", "22:00"),
  "court-009": week("06:00", "22:00"),
  "court-003": week("06:00", "22:00", { 0: ["07:00", "21:00"] }),
  "court-005": week("06:00", "22:00", { 0: ["07:00", "21:00"] }),
  "court-006": week("07:00", "22:00", { 1: null }),
  "court-007": week("07:00", "22:00", { 1: null }),
};

export const priceRules: PriceRule[] = [
  // Floodlight rate on outdoor courts after 5 PM.
  {
    id: "pr-1",
    court_id: "court-001",
    day_of_week: null,
    starts_at: "17:00",
    ends_at: "22:00",
    price: "350.00",
    currency: "PHP",
  },
  {
    id: "pr-2",
    court_id: "court-004",
    day_of_week: null,
    starts_at: "17:00",
    ends_at: "22:00",
    price: "350.00",
    currency: "PHP",
  },
  ...["court-008", "court-009"].map((court_id, i) => ({
    id: `pr-1${i}`,
    court_id,
    day_of_week: null,
    starts_at: "17:00",
    ends_at: "22:00",
    price: "350.00",
    currency: "PHP" as const,
  })),
  {
    id: "pr-3",
    court_id: "court-003",
    day_of_week: null,
    starts_at: "18:00",
    ends_at: "22:00",
    price: "300.00",
    currency: "PHP",
  },
  {
    id: "pr-4",
    court_id: "court-005",
    day_of_week: null,
    starts_at: "18:00",
    ends_at: "22:00",
    price: "300.00",
    currency: "PHP",
  },
];

export const exceptions: ScheduleException[] = [];

/** Opening hours of a court on a club-local date, or null when it's closed all day. */
export function hoursOn(courtId: string, date: string): { open: string; close: string } | null {
  const h = courtHours[courtId]?.find((d) => d.weekday === weekdayOf(date));
  if (!h || h.is_closed || !h.opens_at || !h.closes_at) return null;
  return { open: at(date, h.opens_at), close: at(date, h.closes_at) };
}

/** The calendar window for a club on a date: earliest opening to latest closing. */
export function clubWindow(clubId: string, date: string) {
  const ranges = courts
    .filter((c) => c.club_id === clubId)
    .map((c) => hoursOn(c.id, date))
    .filter((r): r is { open: string; close: string } => r !== null);
  if (ranges.length === 0) return { open: at(date, "06:00"), close: at(date, "22:00") };
  return {
    open: ranges.map((r) => r.open).sort()[0]!,
    close: ranges
      .map((r) => r.close)
      .sort()
      .at(-1)!,
  };
}

/** Court time inside the club's window that can't be booked. */
export function closuresOn(clubId: string, date: string): CalendarDay["closures"] {
  const { open, close } = clubWindow(clubId, date);
  const out: CalendarDay["closures"] = [];
  for (const c of courts.filter((x) => x.club_id === clubId)) {
    const h = hoursOn(c.id, date);
    if (!h) {
      out.push({ court_id: c.id, starts_at: open, ends_at: close, reason: "Closed today" });
    } else {
      if (h.open > open)
        out.push({ court_id: c.id, starts_at: open, ends_at: h.open, reason: "Not open yet" });
      if (h.close < close) out.push({ court_id: c.id, starts_at: h.close, ends_at: close, reason: "Closed" });
    }
    if (c.status !== "active") {
      out.push({
        court_id: c.id,
        starts_at: open,
        ends_at: close,
        reason: c.status === "maintenance" ? "Under maintenance" : "Inactive",
      });
    }
    for (const e of exceptions.filter(
      (x) => x.court_id === c.id && x.starts_at < close && x.ends_at > open,
    )) {
      out.push({
        court_id: c.id,
        starts_at: e.starts_at < open ? open : e.starts_at,
        ends_at: e.ends_at > close ? close : e.ends_at,
        reason: e.reason,
      });
    }
  }
  return out;
}

/** Why a court can't be booked for a time, or null when it can. Shared by every booking path. */
export function unbookableReason(c: Court, startsAt: string, endsAt: string): string | null {
  if (c.status !== "active") return `${c.name} isn't open for booking.`;
  const date = todayIn(TZ, new Date(startsAt));
  const h = hoursOn(c.id, date);
  if (!h) return `${c.name} is closed that day.`;
  if (startsAt < h.open || endsAt > h.close) {
    return `${c.name} is open ${formatTimeRange(h.open, h.close, TZ)} that day. Choose a time inside those hours.`;
  }
  const closure = exceptions.find((e) => e.court_id === c.id && e.starts_at < endsAt && e.ends_at > startsAt);
  if (closure) return `${c.name} is closed then: ${closure.reason}.`;
  return null;
}

/** Hourly rate at a moment: the matching price rule, or the base rate. */
export function hourlyRate(c: Court, iso: string): number {
  const date = todayIn(TZ, new Date(iso));
  const t = clockOf(iso);
  const day = weekdayOf(date);
  const matching = priceRules.filter(
    (r) =>
      r.court_id === c.id &&
      (r.day_of_week === null || r.day_of_week === day) &&
      r.starts_at <= t &&
      t < r.ends_at,
  );
  // A rule for a specific day beats an every-day rule.
  const rule = matching.find((r) => r.day_of_week !== null) ?? matching[0];
  return Number(rule?.price ?? c.base_price);
}

// ── Reservations, bookings, payments ──────────────────────

export interface MockReservation {
  id: string;
  club_id: string;
  court_id: string;
  reservation_type: ReservationType;
  starts_at: string;
  ends_at: string;
  status: "held" | "confirmed" | "active" | "cancelled" | "expired" | "completed";
  label: string;
  /** Set for open play reservations. */
  session_id?: string;
}

export const reservations: MockReservation[] = [];
export const bookings: Booking[] = [];
export const payments: PaymentRecord[] = [];
export const adjustments: PaymentAdjustment[] = [];
export const statusHistory: Record<string, BookingDetail["status_history"]> = {};

/** Id and booking code counters. Saved with the rest of the demo data (persist.ts). */
export const counters = { seq: 100, code: 4100 };
export const nextId = (prefix: string) => `${prefix}-${++counters.seq}`;
export const nextBookingCode = () => `CF-${++counters.code}`;

export function priceFor(c: Court, startsAt: string, endsAt: string): number {
  let total = 0;
  for (let t = new Date(startsAt).getTime(); t < new Date(endsAt).getTime(); t += 30 * 60_000) {
    total += hourlyRate(c, new Date(t).toISOString()) / 2;
  }
  return total;
}

/** What's still held from one payment after refunds and corrections. */
export function netOfPayment(paymentId: string) {
  const p = payments.find((x) => x.id === paymentId);
  if (!p || p.status !== "paid") return 0;
  const adjusted = adjustments
    .filter((a) => a.payment_record_id === p.id)
    .reduce((s, a) => s + Number(a.amount), 0);
  return Number(p.amount) - adjusted;
}

export function recomputePayment(b: Booking) {
  const own = payments.filter((p) => p.booking_id === b.id && p.status === "paid");
  const net = own.reduce((s, p) => s + netOfPayment(p.id), 0);
  const total = Number(b.total);
  b.amount_paid = net.toFixed(2);
  b.balance_due = Math.max(total - net, 0).toFixed(2);
  const hadRefund = adjustments.some((a) => a.booking_id === b.id && a.adjustment_type === "refund");
  b.payment_status =
    net <= 0
      ? own.length > 0 && hadRefund
        ? "refunded"
        : "unpaid"
      : net >= total
        ? "paid"
        : "partially_paid";
}

interface SeedBooking {
  court: string;
  from: string;
  to: string;
  player?: string;
  guest?: string;
  source: Booking["source"];
  status?: Booking["status"];
  pay?: Array<[number, PaymentMethod, string?]>;
  notes?: string;
  dayOffset?: number;
}

interface SeedBlock {
  court: string;
  from: string;
  to: string;
  type: ReservationType;
  label: string;
  dayOffset?: number;
}

const seedBookings: SeedBooking[] = [
  {
    court: "court-001",
    from: "06:00",
    to: "07:00",
    player: "u-007",
    source: "player_app",
    pay: [[300, "cash"]],
  },
  {
    court: "court-002",
    from: "07:00",
    to: "08:30",
    player: "u-006",
    source: "player_app",
    pay: [[600, "gcash_at_venue", "7731 2290 551"]],
  },
  {
    court: "court-002",
    from: "09:00",
    to: "10:00",
    player: "u-004",
    source: "staff_walk_in",
    pay: [[400, "gcash_at_venue", "7731 4410 102"]],
  },
  {
    court: "court-001",
    from: "10:00",
    to: "11:00",
    guest: "Lorna Castillo",
    source: "staff_walk_in",
    pay: [[300, "cash"]],
  },
  {
    court: "court-004",
    from: "14:00",
    to: "15:00",
    player: "u-011",
    source: "player_app",
    status: "no_show",
  },
  {
    court: "court-001",
    from: "17:00",
    to: "18:00",
    player: "u-003",
    source: "player_app",
    pay: [[350, "cash"]],
  },
  { court: "court-002", from: "18:00", to: "19:00", player: "u-008", source: "player_app" },
  {
    court: "court-001",
    from: "19:00",
    to: "20:00",
    player: "u-009",
    source: "player_app",
    status: "pending",
  },
  {
    court: "court-002",
    from: "20:00",
    to: "21:30",
    player: "u-010",
    source: "player_app",
    pay: [[300, "maya_at_venue", "MY-88120"]],
    notes: "Bringing 2 guests",
  },
  {
    court: "court-004",
    from: "20:00",
    to: "22:00",
    guest: "Barkada ng Daungan",
    source: "owner_created",
    notes: "Birthday game, 8 people",
  },
  { court: "court-001", from: "07:00", to: "08:00", player: "u-012", source: "player_app", dayOffset: 1 },
  { court: "court-002", from: "18:00", to: "20:00", player: "u-003", source: "player_app", dayOffset: 1 },
  {
    court: "court-003",
    from: "08:00",
    to: "09:00",
    player: "u-004",
    source: "player_app",
    pay: [[250, "cash"]],
  },
  { court: "court-005", from: "18:00", to: "19:00", player: "u-008", source: "player_app" },
  { court: "court-003", from: "19:00", to: "21:00", guest: "Lucena Dinkers", source: "staff_walk_in" },
  // Lucena Dink House keeps its history after the subscription expired.
  {
    court: "court-006",
    from: "08:00",
    to: "09:00",
    player: "u-004",
    source: "player_app",
    pay: [[450, "cash"]],
    dayOffset: -1,
  },
  {
    court: "court-007",
    from: "19:00",
    to: "21:00",
    player: "u-008",
    source: "player_app",
    pay: [[900, "gcash_at_venue", "7731 0042 980"]],
    dayOffset: -1,
  },
  { court: "court-006", from: "18:00", to: "19:00", player: "u-010", source: "player_app", dayOffset: 2 },
];

const seedBlocks: SeedBlock[] = [
  { court: "court-004", from: "07:00", to: "09:00", type: "maintenance", label: "Line repainting" },
];

function seed() {
  const today = todayIn(TZ);
  const now = Date.now();

  for (const s of seedBlocks) {
    const date = shiftDate(today, s.dayOffset ?? 0);
    const c = courts.find((x) => x.id === s.court)!;
    const ends = at(date, s.to);
    reservations.push({
      id: nextId("res"),
      club_id: c.club_id,
      court_id: c.id,
      reservation_type: s.type,
      starts_at: at(date, s.from),
      ends_at: ends,
      status: new Date(ends).getTime() < now ? "completed" : "confirmed",
      label: s.label,
    });
  }

  for (const s of seedBookings) {
    const date = shiftDate(today, s.dayOffset ?? 0);
    const c = courts.find((x) => x.id === s.court)!;
    const startsAt = at(date, s.from);
    const endsAt = at(date, s.to);
    const ended = new Date(endsAt).getTime() < now;
    const total = priceFor(c, startsAt, endsAt);
    let status: Booking["status"] = s.status ?? "confirmed";
    if (ended && status === "confirmed") status = "completed";
    if (!ended && status === "no_show") status = "confirmed";

    const reservation: MockReservation = {
      id: nextId("res"),
      club_id: c.club_id,
      court_id: c.id,
      reservation_type: "booking",
      starts_at: startsAt,
      ends_at: endsAt,
      status: status === "completed" || status === "no_show" ? "completed" : "confirmed",
      label: "",
    };
    reservations.push(reservation);

    const createdBy =
      s.source === "player_app" ? (s.player ?? "u-003") : s.source === "owner_created" ? "u-002" : "u-005";
    const booking: Booking = {
      id: nextId("book"),
      club_id: c.club_id,
      court_id: c.id,
      reservation_id: reservation.id,
      booking_code: nextBookingCode(),
      source: s.source,
      starts_at: startsAt,
      ends_at: endsAt,
      status,
      payment_status: "unpaid",
      subtotal: total.toFixed(2),
      discount: "0.00",
      total: total.toFixed(2),
      amount_paid: "0.00",
      balance_due: total.toFixed(2),
      currency: "PHP",
      player: s.player ? person(s.player) : null,
      guest_name: s.guest ?? null,
      guest_phone: s.guest ? "0917 555 0142" : null,
      guest_email: null,
      notes: s.notes ?? null,
      created_by: person(createdBy),
      created_at: new Date(new Date(startsAt).getTime() - 2 * 86_400_000).toISOString(),
      payment_method: s.source === "player_app" ? "pay_at_court" : null,
      hold_expires_at: null,
      receipt: null,
    };
    bookings.push(booking);
    statusHistory[booking.id] = [
      {
        old_status: null,
        new_status: "confirmed",
        changed_by: person(createdBy),
        reason: null,
        changed_at: booking.created_at,
      },
    ];
    if (status !== "confirmed") {
      statusHistory[booking.id]!.push({
        old_status: "confirmed",
        new_status: status,
        changed_by: person("u-005"),
        reason: status === "no_show" ? "Player did not arrive" : null,
        changed_at: endsAt,
      });
    }

    for (const [amount, method, ref] of s.pay ?? []) {
      payments.push({
        id: nextId("pay"),
        booking_id: booking.id,
        amount: amount.toFixed(2),
        currency: "PHP",
        method,
        status: "paid",
        reference_number: ref ?? null,
        received_by: person("u-005"),
        received_at: startsAt,
      });
    }
    recomputePayment(booking);
  }

  // A typhoon closure next week on Quezon's Court B, to show closures on the courts page.
  const nextWeek = shiftDate(today, 7);
  exceptions.push({
    id: "ex-1",
    court_id: "court-005",
    starts_at: at(nextWeek, "06:00"),
    ends_at: at(nextWeek, "22:00"),
    exception_type: "closure",
    reason: "Resurfacing",
    created_by: person("u-002"),
    created_at: new Date().toISOString(),
  });
}

seed();

export function calendarBlocks(clubId: string, from: string, to: string): CalendarBlock[] {
  return reservations
    .filter(
      (r) =>
        r.club_id === clubId &&
        r.status !== "cancelled" &&
        r.status !== "expired" &&
        r.starts_at < to &&
        r.ends_at > from,
    )
    .map((r) => {
      const booking = bookings.find((b) => b.reservation_id === r.id) ?? null;
      if (booking && (booking.status === "cancelled" || booking.status === "expired")) return null;
      return {
        reservation_id: r.id,
        court_id: r.court_id,
        reservation_type: r.reservation_type,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        status: r.status as CalendarBlock["status"],
        label: booking ? (booking.player?.name ?? booking.guest_name ?? "Guest") : r.label,
        booking,
      } satisfies CalendarBlock;
    })
    .filter((b): b is CalendarBlock => b !== null)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** Only held, confirmed and active reservations block a court (§5.2). */
/** Who changed something when nobody did: an expired hold, for example. */
export const SYSTEM = { id: "system", name: "CourtFlex" };

/**
 * GCash and Maya bookings hold the court for 30 minutes. If no receipt arrived
 * in time, the booking expires and the court is free again. A receipt waiting to
 * be checked keeps the hold until staff decide. Runs before anything reads court time.
 */
export function expireHolds(now = Date.now()) {
  for (const b of bookings) {
    if (b.status !== "pending" || !b.hold_expires_at) continue;
    if (new Date(b.hold_expires_at).getTime() > now) continue;
    if (b.receipt?.status === "in_review") continue;
    b.status = "expired";
    b.hold_expires_at = null;
    const r = reservations.find((x) => x.id === b.reservation_id);
    if (r) r.status = "expired";
    (statusHistory[b.id] ??= []).push({
      old_status: "pending",
      new_status: "expired",
      changed_by: SYSTEM,
      reason: "No accepted receipt within 30 minutes, so the court was freed.",
      changed_at: new Date(now).toISOString(),
    });
  }
}

export function findOverlap(courtId: string, startsAt: string, endsAt: string) {
  expireHolds();
  return reservations.find(
    (r) =>
      r.court_id === courtId &&
      (r.status === "held" || r.status === "confirmed" || r.status === "active") &&
      r.starts_at < endsAt &&
      r.ends_at > startsAt,
  );
}

/** Upcoming bookings on a court that a schedule change would strand. */
export function upcomingBookingsOn(courtId: string, test: (b: Booking) => boolean) {
  const now = new Date().toISOString();
  return bookings.filter(
    (b) =>
      b.court_id === courtId &&
      b.ends_at > now &&
      (b.status === "confirmed" || b.status === "pending") &&
      test(b),
  );
}

export function describeBooking(b: Booking) {
  const c = courts.find((x) => x.id === b.court_id);
  const day = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: TZ }).format(
    new Date(b.starts_at),
  );
  return `${b.player?.name ?? b.guest_name ?? "Guest"}, ${c?.name ?? "court"}, ${day} ${formatTimeRange(b.starts_at, b.ends_at, TZ)} (${b.booking_code})`;
}

// ── Subscriptions (§5.2 H) ────────────────────────────────
// Plans and each venue's subscription are stored, so the Super Admin can change
// them (Phase 6, A4). A venue's subscription is made from the sample data the
// first time it's needed.

export interface MockPlan {
  code: string;
  name: string;
  /** Monthly price in pesos, e.g. "990.00". */
  price: string;
  billing_interval: "month";
  /** null: no limit. */
  limits: { courts: number | null; staff: number | null };
  features: { open_play: boolean; tournaments: boolean; reports: boolean };
  /** Offered to venues. A retired plan keeps its venues but can't be chosen. */
  offered: boolean;
}

export const subscriptionPlans: MockPlan[] = [
  {
    code: "plan-starter",
    name: "Starter",
    price: "990.00",
    billing_interval: "month",
    limits: { courts: 3, staff: 3 },
    features: { open_play: true, tournaments: false, reports: false },
    offered: true,
  },
  {
    code: "plan-pro",
    name: "Pro",
    price: "2490.00",
    billing_interval: "month",
    limits: { courts: 10, staff: 10 },
    features: { open_play: true, tournaments: true, reports: true },
    offered: true,
  },
];

export interface MockSubscription {
  id: string;
  club_id: string;
  plan_code: string;
  status: SubscriptionStatus;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  current_period_starts_at: string | null;
  current_period_ends_at: string | null;
  invoices: SubscriptionInvoice[];
}

/** Every venue's subscription, by club id. */
export const subscriptions: Record<string, MockSubscription> = {};

export const courtCount = (clubId: string) => courts.filter((c) => c.club_id === clubId).length;
export const staffCount = (clubId: string) =>
  memberships.filter((m) => m.club_id === clubId && m.status !== "removed").length;

/** A numeric plan limit, or null when the plan has none. */
export function planLimit(
  clubId: string,
  feature: "courts" | "staff",
): { limit: number; plan: string } | null {
  const sub = subscriptionRecord(clubId);
  const plan = planByCode(sub.plan_code);
  const limit = plan.limits[feature];
  return limit === null ? null : { limit, plan: plan.name };
}

export const planByCode = (code: string) =>
  subscriptionPlans.find((p) => p.code === code) ?? subscriptionPlans[0]!;

const DAY_MS = 86_400_000;

function invoice(
  clubId: string,
  n: number,
  amount: string,
  month: string,
  status: SubscriptionInvoice["status"],
  paidAt: string | null,
): SubscriptionInvoice {
  return {
    id: `inv-${clubId}-${n}`,
    invoice_number: `CF-INV-${month.replace("-", "")}-${clubId.replace("c-", "")}`,
    amount,
    currency: "PHP",
    status,
    issued_at: `${month}-01T00:00:00.000Z`,
    due_at: `${month}-08T00:00:00.000Z`,
    paid_at: paidAt,
  };
}

/** The sample subscription for a venue, made the first time it's needed. */
function seedSubscription(clubId: string): MockSubscription {
  const club = clubs.find((c) => c.id === clubId);
  const base = { id: `sub-${clubId}`, club_id: clubId };
  // Venues that signed up in the app: a Pro trial that starts when CourtFlex approves them.
  if (club?.status === "pending_review" || club?.subscription_status === "trialing") {
    if (clubId === "c-001") {
      const start = at(todayIn(TZ), "00:00"); // never after "now", so at most 14 days are left
      return {
        ...base,
        plan_code: "plan-pro",
        status: "trialing",
        trial_starts_at: start,
        trial_ends_at: new Date(new Date(start).getTime() + 14 * DAY_MS).toISOString(),
        current_period_starts_at: null,
        current_period_ends_at: null,
        invoices: [],
      };
    }
    return {
      ...base,
      plan_code: "plan-pro",
      status: "trialing",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: null,
      current_period_ends_at: null,
      invoices: [],
    };
  }
  if (club?.subscription_status === "expired") {
    return {
      ...base,
      plan_code: "plan-starter",
      status: "expired",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: "2026-09-01T00:00:00.000Z",
      current_period_ends_at: "2026-10-01T00:00:00.000Z",
      invoices: [
        invoice(clubId, 2, "990.00", "2026-10", "overdue", null),
        invoice(clubId, 1, "990.00", "2026-09", "paid", "2026-09-05T04:00:00.000Z"),
      ],
    };
  }
  return {
    ...base,
    plan_code: "plan-starter",
    status: "active",
    trial_starts_at: null,
    trial_ends_at: null,
    current_period_starts_at: "2026-11-01T00:00:00.000Z",
    current_period_ends_at: "2026-12-01T00:00:00.000Z",
    invoices: [
      invoice(clubId, 3, "990.00", "2026-11", "issued", null),
      invoice(clubId, 2, "990.00", "2026-10", "paid", "2026-10-03T02:15:00.000Z"),
      invoice(clubId, 1, "990.00", "2026-09", "paid", "2026-09-02T09:40:00.000Z"),
    ],
  };
}

export function subscriptionRecord(clubId: string): MockSubscription {
  return (subscriptions[clubId] ??= seedSubscription(clubId));
}

/**
 * Changes a subscription's status and keeps the venue in step: a plan that
 * ended (expired, cancelled, suspended) makes the venue read-only (§13.6).
 */
export function setSubscriptionStatus(clubId: string, status: SubscriptionStatus) {
  const sub = subscriptionRecord(clubId);
  sub.status = status;
  const club = clubs.find((c) => c.id === clubId);
  if (club) {
    club.subscription_status = status;
    club.read_only = status === "expired" || status === "cancelled" || status === "suspended";
  }
}

/** Starts a venue's free trial (when CourtFlex approves it), as long as the platform setting says. Once only. */
export function startTrial(clubId: string, days = 14) {
  const sub = subscriptionRecord(clubId);
  if (sub.status !== "trialing" || sub.trial_starts_at) return;
  sub.trial_starts_at = new Date().toISOString();
  sub.trial_ends_at = new Date(Date.now() + days * DAY_MS).toISOString();
}

export const trialDaysLeft = (sub: MockSubscription) =>
  sub.trial_ends_at
    ? Math.max(Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / DAY_MS), 0)
    : null;

export function subscriptionFor(clubId: string): ClubSubscription {
  const sub = subscriptionRecord(clubId);
  const plan = planByCode(sub.plan_code);
  const limit = (n: number | null) => (n === null ? "unlimited" : String(n));
  const has = (b: boolean) => (b ? "included" : "not_included");
  return {
    id: sub.id,
    club_id: clubId,
    status: sub.status,
    plan: {
      code: plan.code,
      name: plan.name,
      price: plan.price,
      currency: "PHP",
      billing_interval: plan.billing_interval,
    },
    trial_starts_at: sub.trial_starts_at,
    trial_ends_at: sub.trial_ends_at,
    trial_days_left: sub.status === "trialing" ? trialDaysLeft(sub) : null,
    current_period_starts_at: sub.current_period_starts_at,
    current_period_ends_at: sub.current_period_ends_at,
    entitlements: [
      {
        feature_key: "courts",
        label: "Courts",
        limit_value: limit(plan.limits.courts),
        usage: courtCount(clubId),
      },
      {
        feature_key: "staff",
        label: "Staff accounts",
        limit_value: limit(plan.limits.staff),
        usage: staffCount(clubId),
      },
      { feature_key: "open_play", label: "Open play sessions", limit_value: has(plan.features.open_play) },
      { feature_key: "tournaments", label: "Tournaments", limit_value: has(plan.features.tournaments) },
      { feature_key: "reports", label: "Advanced reports", limit_value: has(plan.features.reports) },
    ],
    invoices: [...sub.invoices].sort((a, b) => b.issued_at.localeCompare(a.issued_at)),
  };
}
