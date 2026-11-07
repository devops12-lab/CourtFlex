// Clubs, members and open play (Phase 4, see PHASE4_CLUBS_OPEN_PLAY.md).
// "Organizer" is either a venue club (the blueprint's tenant, with courts)
// or a community club (a player group that plays at venues).

import type { Currency, ISODateTime, Money, PaymentMethod, PersonRef, UUID, WalletAccount } from "./types";
export type { WalletAccount } from "./types";

export type OrganizerType = "venue" | "community";

export interface OrganizerRef {
  type: OrganizerType;
  id: UUID;
  slug: string;
  name: string;
  logo_url: string | null;
}

export type SkillLevel = "all" | "beginner" | "novice" | "intermediate" | "advanced" | "pro";

export type SessionType =
  "open_play" | "beginner" | "intermediate" | "advanced" | "competitive" | "social" | "tournament";

// ── Directory ─────────────────────────────────────────────

export type CommunityStatus = "pending_review" | "active" | "suspended" | "rejected";
export type CommunityRole = "owner" | "admin" | "member";

/** One card in the club directory: a community or a venue. */
export interface ClubListing {
  type: OrganizerType;
  id: UUID;
  slug: string;
  name: string;
  tagline: string;
  city: string;
  province: string;
  logo_url: string | null;
  cover_url: string | null;
  status: CommunityStatus;
  member_count: number;
  /** Venues only. */
  court_count: number | null;
  upcoming_session_count: number;
  live_session_count: number;
  /** Communities: where they usually play. */
  home_venue: { id: UUID; slug: string; name: string } | null;
  /** Venues: whether community clubs and players can host open play on their courts. */
  accepts_community_sessions: boolean | null;
}

export interface MyClubStanding {
  membership: MemberSummary | null;
  /** Community role, or "staff" when the person works at the venue. */
  role: CommunityRole | "staff" | null;
  can_manage: boolean;
}

export interface ClubProfile extends ClubListing {
  description: string;
  rules: string;
  contact_email: string;
  contact_phone: string;
  join_policy: "open" | "approval";
  cancellation_hours: number;
  created_at: ISODateTime;
  plans: MembershipPlan[];
  /** Clubs only: the agreement members sign when they join. Empty for venues. */
  waiver: string;
  /** Clubs only: how members can pay for a paid plan. */
  payment_options: ClubPaymentOptions;
  me: MyClubStanding;
  stats: { sessions_held: number; players_hosted: number; games_played: number };
  /** Venues: the courts players can see. */
  courts: Array<{ id: UUID; name: string; indoor_outdoor: "indoor" | "outdoor" }>;
}

/** A club the signed-in player belongs to, or asked to join. */
export interface MyClub {
  club: ClubListing;
  membership: MemberSummary;
  /** Owner or admin of an active community club: can host sessions for it. */
  can_host: boolean;
}

// ── Membership ────────────────────────────────────────────

export interface MembershipPlan {
  id: UUID;
  organizer_type: OrganizerType;
  organizer_id: UUID;
  name: string;
  description: string;
  price: Money;
  currency: Currency;
  /** null means it never expires. */
  duration_days: number | null;
  /** Discount members get on session fees, 0–100. */
  session_discount_percent: number;
  /** What the plan includes, and what it doesn't (shown crossed out to compare plans). */
  perks: PlanPerk[];
  /** At most one plan per club is marked as recommended. */
  recommended: boolean;
  is_active: boolean;
}

export interface PlanPerk {
  text: string;
  included: boolean;
}

// ── Joining a club ────────────────────────────────────────

export type Gender = "female" | "male" | "other" | "prefer_not_to_say";
export type DominantHand = "right" | "left" | "both";
export type PlayFocus = "social" | "fitness" | "competitive" | "learning";
export type JoinPlayTime = "morning" | "midday" | "evening" | "weekends";

/** Typed or drawn: both are accepted. A drawn one is a PNG data URL until file storage exists. */
export type MemberSignature = { kind: "drawn"; image: string } | { kind: "typed"; name: string };

