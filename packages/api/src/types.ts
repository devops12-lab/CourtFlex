// Types mirror the blueprint's tables and /api/v1 contracts (§5, §9).
// Money is a decimal string ("300.00"); the server is the only source of prices.

export type UUID = string;
export type Money = string;
export type Currency = "PHP";
export type ISODateTime = string; // UTC from the server, displayed in the club's timezone
export type ISODate = string; // YYYY-MM-DD in the club's timezone

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "expired" | "completed" | "no_show";

export type PaymentStatus = "unpaid" | "partially_paid" | "paid" | "refunded" | "voided";

/** player_app: a signed-in player. guest_web: someone without an account, confirmed by an email code. */
export type BookingSource = "player_app" | "guest_web" | "staff_walk_in" | "owner_created";

export type PaymentMethod = "cash" | "gcash_at_venue" | "maya_at_venue" | "card_at_venue" | "other";

/** How a player pays for a court booking. Walk-ins and older bookings have none. */
export type BookingPayMethod = "pay_at_court" | "gcash" | "maya";

/** An e-wallet account players send money to. */
export interface WalletAccount {
  account_name: string;
  account_number: string;
  /** QR code image: a data URL until file storage exists. */
  qr_url: string | null;
}

/** How a venue takes payment for court bookings made in the app. */
export interface BookingPayments {
  pay_at_court: boolean;
  gcash: WalletAccount | null;
  maya: WalletAccount | null;
  /** Players must pay by GCash or Maya before play: pay at court isn't offered in the app. */
  require_prepayment: boolean;
}

/**
 * A GCash or Maya receipt the player uploaded. It never marks the booking paid by
 * itself: venue staff check it, then approve or turn it down with a reason.
 */
export interface BookingReceipt {
  image_url: string;
  reference_number: string;
  submitted_at: ISODateTime;
  status: "in_review" | "approved" | "rejected";
  rejection_reason: string | null;
  reviewed_by: PersonRef | null;
  reviewed_at: ISODateTime | null;
}

export type ReservationType = "booking" | "open_play" | "maintenance" | "private_event";

export type SubscriptionStatus =
  "trialing" | "active" | "past_due" | "grace_period" | "cancelled" | "expired" | "suspended";

export type ClubRole = "owner" | "manager" | "front_desk" | "court_attendant" | "scorer";

/**
 * Permission keys from blueprint §8.3, plus adjustOnsitePayment (refunds and
 * corrections), which the blueprint implies but doesn't name.
 */
export type Permission =
  | "viewClub"
  | "updateClub"
  | "manageCourts"
  | "manageCourtSchedules"
  | "viewBookings"
  | "createWalkInBooking"
  | "recordOnsitePayment"
  | "adjustOnsitePayment"
  | "cancelBooking"
  | "manageOpenPlay"
  | "approvePlayerOpenPlay"
  /** Check players in and run the live queue (blueprint §11 "Check in participants"). */
  | "checkInOpenPlay"
  /** Approve, suspend and renew player members, and edit membership plans. */
  | "manageClubMembers"
  | "manageClubStaff"
  | "viewClubReports"
  | "manageClubSubscription";

/** Every permission: what a venue's owner has, and what the Super Admin has at any venue. */
export const allPermissions: Permission[] = [
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
];

export interface PersonRef {
  id: UUID;
  name: string;
}

export interface ClubMembershipSummary {
  club_id: UUID;
  club_slug: string;
  club_name: string;
  role_key: ClubRole;
  permissions: Permission[];
}

export interface Me {
  id: UUID;
  name: string;
  email: string;
  global_roles: Array<"super_admin">;
  has_player_profile: boolean;
  /** New accounts confirm their email before playing. */
  email_verified: boolean;
  /** True until the player has a profile and a home barangay. */
  needs_onboarding: boolean;
  memberships: ClubMembershipSummary[];
}

export interface Club {
  id: UUID;
  slug: string;
  name: string;
  /** One line for directory cards. */
  tagline: string;
  description: string;
  rules: string;
  logo_url: string | null;
  cover_url: string | null;
  contact_phone: string;
  contact_email: string;
  address: string;
  city: string;
  province: string;
  timezone: string;
  status: "active" | "pending_review" | "suspended" | "rejected";
  /** Why the Super Admin declined or suspended it, shown to the owner. */
  status_reason?: string | null;
  subscription_status: SubscriptionStatus;
  /** True when the subscription no longer allows management actions. Data stays visible. */
  read_only: boolean;
  settings: ClubSettings;
}

