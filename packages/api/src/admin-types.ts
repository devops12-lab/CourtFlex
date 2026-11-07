// Super Admin portal (Phase 6). The Super Admin owns and runs the whole system: reviews
// new venues and community clubs, suspend accounts, and manage plans. Every
// change is recorded in the audit log with who did it and why.
import type { ISODateTime, Money, PersonRef, SubscriptionInvoice, SubscriptionStatus, UUID } from "./types";
import type { MatchSummary } from "./match-types";

/** What an admin looks after: a venue (court business) or a community club (player group). */
export type OrgKind = "venue" | "club";

/** Venues and clubs share these. "rejected" is a declined sign-up; its data is kept. */
export type OrgStatus = "pending_review" | "active" | "suspended" | "rejected";

export interface AuditEntry {
  id: UUID;
  at: ISODateTime;
  actor: PersonRef;
  /** Machine name, e.g. "venue.approved". */
  action: string;
  /** Plain-language summary, e.g. "Approved Daungan Pickleball". */
  summary: string;
  target: {
    type: OrgKind | "user" | "plan" | "subscription" | "announcement" | "settings" | "match";
    id: string;
    name: string;
  };
  reason: string | null;
}

/** One sign-up waiting for a decision. Oldest first. */
export interface ReviewItem {
  kind: OrgKind;
  id: UUID;
  name: string;
  city: string;
  province: string;
  submitted_at: ISODateTime;
  submitted_by: PersonRef & { email: string };
}

export interface AdminDashboard {
  counts: {
    venues_active: number;
    venues_pending: number;
    venues_suspended: number;
    clubs_active: number;
    clubs_pending: number;
    players: number;
    /** Bookings starting in the next 7 days, not cancelled. */
    bookings_next_7_days: number;
    /** Open play sessions in the next 7 days. */
    sessions_next_7_days: number;
    /** Match results disputed and waiting for a decision. */
    disputes: number;
  };
  /** Money, in pesos. CourtFlex's own income is subscriptions; booking payments go to the venues. */
  revenue: {
    /** Monthly recurring revenue: the monthly price of every paid, active subscription. */
    mrr: Money;
    /** Subscription invoices paid this month (Manila time). */
    subscriptions_paid_this_month: Money;
    /** Subscription invoices issued or overdue and not yet paid. */
    subscriptions_unpaid: Money;
    /** Booking payments recorded at every venue this month, less refunds. Paid to the venues. */
    bookings_paid_this_month: Money;
  };
  /** Venue trials that end within 7 days. */
  trials_ending: Array<{ club_id: UUID; club_name: string; ends_at: ISODateTime; days_left: number }>;
  review: ReviewItem[];
  recent_activity: AuditEntry[];
}

// ── Venues and clubs (A2) ─────────────────────────────────

/** Decisions on a venue or club. Declining and suspending need a reason, shown to the owner. */
export type OrgAction = "approve" | "reject" | "suspend" | "reactivate";

export interface OrgDecisionInput {
  action: OrgAction;
  reason?: string;
}

export interface OrgDecision {
  at: ISODateTime;
  by: PersonRef;
  action: OrgAction;
  reason: string | null;
}

export interface AdminVenueRow {
  id: UUID;
  slug: string;
  name: string;
  city: string;
  province: string;
  status: OrgStatus;
  owner: (PersonRef & { email: string }) | null;
  courts: number;
  plan: string;
  subscription_status: string;
  /** When it signed up in the app; null for venues added before sign-up existed. */
  submitted_at: ISODateTime | null;
}

export interface AdminVenueDetail extends AdminVenueRow {
  address: string;
  contact_phone: string;
  contact_email: string;
  pin: { lat: number; lng: number } | null;
  court_list: Array<{ id: UUID; name: string; indoor_outdoor: string; base_price: Money; status: string }>;
  bookings_next_7_days: number;
  /** The latest decision on this venue, if any. */
  decision: OrgDecision | null;
  history: AuditEntry[];
}

export interface AdminClubRow {
  id: UUID;
  slug: string;
  name: string;
  city: string;
  province: string;
  status: OrgStatus;
  created_by: (PersonRef & { email: string }) | null;
  members: number;
  submitted_at: ISODateTime;
}