/** What a player fills in to join a club. Every field is required. */
export interface JoinApplication {
  full_name: string;
  email: string;
  phone: string;
  /** YYYY-MM-DD */
  birth_date: string;
  gender: Gender;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  skill_level: SkillLevel;
  dominant_hand: DominantHand;
  play_focus: PlayFocus;
  preferred_times: JoinPlayTime[];
  signature: MemberSignature;
  /** When they agreed to the club's waiver. */
  waiver_accepted_at: ISODateTime;
}

export type MembershipPayMethod = "in_person" | "gcash" | "maya";

export interface ClubPaymentOptions {
  /** Pay a club admin in person, recorded by them. */
  in_person: boolean;
  gcash: WalletAccount | null;
  maya: WalletAccount | null;
  /** Extra notes, for example "Send the exact amount." */
  instructions: string;
}

/**
 * Payment for a paid plan. A receipt upload never marks it paid by itself:
 * a club admin checks it and confirms, or turns it down with a reason.
 */
export interface MemberPayment {
  method: MembershipPayMethod;
  status: "awaiting_receipt" | "in_review" | "rejected" | "pay_in_person" | "confirmed";
  amount: Money;
  receipt_url: string | null;
  reference_number: string | null;
  submitted_at: ISODateTime | null;
  rejection_reason: string | null;
}

export interface JoinClubInput {
  plan_id: UUID | null;
  /** Clubs only. */
  application?: Omit<JoinApplication, "waiver_accepted_at"> & { accept_waiver: boolean };
  /** Needed when the plan isn't free. */
  payment_method?: MembershipPayMethod;
}

export interface MembershipReceiptInput {
  receipt: string;
  reference_number?: string;
}

export type MemberStatus = "pending" | "active" | "expired" | "suspended" | "rejected";

export interface MemberSummary {
  id: UUID;
  status: MemberStatus;
  role: CommunityRole;
  plan: { id: UUID; name: string } | null;
  starts_at: ISODateTime | null;
  expires_at: ISODateTime | null;
  /** Paid plans joined through the app. null for free plans and older memberships. */
  payment: MemberPayment | null;
}

export interface ClubMember extends MemberSummary {
  organizer_type: OrganizerType;
  organizer_id: UUID;
  player: { id: UUID; name: string; home_city: string | null; skill_level: SkillLevel };
  requested_at: ISODateTime;
  dues: { amount_due: Money; amount_paid: Money; status: "not_required" | "unpaid" | "paid" };
  sessions_attended: number;
  /** What they filled in when joining. Admins only. */
  application: JoinApplication | null;
}

export interface MemberEvent {
  id: UUID;
  event_type:
    | "requested"
    | "approved"
    | "rejected"
    | "suspended"
    | "reactivated"
    | "renewed"
    | "expired"
    | "role_changed"
    | "dues_paid"
    | "payment_submitted"
    | "payment_confirmed"
    | "payment_rejected";
  actor: PersonRef;
  reason: string | null;
  occurred_at: ISODateTime;
}

export interface ClubMemberDetail extends ClubMember {
  history: MemberEvent[];
}

// ── Open play ─────────────────────────────────────────────

export type SessionStatus =
  "pending_approval" | "published" | "live" | "completed" | "cancelled" | "rejected";

export interface OpenPlaySession {
  id: UUID;
  organizer: OrganizerRef;
  venue: { id: UUID; slug: string; name: string; city: string };
  host: PersonRef;
  title: string;
  description: string;
  session_type: SessionType;
  skill_level: SkillLevel;
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  registration_deadline: ISODateTime;
  courts: Array<{ id: UUID; name: string }>;
  capacity: number;
  registered_count: number;
  waitlist_count: number;
  checked_in_count: number;
  fee: Money;
  member_fee: Money;
  currency: Currency;
  members_only: boolean;
  status: SessionStatus;
  /** Set when the venue turned the session down or it was cancelled. */
  status_reason: string | null;
  /** Court rental the venue collects from the host for community sessions. */
  court_fee: Money;
  court_fee_paid: Money;
  my_registration: MyRegistration | null;
  /** True when the signed-in person can run this session (check-in, queue). */
  can_manage: boolean;
}

export type ParticipantStatus =
  "registered" | "waitlisted" | "checked_in" | "completed" | "cancelled" | "no_show";

