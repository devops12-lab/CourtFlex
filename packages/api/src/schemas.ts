import { z } from "zod";
import type {
  AvailabilitySlot,
  Booking,
  BookingDetail,
  CalendarDay,
  Club,
  ClubSubscription,
  Court,
  CourtDetail,
  DailySummary,
  Me,
  PaymentAdjustment,
  PaymentRecord,
  PlayerSearchResult,
  ScheduleException,
  StaffMember,
} from "./types";

// Runtime checks for API responses. Each schema is annotated with its
// TypeScript type, so the compiler fails if the two ever drift apart.
// A response that doesn't match is reported instead of rendering bad data.

const money = z.string().regex(/^-?\d+\.\d{2}$/, "money must be a decimal string like 300.00");
const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();
const currency = z.literal("PHP");
const person = z.object({ id: z.string(), name: z.string() });

const wallet = z.object({
  account_name: z.string(),
  account_number: z.string(),
  qr_url: z.string().nullable(),
});

export const bookingPaymentsSchema = z.object({
  pay_at_court: z.boolean(),
  gcash: wallet.nullable(),
  maya: wallet.nullable(),
  require_prepayment: z.boolean(),
});

export const bookingPayMethod = z.enum(["pay_at_court", "gcash", "maya"]);
const clockTime = z.string().regex(/^\d{2}:\d{2}$/, "times must look like 06:00");
const weekday = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);
const clubRole = z.enum(["owner", "manager", "front_desk", "court_attendant", "scorer"]);

const bookingStatus = z.enum(["pending", "confirmed", "cancelled", "expired", "completed", "no_show"]);
const paymentStatus = z.enum(["unpaid", "partially_paid", "paid", "refunded", "voided"]);
const paymentMethod = z.enum(["cash", "gcash_at_venue", "maya_at_venue", "card_at_venue", "other"]);
const subscriptionStatus = z.enum([
  "trialing",
  "active",
  "past_due",
  "grace_period",
  "cancelled",
  "expired",
  "suspended",
]);
const permission = z.enum([
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
]);

export const meSchema: z.ZodType<Me> = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  global_roles: z.array(z.literal("super_admin")),
  has_player_profile: z.boolean(),
  email_verified: z.boolean(),
  needs_onboarding: z.boolean(),
  memberships: z.array(
    z.object({
      club_id: z.string(),
      club_slug: z.string(),
      club_name: z.string(),
      role_key: clubRole,
      permissions: z.array(permission),
    }),
  ),
});

export const clubSchema: z.ZodType<Club> = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  tagline: z.string(),
  description: z.string(),
  rules: z.string(),
  logo_url: z.string().nullable(),
  cover_url: z.string().nullable(),
  contact_phone: z.string(),
  contact_email: z.string(),
  address: z.string(),
  city: z.string(),
  province: z.string(),
  timezone: z.string(),
  status: z.enum(["active", "pending_review", "suspended", "rejected"]),
  status_reason: z.string().nullish(),
  subscription_status: subscriptionStatus,
  read_only: z.boolean(),
  settings: z.object({
    allow_walk_ins: z.boolean(),
    allow_partial_payments: z.boolean(),
    default_slot_minutes: z.number().int().positive(),
    booking_window_days: z.number().int().positive(),
    allow_player_open_play: z.boolean(),
    require_open_play_approval: z.boolean(),
    member_join_policy: z.enum(["open", "approval"]),
    open_play_cancellation_hours: z.number().int().nonnegative(),
    cancellation_policy: z.string(),
    player_cancellation_hours: z.number().int().nonnegative(),
    allow_online_booking: z.boolean(),
    booking_payments: bookingPaymentsSchema,
    allow_guest_booking: z.boolean(),
    payment_instructions: z.string(),
  }),
});

export const courtSchema: z.ZodType<Court> = z.object({
  id: z.string(),
  club_id: z.string(),
  name: z.string(),
  court_code: z.string(),
  indoor_outdoor: z.enum(["indoor", "outdoor"]),
  surface_type: z.string(),
  base_price: money,
  currency,
  status: z.enum(["active", "inactive", "maintenance"]),
});

const operatingHours = z.object({
  weekday,
  is_closed: z.boolean(),
  opens_at: clockTime.nullable(),
  closes_at: clockTime.nullable(),
});

const priceRule = z.object({
  id: z.string(),
  court_id: z.string(),
  day_of_week: weekday.nullable(),
  starts_at: clockTime,
  ends_at: clockTime,
  price: money,
  currency,
});

export const courtDetailSchema: z.ZodType<CourtDetail> = z.intersection(
  courtSchema,
  z.object({ hours: z.array(operatingHours), price_rules: z.array(priceRule) }),
);

export const scheduleExceptionSchema: z.ZodType<ScheduleException> = z.object({
  id: z.string(),
  court_id: z.string(),
  starts_at: isoDateTime,
  ends_at: isoDateTime,
  exception_type: z.literal("closure"),
  reason: z.string(),
  created_by: person,
  created_at: isoDateTime,
});

export const staffMemberSchema: z.ZodType<StaffMember> = z.object({
  membership_id: z.string(),
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  role_key: clubRole,
  status: z.enum(["active", "invited"]),
  invited_by: person.nullable(),
  joined_at: isoDateTime.nullable(),
  is_you: z.boolean(),
});