/** Club operating rules (§5.2 club_settings). */
export interface ClubSettings {
  /** Players can book courts here in the app. Off: the venue is listed but "not bookable yet". */
  allow_online_booking: boolean;
  /** Pay at court, GCash or Maya for bookings made in the app. */
  booking_payments: BookingPayments;
  /** People can book without an account, confirmed by a code sent to their email. */
  allow_guest_booking: boolean;
  allow_walk_ins: boolean;
  allow_partial_payments: boolean;
  /** Length of one calendar slot: 30, 60 or 90 minutes. */
  default_slot_minutes: number;
  /** How far ahead players can book. */
  booking_window_days: number;
  /** Players and community clubs can host open play here. */
  allow_player_open_play: boolean;
  require_open_play_approval: boolean;
  /** How players become members: straight away, or after staff approve. */
  member_join_policy: "open" | "approval";
  /** Players can cancel an open play registration up to this many hours before it starts. */
  open_play_cancellation_hours: number;
  /** Shown to players before they book and when they cancel. */
  cancellation_policy: string;
  /** Players can cancel a court booking in the app up to this many hours before it starts. */
  player_cancellation_hours: number;
  /** How to pay at the venue, shown on the booking confirmation. */
  payment_instructions: string;
}

/** Weekday in the club's timezone: 0 is Sunday, 6 is Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** One day of a court's recurring schedule (§5.2 court_operating_hours). */
export interface OperatingHours {
  weekday: Weekday;
  is_closed: boolean;
  opens_at: string | null; // "06:00", club local time
  closes_at: string | null; // "22:00"
}

/** A rate for part of the day (§5.2 court_price_rules). Outside every rule the base rate applies. */
export interface PriceRule {
  id: UUID;
  court_id: UUID;
  /** null means every day. */
  day_of_week: Weekday | null;
  starts_at: string; // "17:00"
  ends_at: string; // "22:00"
  /** Per hour. */
  price: Money;
  currency: Currency;
}

/** A one-off closure: holiday, repairs, typhoon (§5.2 court_schedule_exceptions). */
export interface ScheduleException {
  id: UUID;
  court_id: UUID;
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  exception_type: "closure";
  reason: string;
  created_by: PersonRef;
  created_at: ISODateTime;
}

export interface Court {
  id: UUID;
  club_id: UUID;
  name: string;
  court_code: string;
  indoor_outdoor: "indoor" | "outdoor";
  surface_type: string;
  base_price: Money;
  currency: Currency;
  status: "active" | "inactive" | "maintenance";
}

export interface CourtDetail extends Court {
  hours: OperatingHours[];
  price_rules: PriceRule[];
}

export interface StaffMember {
  membership_id: UUID;
  user: { id: UUID; name: string; email: string };
  role_key: ClubRole;
  status: "active" | "invited";
  invited_by: PersonRef | null;
  joined_at: ISODateTime | null;
  /** The signed-in person, who can't remove or demote themselves. */
  is_you: boolean;
}

export interface Booking {
  id: UUID;
  club_id: UUID;
  court_id: UUID;
  reservation_id: UUID;
  booking_code: string;
  source: BookingSource;
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  status: BookingStatus;
  payment_status: PaymentStatus;
  subtotal: Money;
  discount: Money;
  total: Money;
  amount_paid: Money;
  balance_due: Money;
  currency: Currency;
  player: PersonRef | null;
  guest_name: string | null;
  guest_phone: string | null;
  /** Guest bookings: the email the code was sent to. With the booking code, it opens "Find my booking". */
  guest_email: string | null;
  notes: string | null;
  created_by: PersonRef;
  created_at: ISODateTime;
  /** How the player chose to pay. null for walk-ins and bookings made before payment choices. */
  payment_method: BookingPayMethod | null;
  /** GCash or Maya: the court is held until then. A receipt waiting to be checked keeps the hold. */
  hold_expires_at: ISODateTime | null;
  receipt: BookingReceipt | null;
}

export interface PaymentRecord {
  id: UUID;
  booking_id: UUID;
  amount: Money;
  currency: Currency;
  method: PaymentMethod;
  status: "paid" | "voided";
  reference_number: string | null;
  received_by: PersonRef;
  received_at: ISODateTime;
}

/** A refund or correction against a recorded payment. The original record is never edited (§8.5). */
export interface PaymentAdjustment {
  id: UUID;
  payment_record_id: UUID;
  booking_id: UUID;
  /** Positive; it reduces what was collected. */
  amount: Money;
  currency: Currency;
  adjustment_type: "refund" | "correction";
  reason: string;
  approved_by: PersonRef;
  created_at: ISODateTime;
}