export interface MyRegistration {
  id: UUID;
  status: ParticipantStatus;
  waitlist_position: number | null;
  fee_due: Money;
  fee_status: FeeStatus;
  /** Free cancellation ends here (organizer's cancellation hours before start). */
  cancel_until: ISODateTime;
}

export type FeeStatus = "free" | "unpaid" | "paid" | "refunded";

export interface SessionParticipant {
  id: UUID;
  player: { id: UUID; name: string; skill_level: SkillLevel };
  status: ParticipantStatus;
  /** In the live queue: waiting, on a court, or sitting out. */
  queue_state: "waiting" | "playing" | "resting" | null;
  waitlist_position: number | null;
  is_member: boolean;
  registered_at: ISODateTime;
  checked_in_at: ISODateTime | null;
  fee_due: Money;
  fee_paid: Money;
  fee_status: FeeStatus;
  games_played: number;
}

export interface QueueGame {
  id: UUID;
  court_id: UUID;
  started_at: ISODateTime;
  team_a: PersonRef[];
  team_b: PersonRef[];
  /** The match keeping score for this game, if someone is scoring it, and its called score. */
  match?: { id: UUID; called: string; status: string } | null;
}

export interface QueueState {
  session_id: UUID;
  /** Increments on every change, so screens can tell they're behind. */
  version: number;
  courts: Array<{ court_id: UUID; court_name: string; game: QueueGame | null }>;
  waiting: Array<{
    participant_id: UUID;
    player: PersonRef;
    position: number;
    games_played: number;
    waiting_since: ISODateTime;
  }>;
  resting: Array<{ participant_id: UUID; player: PersonRef; games_played: number }>;
  recent_games: Array<QueueGame & { ended_at: ISODateTime; winner: "a" | "b" | null }>;
}

export interface SessionDetail extends OpenPlaySession {
  /** Full list with fees. Only for people who run the session; empty for everyone else. */
  participants: SessionParticipant[];
  /** Who's coming, as players see it: names and status only. */
  roster: Array<{
    player: PersonRef;
    status: "registered" | "checked_in" | "waitlisted";
    waitlist_position: number | null;
  }>;
  /** Organizer's rule, shown before players register. */
  cancellation_hours: number;
}

// ── Payments ledger ───────────────────────────────────────

export type LedgerKind = "court_booking" | "session_fee" | "membership_dues" | "court_fee";

export interface LedgerEntry {
  id: UUID;
  kind: LedgerKind;
  description: string;
  payer: string;
  amount: Money;
  refunded: Money;
  currency: Currency;
  method: PaymentMethod;
  reference_number: string | null;
  received_by: PersonRef;
  received_at: ISODateTime;
}

export interface RevenueReport {
  from: string;
  to: string;
  currency: Currency;
  total: Money;
  refunds: Money;
  by_kind: Array<{ kind: LedgerKind; amount: Money; count: number }>;
  by_method: Array<{ method: PaymentMethod; amount: Money }>;
}

// ── Inputs ────────────────────────────────────────────────

export interface SessionInput {
  organizer_type: OrganizerType;
  organizer_id: UUID;
  venue_id: UUID;
  court_ids: UUID[];
  title: string;
  description: string;
  session_type: SessionType;
  skill_level: SkillLevel;
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  registration_deadline: ISODateTime;
  capacity: number;
  fee: Money;
  member_fee: Money;
  members_only: boolean;
}

export interface CommunityInput {
  name: string;
  tagline: string;
  description: string;
  city: string;
  province: string;
  home_venue_id: UUID | null;
  contact_email: string;
  contact_phone: string;
  rules: string;
  join_policy: "open" | "approval";
  cancellation_hours: number;
  logo_url: string | null;
  cover_url: string | null;
  waiver: string;
  payment_options: ClubPaymentOptions;
}

export interface PlanInput {
  name: string;
  description: string;
  price: Money;
  duration_days: number | null;
  session_discount_percent: number;
  perks: PlanPerk[];
  recommended: boolean;
  is_active: boolean;
}

export interface FeeRefundInput {
  amount: Money;
  reason: string;
}

export interface FeePaymentInput {
  amount: Money;
  method: PaymentMethod;
  reference_number?: string;
}