export const paymentAdjustmentSchema: z.ZodType<PaymentAdjustment> = z.object({
  id: z.string(),
  payment_record_id: z.string(),
  booking_id: z.string(),
  amount: money,
  currency,
  adjustment_type: z.enum(["refund", "correction"]),
  reason: z.string(),
  approved_by: person,
  created_at: isoDateTime,
});

const receipt = z.object({
  image_url: z.string(),
  reference_number: z.string(),
  submitted_at: isoDateTime,
  status: z.enum(["in_review", "approved", "rejected"]),
  rejection_reason: z.string().nullable(),
  reviewed_by: person.nullable(),
  reviewed_at: isoDateTime.nullable(),
});

export const bookingSchema: z.ZodType<Booking> = z.object({
  id: z.string(),
  club_id: z.string(),
  court_id: z.string(),
  reservation_id: z.string(),
  booking_code: z.string(),
  source: z.enum(["player_app", "guest_web", "staff_walk_in", "owner_created"]),
  starts_at: isoDateTime,
  ends_at: isoDateTime,
  status: bookingStatus,
  payment_status: paymentStatus,
  subtotal: money,
  discount: money,
  total: money,
  amount_paid: money,
  balance_due: money,
  currency,
  player: person.nullable(),
  guest_name: z.string().nullable(),
  guest_phone: z.string().nullable(),
  guest_email: z.string().nullable(),
  notes: z.string().nullable(),
  created_by: person,
  created_at: isoDateTime,
  payment_method: bookingPayMethod.nullable(),
  hold_expires_at: isoDateTime.nullable(),
  receipt: receipt.nullable(),
});

export const paymentRecordSchema: z.ZodType<PaymentRecord> = z.object({
  id: z.string(),
  booking_id: z.string(),
  amount: money,
  currency,
  method: paymentMethod,
  status: z.enum(["paid", "voided"]),
  reference_number: z.string().nullable(),
  received_by: person,
  received_at: isoDateTime,
});

export const bookingDetailSchema: z.ZodType<BookingDetail> = z.intersection(
  bookingSchema,
  z.object({
    payments: z.array(paymentRecordSchema),
    adjustments: z.array(paymentAdjustmentSchema),
    status_history: z.array(
      z.object({
        old_status: bookingStatus.nullable(),
        new_status: bookingStatus,
        changed_by: person,
        reason: z.string().nullable(),
        changed_at: isoDateTime,
      }),
    ),
  }),
);

export const calendarDaySchema: z.ZodType<CalendarDay> = z.object({
  date: isoDate,
  opens_at: isoDateTime,
  closes_at: isoDateTime,
  courts: z.array(courtSchema),
  blocks: z.array(
    z.object({
      reservation_id: z.string(),
      court_id: z.string(),
      reservation_type: z.enum(["booking", "open_play", "maintenance", "private_event"]),
      starts_at: isoDateTime,
      ends_at: isoDateTime,
      status: z.enum(["held", "confirmed", "active", "completed"]),
      label: z.string(),
      booking: bookingSchema.nullable(),
    }),
  ),
  closures: z.array(
    z.object({ court_id: z.string(), starts_at: isoDateTime, ends_at: isoDateTime, reason: z.string() }),
  ),
});

export const availabilitySchema: z.ZodType<AvailabilitySlot[]> = z.array(
  z.object({
    starts_at: isoDateTime,
    ends_at: isoDateTime,
    available: z.boolean(),
    price: money,
    currency,
  }),
);

export const dailySummarySchema: z.ZodType<DailySummary> = z.object({
  date: isoDate,
  bookings_count: z.number().int().nonnegative(),
  checked_out_count: z.number().int().nonnegative(),
  collected_total: money,
  balance_due_total: money,
  currency,
  by_method: z.array(z.object({ method: paymentMethod, amount: money })),
  booked_hours: z.number().nonnegative(),
  open_hours: z.number().nonnegative(),
});

export const subscriptionSchema: z.ZodType<ClubSubscription> = z.object({
  id: z.string(),
  club_id: z.string(),
  status: subscriptionStatus,
  plan: z.object({
    code: z.string(),
    name: z.string(),
    price: money,
    currency,
    billing_interval: z.enum(["month", "year"]),
  }),
  trial_starts_at: isoDateTime.nullable(),
  trial_ends_at: isoDateTime.nullable(),
  trial_days_left: z.number().int().nonnegative().nullable(),
  current_period_starts_at: isoDateTime.nullable(),
  current_period_ends_at: isoDateTime.nullable(),
  entitlements: z.array(
    z.object({
      feature_key: z.string(),
      label: z.string(),
      limit_value: z.string(),
      usage: z.number().int().nonnegative().optional(),
    }),
  ),
  invoices: z.array(
    z.object({
      id: z.string(),
      invoice_number: z.string(),
      amount: money,
      currency,
      status: z.enum(["draft", "issued", "paid", "void", "overdue"]),
      issued_at: isoDateTime,
      due_at: isoDateTime,
      paid_at: isoDateTime.nullable(),
    }),
  ),
});

export const playerSearchSchema: z.ZodType<PlayerSearchResult[]> = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    home_city: z.string().nullable(),
    phone_last4: z.string().nullable(),
  }),
);