export interface BookingDetail extends Booking {
  payments: PaymentRecord[];
  adjustments: PaymentAdjustment[];
  status_history: Array<{
    old_status: BookingStatus | null;
    new_status: BookingStatus;
    changed_by: PersonRef;
    reason: string | null;
    changed_at: ISODateTime;
  }>;
}

/** One block of court occupancy on the calendar (§5.2 court_reservations). */
export interface CalendarBlock {
  reservation_id: UUID;
  court_id: UUID;
  reservation_type: ReservationType;
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  status: "held" | "confirmed" | "active" | "completed";
  label: string;
  booking: Booking | null;
}

export interface CalendarDay {
  date: ISODate;
  opens_at: ISODateTime;
  closes_at: ISODateTime;
  courts: Court[];
  blocks: CalendarBlock[];
  /** Court time that can't be booked: outside opening hours, or a closure. */
  closures: Array<{ court_id: UUID; starts_at: ISODateTime; ends_at: ISODateTime; reason: string }>;
}

export interface AvailabilitySlot {
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  available: boolean;
  price: Money;
  currency: Currency;
}

export interface DailySummary {
  date: ISODate;
  bookings_count: number;
  checked_out_count: number;
  collected_total: Money;
  balance_due_total: Money;
  currency: Currency;
  by_method: Array<{ method: PaymentMethod; amount: Money }>;
  booked_hours: number;
  open_hours: number;
}

export interface Entitlement {
  feature_key: string;
  label: string;
  limit_value: string; // "10", "unlimited", "included", "not_included"
  usage?: number;
}

export interface SubscriptionInvoice {
  id: UUID;
  invoice_number: string;
  amount: Money;
  currency: Currency;
  status: "draft" | "issued" | "paid" | "void" | "overdue";
  issued_at: ISODateTime;
  due_at: ISODateTime;
  paid_at: ISODateTime | null;
  /** How it was paid, when the Super Admin recorded it: gcash, maya, bank_transfer or cash. */
  payment_method?: string | null;
  payment_reference?: string | null;
  /** Why it was voided. */
  void_reason?: string | null;
}

export interface ClubSubscription {
  id: UUID;
  club_id: UUID;
  status: SubscriptionStatus;
  plan: {
    code: string;
    name: string;
    price: Money;
    currency: Currency;
    billing_interval: "month" | "year";
  };
  trial_starts_at: ISODateTime | null;
  trial_ends_at: ISODateTime | null;
  /** Server-computed whole days left in the trial. */
  trial_days_left: number | null;
  current_period_starts_at: ISODateTime | null;
  current_period_ends_at: ISODateTime | null;
  entitlements: Entitlement[];
  invoices: SubscriptionInvoice[];
}

export interface PlayerSearchResult {
  id: UUID;
  name: string;
  home_city: string | null;
  phone_last4: string | null;
}

// Request bodies

export interface WalkInBookingInput {
  court_id: UUID;
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  player_id?: UUID;
  guest_name?: string;
  guest_phone?: string;
  notes?: string;
}

export interface CourtInput {
  name: string;
  court_code: string;
  indoor_outdoor: "indoor" | "outdoor";
  surface_type: string;
  base_price: Money;
  status: Court["status"];
}

export interface PriceRuleInput {
  day_of_week: Weekday | null;
  starts_at: string;
  ends_at: string;
  price: Money;
}

export interface ClosureInput {
  court_id: UUID;
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  reason: string;
}

export interface ClubUpdateInput {
  name: string;
  tagline: string;
  description: string;
  rules: string;
  logo_url: string | null;
  cover_url: string | null;
  contact_phone: string;
  contact_email: string;
  address: string;
  settings: ClubSettings;
}

export interface StaffInviteInput {
  email: string;
  name: string;
  role_key: Exclude<ClubRole, "owner">;
}

export interface AdjustmentInput {
  amount: Money;
  adjustment_type: PaymentAdjustment["adjustment_type"];
  reason: string;
}

export interface RecordPaymentInput {
  amount: Money;
  method: PaymentMethod;
  reference_number?: string;
}

// Response envelopes (§9)

export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
  message?: string;
}

export interface ApiValidationBody {
  message: string;
  errors?: Record<string, string[]>;
  /** Machine-readable reason, for errors the UI handles specially (for example "slot_taken"). */
  code?: string;
  /** Extra data that goes with the code. */
  details?: unknown;
}
