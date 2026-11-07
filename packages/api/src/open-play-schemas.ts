import { z } from "zod";
import type {
  ClubListing,
  ClubMember,
  ClubMemberDetail,
  ClubProfile,
  LedgerEntry,
  MembershipPlan,
  OpenPlaySession,
  QueueState,
  RevenueReport,
  SessionDetail,
} from "./open-play-types";

const money = z.string().regex(/^-?\d+\.\d{2}$/);
const iso = z.iso.datetime({ offset: true });
const currency = z.literal("PHP");
const person = z.object({ id: z.string(), name: z.string() });
const organizerType = z.enum(["venue", "community"]);
const skill = z.enum(["all", "beginner", "novice", "intermediate", "advanced", "pro"]);
const communityRole = z.enum(["owner", "admin", "member"]);
const method = z.enum(["cash", "gcash_at_venue", "maya_at_venue", "card_at_venue", "other"]);
const feeStatus = z.enum(["free", "unpaid", "paid", "refunded"]);
const participantStatus = z.enum([
  "registered",
  "waitlisted",
  "checked_in",
  "completed",
  "cancelled",
  "no_show",
]);

export const planSchema: z.ZodType<MembershipPlan> = z.object({
  id: z.string(),
  organizer_type: organizerType,
  organizer_id: z.string(),
  name: z.string(),
  description: z.string(),
  price: money,
  currency,
  duration_days: z.number().int().positive().nullable(),
  session_discount_percent: z.number().min(0).max(100),
  perks: z.array(z.object({ text: z.string(), included: z.boolean() })),
  recommended: z.boolean(),
  is_active: z.boolean(),
});

const wallet = z.object({
  account_name: z.string(),
  account_number: z.string(),
  qr_url: z.string().nullable(),
});

const memberPayment = z.object({
  method: z.enum(["in_person", "gcash", "maya"]),
  status: z.enum(["awaiting_receipt", "in_review", "rejected", "pay_in_person", "confirmed"]),
  amount: money,
  receipt_url: z.string().nullable(),
  reference_number: z.string().nullable(),
  submitted_at: iso.nullable(),
  rejection_reason: z.string().nullable(),
});

const joinApplication = z.object({
  full_name: z.string(),
  email: z.string(),
  phone: z.string(),
  birth_date: z.string(),
  gender: z.enum(["female", "male", "other", "prefer_not_to_say"]),
  emergency_contact_name: z.string(),
  emergency_contact_phone: z.string(),
  skill_level: skill,
  dominant_hand: z.enum(["right", "left", "both"]),
  play_focus: z.enum(["social", "fitness", "competitive", "learning"]),
  preferred_times: z.array(z.enum(["morning", "midday", "evening", "weekends"])),
  signature: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("drawn"), image: z.string() }),
    z.object({ kind: z.literal("typed"), name: z.string() }),
  ]),
  waiver_accepted_at: iso,
});

export const memberSummarySchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "active", "expired", "suspended", "rejected"]),
  role: communityRole,
  plan: z.object({ id: z.string(), name: z.string() }).nullable(),
  starts_at: iso.nullable(),
  expires_at: iso.nullable(),
  payment: memberPayment.nullable(),
});

const listingShape = {
  type: organizerType,
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  tagline: z.string(),
  city: z.string(),
  province: z.string(),
  logo_url: z.string().nullable(),
  cover_url: z.string().nullable(),
  status: z.enum(["pending_review", "active", "suspended", "rejected"]),
  member_count: z.number().int().nonnegative(),
  court_count: z.number().int().nonnegative().nullable(),
  upcoming_session_count: z.number().int().nonnegative(),
  live_session_count: z.number().int().nonnegative(),
  home_venue: z.object({ id: z.string(), slug: z.string(), name: z.string() }).nullable(),
  accepts_community_sessions: z.boolean().nullable(),
};

export const clubListingSchema: z.ZodType<ClubListing> = z.object(listingShape);

export const clubProfileSchema: z.ZodType<ClubProfile> = z.object({
  ...listingShape,
  description: z.string(),
  rules: z.string(),
  contact_email: z.string(),
  contact_phone: z.string(),
  join_policy: z.enum(["open", "approval"]),
  cancellation_hours: z.number().int().nonnegative(),
  created_at: iso,
  plans: z.array(planSchema),
  waiver: z.string(),
  payment_options: z.object({
    in_person: z.boolean(),
    gcash: wallet.nullable(),
    maya: wallet.nullable(),
    instructions: z.string(),
  }),
  me: z.object({
    membership: memberSummarySchema.nullable(),
    role: z.union([communityRole, z.literal("staff")]).nullable(),
    can_manage: z.boolean(),
  }),
  stats: z.object({
    sessions_held: z.number().int(),
    players_hosted: z.number().int(),
    games_played: z.number().int(),
  }),
  courts: z.array(
    z.object({ id: z.string(), name: z.string(), indoor_outdoor: z.enum(["indoor", "outdoor"]) }),
  ),
});