export interface AdminClubDetail extends AdminClubRow {
  tagline: string;
  description: string;
  contact_email: string;
  contact_phone: string;
  join_policy: "open" | "approval";
  home_venue: { id: UUID; name: string } | null;
  plans: number;
  decision: OrgDecision | null;
  history: AuditEntry[];
}

// ── Plans, subscriptions, invoices, revenue (A4) ──────────

export interface SubscriptionPlanInput {
  name: string;
  /** Monthly price in pesos. */
  price: Money;
  /** null: no limit. */
  limits: { courts: number | null; staff: number | null };
  features: { open_play: boolean; tournaments: boolean; reports: boolean };
  /** Offered to venues. A retired plan keeps its venues but can't be chosen. */
  offered: boolean;
}

export interface AdminPlan extends SubscriptionPlanInput {
  code: string;
  billing_interval: "month";
  /** Venues on this plan now. */
  venues: number;
}

export interface AdminSubscriptionRow {
  id: UUID;
  club_id: UUID;
  club_name: string;
  owner: (PersonRef & { email: string }) | null;
  plan: { code: string; name: string; price: Money };
  status: SubscriptionStatus;
  trial_starts_at: ISODateTime | null;
  trial_ends_at: ISODateTime | null;
  trial_days_left: number | null;
  current_period_ends_at: ISODateTime | null;
  /** Issued or overdue invoices not yet paid. */
  amount_due: Money;
  overdue: boolean;
}

export interface AdminInvoiceRow extends SubscriptionInvoice {
  club_id: UUID;
  club_name: string;
  subscription_id: UUID;
}

export type InvoicePaymentMethod = "gcash" | "maya" | "bank_transfer" | "cash";

export interface AdminRevenue {
  /** Monthly recurring revenue: the monthly price of every paid, active subscription. */
  mrr: Money;
  arr: Money;
  paying_venues: number;
  trialing_venues: number;
  by_plan: Array<{ code: string; name: string; venues: number; mrr: Money }>;
  /** The last 6 months, oldest first. */
  by_month: Array<{ month: string; label: string; subscriptions_paid: Money; bookings_paid: Money }>;
  unpaid: Money;
  overdue: Money;
}

// ── Audit log, announcements, settings (A5) ───────────────

export type AuditType = AuditEntry["target"]["type"] | "billing" | "competition";

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
  page: number;
  pages: number;
}

export type AnnouncementAudience = "players" | "owners" | "everyone";

export interface AnnouncementInput {
  title: string;
  message: string;
  audience: AnnouncementAudience;
  tone: "info" | "warning";
  /** Shown from this time; empty means now. */
  starts_at?: ISODateTime | null;
  /** Hidden after this time; empty means until ended. */
  ends_at?: ISODateTime | null;
}

export interface Announcement extends Omit<Required<AnnouncementInput>, "starts_at"> {
  id: UUID;
  starts_at: ISODateTime;
  created_by: PersonRef;
  created_at: ISODateTime;
  /** Worked out from the dates: scheduled, live or ended. */
  status: "scheduled" | "live" | "ended";
}

/** Platform-wide settings. Public: the apps use them in their wording. */
export interface PlatformSettings {
  /** Length of a new venue's free trial. Trials already running keep their dates. */
  trial_days: number;
  /** When false, the owner sign-up page says CourtFlex isn't taking new venues. */
  venue_signups_open: boolean;
  support_email: string;
  support_phone: string;
}

// ── Competition (Phase 5, M5) ─────────────────────────────

/** A disputed result, for the Super Admin to settle. */
export interface AdminDispute {
  match: MatchSummary;
  dispute: { by: PersonRef; reason: string; at: ISODateTime };
  submitted_by: PersonRef;
  tournament: { id: UUID; name: string; slug: string } | null;
  resolution: { decision: "keep" | "void"; note: string; by: PersonRef; at: ISODateTime } | null;
}

export interface AdminRatingRow {
  player: PersonRef & { email: string; city: string | null };
  singles: { rating: number; games: number; provisional: boolean };
  doubles: { rating: number; games: number; provisional: boolean };
}

export interface RatingAdjustment {
  id: UUID;
  player: PersonRef;
  type: "singles" | "doubles";
  old: number;
  new: number;
  reason: string;
  by: PersonRef;
  at: ISODateTime;
}

export interface RatingRulesInput {
  initial: number;
  provisional_matches: number;
  k_provisional: number;
  k_established: number;
}