const memberShape = {
  ...memberSummarySchema.shape,
  organizer_type: organizerType,
  organizer_id: z.string(),
  player: z.object({
    id: z.string(),
    name: z.string(),
    home_city: z.string().nullable(),
    skill_level: skill,
  }),
  requested_at: iso,
  dues: z.object({
    amount_due: money,
    amount_paid: money,
    status: z.enum(["not_required", "unpaid", "paid"]),
  }),
  sessions_attended: z.number().int().nonnegative(),
  application: joinApplication.nullable(),
};

export const clubMemberSchema: z.ZodType<ClubMember> = z.object(memberShape);

export const clubMemberDetailSchema: z.ZodType<ClubMemberDetail> = z.object({
  ...memberShape,
  history: z.array(
    z.object({
      id: z.string(),
      event_type: z.enum([
        "requested",
        "approved",
        "rejected",
        "suspended",
        "reactivated",
        "renewed",
        "expired",
        "role_changed",
        "payment_submitted",
        "payment_confirmed",
        "payment_rejected",
        "dues_paid",
      ]),
      actor: person,
      reason: z.string().nullable(),
      occurred_at: iso,
    }),
  ),
});

const sessionShape = {
  id: z.string(),
  organizer: z.object({
    type: organizerType,
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    logo_url: z.string().nullable(),
  }),
  venue: z.object({ id: z.string(), slug: z.string(), name: z.string(), city: z.string() }),
  host: person,
  title: z.string(),
  description: z.string(),
  session_type: z.enum([
    "open_play",
    "beginner",
    "intermediate",
    "advanced",
    "competitive",
    "social",
    "tournament",
  ]),
  skill_level: skill,
  starts_at: iso,
  ends_at: iso,
  registration_deadline: iso,
  courts: z.array(z.object({ id: z.string(), name: z.string() })),
  capacity: z.number().int().positive(),
  registered_count: z.number().int().nonnegative(),
  waitlist_count: z.number().int().nonnegative(),
  checked_in_count: z.number().int().nonnegative(),
  fee: money,
  member_fee: money,
  currency,
  members_only: z.boolean(),
  status: z.enum(["pending_approval", "published", "live", "completed", "cancelled", "rejected"]),
  status_reason: z.string().nullable(),
  court_fee: money,
  court_fee_paid: money,
  my_registration: z
    .object({
      id: z.string(),
      status: participantStatus,
      waitlist_position: z.number().int().positive().nullable(),
      fee_due: money,
      fee_status: feeStatus,
      cancel_until: iso,
    })
    .nullable(),
  can_manage: z.boolean(),
};

export const sessionSchema: z.ZodType<OpenPlaySession> = z.object(sessionShape);

export const sessionDetailSchema: z.ZodType<SessionDetail> = z.object({
  ...sessionShape,
  cancellation_hours: z.number().int().nonnegative(),
  roster: z.array(
    z.object({
      player: person,
      status: z.enum(["registered", "checked_in", "waitlisted"]),
      waitlist_position: z.number().int().positive().nullable(),
    }),
  ),
  participants: z.array(
    z.object({
      id: z.string(),
      player: z.object({ id: z.string(), name: z.string(), skill_level: skill }),
      status: participantStatus,
      queue_state: z.enum(["waiting", "playing", "resting"]).nullable(),
      waitlist_position: z.number().int().positive().nullable(),
      is_member: z.boolean(),
      registered_at: iso,
      checked_in_at: iso.nullable(),
      fee_due: money,
      fee_paid: money,
      fee_status: feeStatus,
      games_played: z.number().int().nonnegative(),
    }),
  ),
});

const game = z.object({
  id: z.string(),
  court_id: z.string(),
  started_at: iso,
  team_a: z.array(person),
  team_b: z.array(person),
  match: z.object({ id: z.string(), called: z.string(), status: z.string() }).nullish(),
});

export const queueSchema: z.ZodType<QueueState> = z.object({
  session_id: z.string(),
  version: z.number().int().nonnegative(),
  courts: z.array(z.object({ court_id: z.string(), court_name: z.string(), game: game.nullable() })),
  waiting: z.array(
    z.object({
      participant_id: z.string(),
      player: person,
      position: z.number().int().positive(),
      games_played: z.number().int().nonnegative(),
      waiting_since: iso,
    }),
  ),
  resting: z.array(z.object({ participant_id: z.string(), player: person, games_played: z.number().int() })),
  recent_games: z.array(game.extend({ ended_at: iso, winner: z.enum(["a", "b"]).nullable() })),
});

export const ledgerEntrySchema: z.ZodType<LedgerEntry> = z.object({
  id: z.string(),
  kind: z.enum(["court_booking", "session_fee", "membership_dues", "court_fee"]),
  description: z.string(),
  payer: z.string(),
  amount: money,
  refunded: money,
  currency,
  method,
  reference_number: z.string().nullable(),
  received_by: person,
  received_at: iso,
});

export const revenueSchema: z.ZodType<RevenueReport> = z.object({
  from: z.string(),
  to: z.string(),
  currency,
  total: money,
  refunds: money,
  by_kind: z.array(
    z.object({
      kind: z.enum(["court_booking", "session_fee", "membership_dues", "court_fee"]),
      amount: money,
      count: z.number().int(),
    }),
  ),
  by_method: z.array(z.object({ method, amount: money })),
});
