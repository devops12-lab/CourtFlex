// Mock data and rules for clubs, members and open play (Phase 4).
// Venue clubs come from db.ts; community clubs, members, plans, sessions,
// registrations, the live queue and fee payments live here.

import { notify } from "./notify-db";
import { matches, stateOf } from "./match-db";
import type {
  ClubListing,
  ClubMember,
  ClubMemberDetail,
  ClubPaymentOptions,
  ClubProfile,
  CommunityRole,
  CommunityStatus,
  FeeStatus,
  JoinApplication,
  MemberEvent,
  MemberPayment,
  MemberStatus,
  MembershipPlan,
  MyRegistration,
  OpenPlaySession,
  OrganizerRef,
  OrganizerType,
  ParticipantStatus,
  PaymentMethod,
  Permission,
  PlanPerk,
  QueueState,
  SessionDetail,
  SessionStatus,
  SessionType,
  SkillLevel,
} from "@courtflex/api";
import { shiftDate, todayIn } from "@courtflex/api";
import {
  TZ,
  activeMembership,
  at,
  clubs,
  courts,
  nextId,
  person,
  priceFor,
  reservations,
  rolePermissions,
  users,
} from "./db";

const now = () => new Date().toISOString();
const DAY = 86_400_000;

// ── Players: skill levels and a bigger community ──────────

const extraPlayers: Array<[string, string, SkillLevel]> = [
  ["Marco Dela Cruz", "Mauban", "intermediate"],
  ["Trisha Lim", "Mauban", "beginner"],
  ["Jun Pascual", "Mauban", "advanced"],
  ["Nikki Salazar", "Sampaloc", "intermediate"],
  ["Ramon Aguilar", "Mauban", "novice"],
  ["Celine Tan", "Lucena", "intermediate"],
  ["Gab Ocampo", "Mauban", "advanced"],
  ["Ivy Manalo", "Tayabas", "beginner"],
  ["Paulo Rivera", "Lucena", "intermediate"],
  ["Mika Javier", "Mauban", "novice"],
  ["Dennis Yap", "Lucena", "advanced"],
  ["Aira Soriano", "Mauban", "intermediate"],
  ["Kevin Uy", "Lucban", "intermediate"],
  ["Lea Castro", "Mauban", "beginner"],
  ["Noel Abad", "Tayabas", "advanced"],
  ["Shane Robles", "Lucena", "novice"],
  ["Toni Bernardo", "Mauban", "intermediate"],
  ["Ella Fernandez", "Mauban", "beginner"],
];

extraPlayers.forEach(([name, city], i) => {
  const id = `u-0${20 + i}`;
  users.push({
    id,
    name,
    email: `${name.split(" ")[0]!.toLowerCase()}@example.test`,
    super_admin: false,
    has_player_profile: true,
    home_city: city,
    phone: `0918555${String(20 + i).padStart(4, "0")}`,
  });
});

export const skills: Record<string, SkillLevel> = {
  "u-002": "intermediate",
  "u-003": "intermediate",
  "u-004": "advanced",
  "u-005": "beginner",
  "u-006": "intermediate",
  "u-007": "advanced",
  "u-008": "intermediate",
  "u-009": "novice",
  "u-010": "advanced",
  "u-011": "beginner",
  "u-012": "novice",
  "u-013": "intermediate",
  "u-014": "beginner",
  ...Object.fromEntries(extraPlayers.map(([, , s], i) => [`u-0${20 + i}`, s])),
};
export const skillOf = (userId: string): SkillLevel => skills[userId] ?? "beginner";

// ── Community clubs ───────────────────────────────────────

export interface Community {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  rules: string;
  city: string;
  province: string;
  home_venue_id: string | null;
  contact_email: string;
  contact_phone: string;
  join_policy: "open" | "approval";
  cancellation_hours: number;
  logo_url: string | null;
  cover_url: string | null;
  /** The agreement members sign when they join. */
  waiver: string;
  payment_options: ClubPaymentOptions;
  status: CommunityStatus;
  created_by: string;
  created_at: string;
}

/** A starting waiver for new clubs. Admins edit it in Manage club. */
export const defaultWaiver = (name: string) =>
  `${name} membership agreement

1. Sportsmanship. Play fair, call your own lines honestly and respect other players, hosts and venue staff.
2. Court safety. Wear non-marking court shoes. Pickleball is a sport with a risk of injury; you play at your own risk and stop if you feel unwell.
3. Venue rules. Follow the rules of each venue the club plays at, including their hours and fees.
4. Fees. Membership fees pay for the period of your plan and aren't refunded once the period starts.
5. Photos. The club may post group photos from sessions. Tell an admin if you'd rather not appear.
6. Conduct. Admins can suspend members who break these rules, with a reason.`;

const inPersonOnly: ClubPaymentOptions = { in_person: true, gcash: null, maya: null, instructions: "" };

const communitySeeds: Array<Omit<Community, "waiver" | "payment_options">> = [
  {
    id: "com-1",
    slug: "tara-pikol-mauban",
    name: "Tara Pikol Mauban",
    tagline: "Friendly rallies after work, every level welcome.",
    description:
      "We started with six friends and one borrowed net. Now we fill two courts at Mauban Pickleball Courts most nights. Beginners get paired with a regular for their first games.",
    rules:
      "Paddle stack rotation, winners and losers both come off. Call your own lines. Be kind to first-timers.",
    city: "Mauban",
    province: "Quezon",
    home_venue_id: "c-001",
    contact_email: "tarapikol@example.test",
    contact_phone: "0917 800 1001",
    join_policy: "open",
    cancellation_hours: 3,
    logo_url: null,
    cover_url: null,
    status: "active",
    created_by: "u-003",
    created_at: "2026-08-02T10:00:00.000Z",
  },
  {
    id: "com-2",
    slug: "lucena-dinkers",
    name: "Lucena Dinkers",
    tagline: "Competitive doubles for intermediate and up.",
    description:
      "Weekly doubles for players who want harder games. New members play a check-in session first.",
    rules: "Intermediate and above. Show up 10 minutes early to warm up.",
    city: "Lucena",
    province: "Quezon",
    home_venue_id: "c-002",
    contact_email: "dinkers@example.test",
    contact_phone: "0917 800 1002",
    join_policy: "approval",
    cancellation_hours: 12,
    logo_url: null,
    cover_url: null,
    status: "active",
    created_by: "u-008",
    created_at: "2026-06-15T10:00:00.000Z",
  },
  {
    id: "com-3",
    slug: "tayabas-dink-society",
    name: "Tayabas Dink Society",
    tagline: "Saturday games and merienda after.",
    description: "A small group from Tayabas that travels to Lucena for Saturday games.",
    rules: "Bring a snack to share once a month.",
    city: "Tayabas",
    province: "Quezon",
    home_venue_id: "c-002",
    contact_email: "tayabas.dinks@example.test",
    contact_phone: "0917 800 1003",
    join_policy: "open",
    cancellation_hours: 6,
    logo_url: null,
    cover_url: null,
    status: "active",
    created_by: "u-010",
    created_at: "2026-09-20T10:00:00.000Z",
  },
  {
    id: "com-4",
    slug: "sunrise-paddle-circle",
    name: "Sunrise Paddle Circle",
    tagline: "Early games before work.",
    description: "6 AM games for people who want to play before the heat.",
    rules: "",
    city: "Mauban",
    province: "Quezon",
    home_venue_id: "c-001",
    contact_email: "sunrise@example.test",
    contact_phone: "0917 800 1004",
    join_policy: "open",
    cancellation_hours: 6,
    logo_url: null,
    cover_url: null,
    // New club waiting for CourtFlex review (Super Admin, Phase 6).
    status: "pending_review",
    created_by: "u-004",
    // Sent a few hours before the demo starts, so the review queue reads naturally.
    created_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  },
];

const seededPayments: Record<string, ClubPaymentOptions> = {
  "com-1": {
    in_person: true,
    gcash: { account_name: "Jamie Player", account_number: "09171234567", qr_url: null },
    maya: { account_name: "Jamie Player", account_number: "09181234567", qr_url: null },
    instructions:
      "Send the exact amount and keep the receipt. Paying in person? Hand it to Jamie or Paolo at any session.",
  },
  "com-2": {
    in_person: true,
    gcash: { account_name: "Carla Dizon", account_number: "09271234567", qr_url: null },
    maya: null,
    instructions: "",
  },
};

export const communities: Community[] = communitySeeds.map((c) => ({
  ...c,
  waiver: defaultWaiver(c.name),
  payment_options: seededPayments[c.id] ?? inPersonOnly,
}));

// ── Plans and members ─────────────────────────────────────

const planPerks: Record<string, PlanPerk[]> = {
  "pl-4": [
    { text: "Join any Tara Pikol session", included: true },
    { text: "Club group chat", included: true },
    { text: "Half price on sessions", included: false },
    { text: "Members-only nights", included: false },
  ],
  "pl-5": [
    { text: "Join any Tara Pikol session", included: true },
    { text: "Club group chat", included: true },
    { text: "Half price on sessions", included: true },
    { text: "Members-only nights", included: true },
  ],
  "pl-9": [
    { text: "Everything in Supporter", included: true },
    { text: "Twelve months for the price of ten", included: true },
    { text: "Tara Pikol club shirt", included: true },
    { text: "Vote on club decisions", included: true },
  ],
};

export const plans: MembershipPlan[] = [
  plan("pl-4", "community", "com-1", "Member", "Free. Join our sessions and group chat.", "0.00", null, 0),
  plan(
    "pl-5",
    "community",
    "com-1",
    "Supporter",
    "Half price on every Tara Pikol session.",
    "200.00",
    30,
    50,
  ),
  plan(
    "pl-9",
    "community",
    "com-1",
    "Founding Supporter",
    "A full year at half price, and a club shirt.",
    "2000.00",
    365,
    50,
  ),
  plan("pl-6", "community", "com-2", "Member", "30% off sessions. Renew monthly.", "150.00", 30, 30),
  plan("pl-7", "community", "com-3", "Member", "Free.", "0.00", null, 0),
  plan("pl-8", "community", "com-4", "Member", "Free.", "0.00", null, 0),
];

function plan(
  id: string,
  organizer_type: OrganizerType,
  organizer_id: string,
  name: string,
  description: string,
  price: string,
  duration_days: number | null,
  session_discount_percent: number,
): MembershipPlan {
  return {
    id,
    organizer_type,
    organizer_id,
    name,
    description,
    price,
    currency: "PHP",
    duration_days,
    session_discount_percent,
    perks: planPerks[id] ?? [],
    recommended: id === "pl-5",
    is_active: true,
  };
}

export interface MockMember {
  id: string;
  organizer_type: OrganizerType;
  organizer_id: string;
  player_id: string;
  role: CommunityRole;
  status: MemberStatus;
  plan_id: string | null;
  requested_at: string;
  starts_at: string | null;
  expires_at: string | null;
  dues_due: number;
  /** What they filled in when joining through the app. */
  application: JoinApplication | null;
  /** Paid plans joined through the app. */
  payment: MemberPayment | null;
}

export const members: MockMember[] = [];
export const memberEvents: Record<string, MemberEvent[]> = {};

function addMember(
  organizer_type: OrganizerType,
  organizer_id: string,
  player_id: string,
  opts: {
    role?: CommunityRole;
    status?: MemberStatus;
    plan?: string | null;
    daysAgo?: number;
    paid?: boolean;
  } = {},
) {
  const p = opts.plan ? plans.find((x) => x.id === opts.plan) : null;
  const started = new Date(Date.now() - (opts.daysAgo ?? 20) * DAY).toISOString();
  const status = opts.status ?? "active";
  const m: MockMember = {
    id: nextId("mem"),
    organizer_type,
    organizer_id,
    player_id,
    role: opts.role ?? "member",
    status,
    plan_id: p?.id ?? null,
    requested_at: started,
    starts_at: status === "pending" || status === "rejected" ? null : started,
    expires_at:
      status === "pending" || status === "rejected" || !p?.duration_days
        ? null
        : new Date(new Date(started).getTime() + p.duration_days * DAY).toISOString(),
    dues_due: Number(p?.price ?? 0),
    application: null,
    payment: null,
  };
  members.push(m);
  memberEvents[m.id] = [
    {
      id: nextId("mev"),
      event_type: "requested",
      actor: person(player_id),
      reason: null,
      occurred_at: started,
    },
  ];
  if (status !== "pending") {
    memberEvents[m.id]!.push({
      id: nextId("mev"),
      event_type: status === "rejected" ? "rejected" : "approved",
      actor: person(organizer_type === "venue" ? "u-002" : player_id),
      reason: null,
      occurred_at: started,
    });
  }
  if (opts.paid && m.dues_due > 0) {
    feePayments.push({
      id: nextId("fp"),
      kind: "membership_dues",
      organizer_type,
      organizer_id,
      ref_id: m.id,
      payer_id: player_id,
      amount: m.dues_due,
      method: "cash",
      reference_number: null,
      received_by: organizer_type === "venue" ? "u-005" : player_id,
      received_at: started,
      description: `${p!.name} dues`,
    });
  }
  return m;
}

// ── Fee payments (session fees, dues, court fees) ─────────

export interface FeePayment {
  id: string;
  kind: "session_fee" | "membership_dues" | "court_fee";
  /** Who received the money. */
  organizer_type: OrganizerType;
  organizer_id: string;
  /** Participant id, member id, or session id (court fee). */
  ref_id: string;
  payer_id: string;
  amount: number;
  method: PaymentMethod;
  reference_number: string | null;
  received_by: string;
  received_at: string;
  description: string;
}

export interface FeeRefund {
  id: string;
  payment_id: string;
  amount: number;
  reason: string;
  by: string;
  at: string;
}

export const feePayments: FeePayment[] = [];
export const feeRefunds: FeeRefund[] = [];

const paidFor = (refId: string, kind: FeePayment["kind"]) =>
  feePayments.filter((p) => p.ref_id === refId && p.kind === kind).reduce((s, p) => s + p.amount, 0);
const refundedFor = (refId: string, kind: FeePayment["kind"]) =>
  feeRefunds
    .filter((r) => feePayments.some((p) => p.id === r.payment_id && p.ref_id === refId && p.kind === kind))
    .reduce((s, r) => s + r.amount, 0);
export const refundedOfPayment = (paymentId: string) =>
  feeRefunds.filter((r) => r.payment_id === paymentId).reduce((s, r) => s + r.amount, 0);

// ── Organizers ────────────────────────────────────────────

export function organizerRef(type: OrganizerType, id: string): OrganizerRef {
  if (type === "venue") {
    const c = clubs.find((x) => x.id === id)!;
    return { type, id, slug: c.slug, name: c.name, logo_url: c.logo_url };
  }
  const c = communities.find((x) => x.id === id)!;
  return { type, id, slug: c.slug, name: c.name, logo_url: c.logo_url };
}

export const organizerExists = (type: OrganizerType, id: string) =>
  type === "venue" ? clubs.some((c) => c.id === id) : communities.some((c) => c.id === id);

export function joinPolicy(type: OrganizerType, id: string) {
  return type === "venue"
    ? clubs.find((c) => c.id === id)!.settings.member_join_policy
    : communities.find((c) => c.id === id)!.join_policy;
}

export function cancellationHours(type: OrganizerType, id: string) {
  return type === "venue"
    ? clubs.find((c) => c.id === id)!.settings.open_play_cancellation_hours
    : communities.find((c) => c.id === id)!.cancellation_hours;
}

/** Can this user run things for the organizer? Venue: club permission. Community: owner or admin. */
export function canManageOrganizer(
  userId: string | undefined,
  type: OrganizerType,
  id: string,
  venuePermission: Permission = "manageOpenPlay",
) {
  if (!userId) return false;
  // The Super Admin owns the whole system: they can manage any venue or club.
  if (users.find((u) => u.id === userId)?.super_admin) return true;
  if (type === "venue") {
    const m = activeMembership(id, userId);
    return !!m && rolePermissions[m.role_key].includes(venuePermission);
  }
  return members.some(
    (m) =>
      m.organizer_type === "community" &&
      m.organizer_id === id &&
      m.player_id === userId &&
      m.status === "active" &&
      (m.role === "owner" || m.role === "admin"),
  );
}

/** Membership status, with expiry applied as of now. */
export function effectiveStatus(m: MockMember): MemberStatus {
  if (m.status === "active" && m.expires_at && m.expires_at < now()) return "expired";
  return m.status;
}

export const memberOf = (type: OrganizerType, id: string, playerId: string) =>
  members.find((m) => m.organizer_type === type && m.organizer_id === id && m.player_id === playerId);

export const isActiveMember = (type: OrganizerType, id: string, playerId: string) => {
  const m = memberOf(type, id, playerId);
  return !!m && effectiveStatus(m) === "active";
};

export function memberView(m: MockMember): ClubMember {
  const u = users.find((x) => x.id === m.player_id)!;
  const p = plans.find((x) => x.id === m.plan_id);
  const paid = paidFor(m.id, "membership_dues");
  const attended = participants.filter(
    (pt) =>
      pt.player_id === m.player_id &&
      (pt.status === "checked_in" || pt.status === "completed") &&
      sessions.some(
        (s) =>
          s.id === pt.session_id &&
          s.organizer_type === m.organizer_type &&
          s.organizer_id === m.organizer_id,
      ),
  ).length;
  return {
    id: m.id,
    status: effectiveStatus(m),
    role: m.role,
    plan: p ? { id: p.id, name: p.name } : null,
    starts_at: m.starts_at,
    expires_at: m.expires_at,
    organizer_type: m.organizer_type,
    organizer_id: m.organizer_id,
    player: { id: u.id, name: u.name, home_city: u.home_city, skill_level: skillOf(u.id) },
    requested_at: m.requested_at,
    dues: {
      amount_due: m.dues_due.toFixed(2),
      amount_paid: paid.toFixed(2),
      status: m.dues_due <= 0 ? "not_required" : paid >= m.dues_due ? "paid" : "unpaid",
    },
    sessions_attended: attended,
    payment: m.payment,
    application: m.application,
  };
}

export function memberDetail(m: MockMember): ClubMemberDetail {
  return { ...memberView(m), history: [...(memberEvents[m.id] ?? [])].reverse() };
}

export function logMemberEvent(
  m: MockMember,
  event_type: MemberEvent["event_type"],
  actorId: string,
  reason: string | null = null,
) {
  (memberEvents[m.id] ??= []).push({
    id: nextId("mev"),
    event_type,
    actor: person(actorId),
    reason,
    occurred_at: now(),
  });
}

// ── Sessions ──────────────────────────────────────────────

export interface MockSession {
  id: string;
  organizer_type: OrganizerType;
  organizer_id: string;
  venue_id: string;
  host_id: string;
  title: string;
  description: string;
  session_type: SessionType;
  skill_level: SkillLevel;
  starts_at: string;
  ends_at: string;
  registration_deadline: string;
  court_ids: string[];
  capacity: number;
  fee: number;
  member_fee: number;
  members_only: boolean;
  status: "pending_approval" | "published" | "cancelled" | "rejected";
  status_reason: string | null;
  court_fee: number;
  created_at: string;
}

export interface MockParticipant {
  id: string;
  session_id: string;
  player_id: string;
  status: ParticipantStatus;
  waitlist_position: number | null;
  registered_at: string;
  checked_in_at: string | null;
  fee_due: number;
  is_member: boolean;
  games_played: number;
}

export interface MockQueue {
  version: number;
  /** Participant ids in line order, with when each joined the line. */
  waiting: Array<{ participant_id: string; since: string }>;
  resting: string[];
  games: Array<{
    id: string;
    court_id: string;
    team_a: string[];
    team_b: string[];
    started_at: string;
    ended_at: string | null;
    winner: "a" | "b" | null;
  }>;
}

export const sessions: MockSession[] = [];
export const participants: MockParticipant[] = [];
export const queues: Record<string, MockQueue> = {};

export function sessionStatus(s: MockSession): SessionStatus {
  if (s.status !== "published") return s.status;
  const t = now();
  if (t >= s.ends_at) return "completed";
  if (t >= s.starts_at) return "live";
  return "published";
}

export const activeParticipants = (sessionId: string) =>
  participants.filter(
    (p) => p.session_id === sessionId && ["registered", "checked_in", "completed"].includes(p.status),
  );

export const waitlisted = (sessionId: string) =>
  participants
    .filter((p) => p.session_id === sessionId && p.status === "waitlisted")
    .sort((a, b) => (a.waitlist_position ?? 0) - (b.waitlist_position ?? 0));

/** Renumber the waitlist 1..n after someone leaves or is promoted. */
export function renumberWaitlist(sessionId: string) {
  waitlisted(sessionId).forEach((p, i) => (p.waitlist_position = i + 1));
}

/** Fill open spots from the waitlist, in order. Runs inside the same "transaction" as the change that freed the spot. */
export function promoteFromWaitlist(s: MockSession) {
  const promoted: MockParticipant[] = [];
  while (activeParticipants(s.id).length < s.capacity) {
    const next = waitlisted(s.id)[0];
    if (!next) break;
    next.status = "registered";
    next.waitlist_position = null;
    next.fee_due = feeFor(s, next.player_id);
    next.is_member = isActiveMember(s.organizer_type, s.organizer_id, next.player_id);
    promoted.push(next);
    notify(
      next.player_id,
      "clubs",
      "waitlist_promoted",
      "You're in",
      `A spot opened in ${s.title}. You're registered; pay the fee when you check in.`,
      `/sessions/${s.id}`,
    );
  }
  renumberWaitlist(s.id);
  return promoted;
}

/** What a player pays: the member rate for active members of the organizer, else the full fee. */
export function feeFor(s: MockSession, playerId: string) {
  return isActiveMember(s.organizer_type, s.organizer_id, playerId) ? s.member_fee : s.fee;
}

export function feeStatus(p: MockParticipant): FeeStatus {
  const paid = paidFor(p.id, "session_fee");
  const refunded = refundedFor(p.id, "session_fee");
  if (paid > 0 && refunded >= paid) return "refunded";
  if (p.fee_due <= 0) return "free";
  return paid - refunded >= p.fee_due ? "paid" : "unpaid";
}

export const cancelUntil = (s: MockSession) =>
  new Date(
    new Date(s.starts_at).getTime() - cancellationHours(s.organizer_type, s.organizer_id) * 3_600_000,
  ).toISOString();

export function canManageSession(userId: string | undefined, s: MockSession) {
  if (!userId) return false;
  if (s.host_id === userId) return true;
  if (s.organizer_type === "venue")
    return canManageOrganizer(userId, "venue", s.organizer_id, "checkInOpenPlay");
  return canManageOrganizer(userId, "community", s.organizer_id);
}

export function sessionView(s: MockSession, viewerId: string | undefined): OpenPlaySession {
  const venue = clubs.find((c) => c.id === s.venue_id)!;
  const active = activeParticipants(s.id);
  const mine = viewerId
    ? participants.find((p) => p.session_id === s.id && p.player_id === viewerId && p.status !== "cancelled")
    : undefined;
  const my: MyRegistration | null = mine
    ? {
        id: mine.id,
        status: mine.status,
        waitlist_position: mine.waitlist_position,
        fee_due: mine.fee_due.toFixed(2),
        fee_status: feeStatus(mine),
        cancel_until: cancelUntil(s),
      }
    : null;
  return {
    id: s.id,
    organizer: organizerRef(s.organizer_type, s.organizer_id),
    venue: { id: venue.id, slug: venue.slug, name: venue.name, city: venue.city },
    host: person(s.host_id),
    title: s.title,
    description: s.description,
    session_type: s.session_type,
    skill_level: s.skill_level,
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    registration_deadline: s.registration_deadline,
    courts: s.court_ids.map((id) => ({ id, name: courts.find((c) => c.id === id)!.name })),
    capacity: s.capacity,
    registered_count: active.length,
    waitlist_count: waitlisted(s.id).length,
    checked_in_count: participants.filter(
      (p) => p.session_id === s.id && (p.status === "checked_in" || p.status === "completed"),
    ).length,
    fee: s.fee.toFixed(2),
    member_fee: s.member_fee.toFixed(2),
    currency: "PHP",
    members_only: s.members_only,
    status: sessionStatus(s),
    status_reason: s.status_reason,
    court_fee: s.court_fee.toFixed(2),
    court_fee_paid: paidFor(s.id, "court_fee").toFixed(2),
    my_registration: my,
    can_manage: canManageSession(viewerId, s),
  };
}

export function sessionDetail(s: MockSession, viewerId: string | undefined): SessionDetail {
  const base = sessionView(s, viewerId);
  const q = queues[s.id];
  const queueState = (p: MockParticipant) => {
    if (!q || p.status !== "checked_in") return null;
    if (q.games.some((g) => !g.ended_at && [...g.team_a, ...g.team_b].includes(p.id)))
      return "playing" as const;
    if (q.resting.includes(p.id)) return "resting" as const;
    return "waiting" as const;
  };
  const list = participants.filter((p) => p.session_id === s.id);
  return {
    ...base,
    cancellation_hours: cancellationHours(s.organizer_type, s.organizer_id),
    roster: list
      .filter((p) => p.status === "registered" || p.status === "checked_in" || p.status === "waitlisted")
      .sort(
        (a, b) =>
          (a.waitlist_position ?? 0) - (b.waitlist_position ?? 0) ||
          a.registered_at.localeCompare(b.registered_at),
      )
      .map((p) => ({
        player: person(p.player_id),
        status: p.status as "registered" | "checked_in" | "waitlisted",
        waitlist_position: p.waitlist_position,
      })),
    participants: base.can_manage
      ? list
          .sort((a, b) => a.registered_at.localeCompare(b.registered_at))
          .map((p) => {
            const paid = paidFor(p.id, "session_fee") - refundedFor(p.id, "session_fee");
            return {
              id: p.id,
              player: { id: p.player_id, name: person(p.player_id).name, skill_level: skillOf(p.player_id) },
              status: p.status,
              queue_state: queueState(p),
              waitlist_position: p.waitlist_position,
              is_member: p.is_member,
              registered_at: p.registered_at,
              checked_in_at: p.checked_in_at,
              fee_due: p.fee_due.toFixed(2),
              fee_paid: Math.max(paid, 0).toFixed(2),
              fee_status: feeStatus(p),
              games_played: p.games_played,
            };
          })
      : [],
  };
}

/** Keep the calendar label of a session's court reservations current. */
export function syncReservations(s: MockSession) {
  const count = activeParticipants(s.id).length;
  for (const r of reservations.filter((x) => x.session_id === s.id)) {
    r.label = `${s.title}, ${count} of ${s.capacity}`;
    if (s.status === "cancelled" || s.status === "rejected") r.status = "cancelled";
    else if (s.status === "pending_approval") r.status = "held";
    else r.status = s.ends_at < now() ? "completed" : "confirmed";
  }
}

export function reserveCourts(s: MockSession) {
  for (const court_id of s.court_ids) {
    reservations.push({
      id: nextId("res"),
      club_id: s.venue_id,
      court_id,
      reservation_type: "open_play",
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      status: "confirmed",
      label: "",
      session_id: s.id,
    });
  }
  syncReservations(s);
}

export function releaseCourts(s: MockSession) {
  for (let i = reservations.length - 1; i >= 0; i--) {
    if (reservations[i]!.session_id === s.id) reservations.splice(i, 1);
  }
}

export function courtFeeFor(s: Pick<MockSession, "organizer_type" | "court_ids" | "starts_at" | "ends_at">) {
  if (s.organizer_type === "venue") return 0;
  return s.court_ids.reduce(
    (sum, id) =>
      sum +
      priceFor(
        courts.find((c) => c.id === id)!,
        s.starts_at,
        s.ends_at,
      ),
    0,
  );
}

// ── Queue ─────────────────────────────────────────────────

export function queueView(s: MockSession): QueueState {
  const q = (queues[s.id] ??= { version: 0, waiting: [], resting: [], games: [] });
  const pRef = (pid: string) => person(participants.find((p) => p.id === pid)!.player_id);
  const games = (pid: string) => participants.find((p) => p.id === pid)!.games_played;
  return {
    session_id: s.id,
    version: q.version,
    courts: s.court_ids.map((court_id) => {
      const g = q.games.find((x) => x.court_id === court_id && !x.ended_at);
      return {
        court_id,
        court_name: courts.find((c) => c.id === court_id)!.name,
        game: g
          ? {
              id: g.id,
              court_id,
              started_at: g.started_at,
              team_a: g.team_a.map(pRef),
              team_b: g.team_b.map(pRef),
              match: matchFor(g.id),
            }
          : null,
      };
    }),
    waiting: q.waiting.map((w, i) => ({
      participant_id: w.participant_id,
      player: pRef(w.participant_id),
      position: i + 1,
      games_played: games(w.participant_id),
      waiting_since: w.since,
    })),
    resting: q.resting.map((pid) => ({ participant_id: pid, player: pRef(pid), games_played: games(pid) })),
    recent_games: q.games
      .filter((g) => g.ended_at)
      .sort((a, b) => b.ended_at!.localeCompare(a.ended_at!))
      .slice(0, 6)
      .map((g) => ({
        id: g.id,
        court_id: g.court_id,
        started_at: g.started_at,
        ended_at: g.ended_at!,
        winner: g.winner,
        team_a: g.team_a.map(pRef),
        team_b: g.team_b.map(pRef),
      })),
  };
}

/** Put four players on a court: [1st + 4th] vs [2nd + 3rd] keeps teams roughly even. */
export function startGame(s: MockSession, court_id: string, four: string[]) {
  const q = queues[s.id]!;
  q.waiting = q.waiting.filter((w) => !four.includes(w.participant_id));
  q.resting = q.resting.filter((pid) => !four.includes(pid));
  q.games.push({
    id: nextId("game"),
    court_id,
    team_a: [four[0]!, four[3]!],
    team_b: [four[1]!, four[2]!],
    started_at: now(),
    ended_at: null,
    winner: null,
  });
  q.version++;
}

export function removeFromQueue(s: MockSession, participantId: string) {
  const q = queues[s.id];
  if (!q) return;
  q.waiting = q.waiting.filter((w) => w.participant_id !== participantId);
  q.resting = q.resting.filter((pid) => pid !== participantId);
  q.version++;
}

// ── Directory views ───────────────────────────────────────

const upcomingFor = (type: OrganizerType, id: string) =>
  sessions.filter(
    (s) =>
      (type === "venue" ? s.venue_id === id : s.organizer_type === type && s.organizer_id === id) &&
      ["published", "live"].includes(sessionStatus(s)),
  );

const activeMemberCount = (type: OrganizerType, id: string) =>
  members.filter((m) => m.organizer_type === type && m.organizer_id === id && effectiveStatus(m) === "active")
    .length;

export function listing(type: OrganizerType, id: string): ClubListing {
  const up = upcomingFor(type, id);
  if (type === "venue") {
    const c = clubs.find((x) => x.id === id)!;
    return {
      type,
      id,
      slug: c.slug,
      name: c.name,
      tagline: c.tagline,
      city: c.city,
      province: c.province,
      logo_url: c.logo_url,
      cover_url: c.cover_url,
      status: c.status === "pending_review" ? "pending_review" : c.status,
      member_count: activeMemberCount(type, id),
      court_count: courts.filter((x) => x.club_id === id && x.status === "active").length,
      upcoming_session_count: up.length,
      live_session_count: up.filter((s) => sessionStatus(s) === "live").length,
      home_venue: null,
      accepts_community_sessions: c.settings.allow_player_open_play && !c.read_only,
    };
  }
  const c = communities.find((x) => x.id === id)!;
  const home = clubs.find((x) => x.id === c.home_venue_id);
  return {
    type,
    id,
    slug: c.slug,
    name: c.name,
    tagline: c.tagline,
    city: c.city,
    province: c.province,
    logo_url: c.logo_url,
    cover_url: c.cover_url,
    status: c.status,
    member_count: activeMemberCount(type, id),
    court_count: null,
    upcoming_session_count: up.length,
    live_session_count: up.filter((s) => sessionStatus(s) === "live").length,
    home_venue: home ? { id: home.id, slug: home.slug, name: home.name } : null,
    accepts_community_sessions: null,
  };
}

export function profile(type: OrganizerType, id: string, viewerId: string | undefined): ClubProfile {
  const base = listing(type, id);
  const mine = viewerId ? memberOf(type, id, viewerId) : undefined;
  const staff = type === "venue" && viewerId ? activeMembership(id, viewerId) : undefined;
  const past = sessions.filter(
    (s) =>
      (type === "venue" ? s.venue_id === id : s.organizer_type === type && s.organizer_id === id) &&
      sessionStatus(s) === "completed",
  );
  const pastPlayers = new Set(
    participants
      .filter((p) => past.some((s) => s.id === p.session_id) && p.status === "completed")
      .map((p) => p.player_id),
  );
  const games = past.reduce((n, s) => n + (queues[s.id]?.games.length ?? 0), 0);
  const community = type === "community" ? communities.find((x) => x.id === id) : undefined;
  const common = {
    plans: plans.filter((p) => p.organizer_type === type && p.organizer_id === id && p.is_active),
    // Only clubs take members, so only clubs have a waiver and payment accounts.
    waiver: community?.waiver ?? "",
    payment_options: community?.payment_options ?? { ...inPersonOnly, in_person: false },
    me: {
      membership: mine
        ? {
            id: mine.id,
            status: effectiveStatus(mine),
            role: mine.role,
            plan: (() => {
              const p = plans.find((x) => x.id === mine.plan_id);
              return p ? { id: p.id, name: p.name } : null;
            })(),
            starts_at: mine.starts_at,
            expires_at: mine.expires_at,
            payment: mine.payment,
          }
        : null,
      role: staff ? ("staff" as const) : mine && effectiveStatus(mine) !== "pending" ? mine.role : null,
      can_manage: canManageOrganizer(viewerId, type, id, "manageClubMembers"),
    },
    stats: { sessions_held: past.length, players_hosted: pastPlayers.size, games_played: games },
  };
  if (type === "venue") {
    const c = clubs.find((x) => x.id === id)!;
    return {
      ...base,
      ...common,
      description: c.description,
      rules: c.rules,
      contact_email: c.contact_email,
      contact_phone: c.contact_phone,
      join_policy: c.settings.member_join_policy,
      cancellation_hours: c.settings.open_play_cancellation_hours,
      created_at: "2026-03-01T00:00:00.000Z",
      courts: courts
        .filter((x) => x.club_id === id && x.status === "active")
        .map((x) => ({ id: x.id, name: x.name, indoor_outdoor: x.indoor_outdoor })),
    };
  }
  const c = communities.find((x) => x.id === id)!;
  return {
    ...base,
    ...common,
    description: c.description,
    rules: c.rules,
    contact_email: c.contact_email,
    contact_phone: c.contact_phone,
    join_policy: c.join_policy,
    cancellation_hours: c.cancellation_hours,
    created_at: c.created_at,
    courts: [],
  };
}

// ── Seed ──────────────────────────────────────────────────

function seedMembers() {
  // Tara Pikol: Jamie owns it, Andrea helps run it.
  addMember("community", "com-1", "u-003", { role: "owner", plan: "pl-4", daysAgo: 90 });
  addMember("community", "com-1", "u-006", { role: "admin", plan: "pl-5", daysAgo: 60, paid: true });
  [
    "u-009",
    "u-011",
    "u-020",
    "u-021",
    "u-022",
    "u-023",
    "u-024",
    "u-026",
    "u-029",
    "u-031",
    "u-033",
    "u-036",
    "u-037",
  ].forEach((id, i) =>
    addMember("community", "com-1", id, {
      plan: i % 4 === 0 ? "pl-5" : "pl-4",
      daysAgo: 10 + i,
      paid: i % 3 !== 0,
    }),
  );
  addMember("community", "com-1", "u-035", { status: "suspended", plan: "pl-4", daysAgo: 40 });
  addMember("community", "com-1", "u-025", { status: "pending", plan: "pl-4", daysAgo: 1 });
  const applicant = users.find(
    (u) =>
      Number(u.id.slice(2)) >= 20 &&
      u.has_player_profile &&
      !members.some((m) => m.organizer_id === "com-1" && m.player_id === u.id),
  );
  if (applicant) {
    const m = addMember("community", "com-1", applicant.id, { status: "pending", plan: "pl-5", daysAgo: 0 });
    const sent = new Date(Date.now() - 3 * 3_600_000).toISOString();
    m.application = {
      full_name: applicant.name,
      email: applicant.email,
      phone: applicant.phone ?? "09170000000",
      birth_date: "1994-06-12",
      gender: "prefer_not_to_say",
      emergency_contact_name: "Rosa Santos",
      emergency_contact_phone: "09179876543",
      skill_level: skillOf(applicant.id),
      dominant_hand: "right",
      play_focus: "social",
      preferred_times: ["evening", "weekends"],
      signature: { kind: "typed", name: applicant.name },
      waiver_accepted_at: sent,
    };
    m.payment = {
      method: "gcash",
      status: "in_review",
      amount: "200.00",
      receipt_url: sampleReceipt("200.00", "1029384756"),
      reference_number: "1029384756",
      submitted_at: sent,
      rejection_reason: null,
    };
    (memberEvents[m.id] ??= []).push({
      id: nextId("mev"),
      event_type: "payment_submitted",
      actor: person(applicant.id),
      reason: "GCash receipt, ref 1029384756",
      occurred_at: sent,
    });
  }

  // Lucena Dinkers: approval needed.
  addMember("community", "com-2", "u-008", { role: "owner", plan: "pl-6", daysAgo: 140, paid: true });
  ["u-004", "u-007", "u-022", "u-025", "u-028", "u-030", "u-032", "u-034"].forEach((id, i) =>
    addMember("community", "com-2", id, { plan: "pl-6", daysAgo: 5 + i * 3, paid: i % 2 === 0 }),
  );
  addMember("community", "com-2", "u-003", { status: "pending", plan: "pl-6", daysAgo: 0 });

  addMember("community", "com-3", "u-010", { role: "owner", plan: "pl-7", daysAgo: 45 });
  ["u-027", "u-034", "u-007", "u-028"].forEach((id) =>
    addMember("community", "com-3", id, { plan: "pl-7", daysAgo: 30 }),
  );

  addMember("community", "com-4", "u-004", { role: "owner", plan: "pl-8", daysAgo: 0 });
}

interface SeedSession {
  org: [OrganizerType, string];
  venue: string;
  host: string;
  title: string;
  description: string;
  type: SessionType;
  level: SkillLevel;
  start: string;
  end: string;
  courts: string[];
  capacity: number;
  fee: number;
  member_fee: number;
  members_only?: boolean;
  status?: MockSession["status"];
  players: string[];
  waitlist?: string[];
  checkedIn?: number;
  paid?: number;
}

function seedSessions() {
  const today = todayIn(TZ);
  // The live session runs around "now" whatever time the demo is opened.
  const liveStart = new Date(Math.floor(Date.now() / (30 * 60_000)) * 30 * 60_000 - 30 * 60_000);
  const liveEnd = new Date(liveStart.getTime() + 150 * 60_000);
  const d = (offset: number, hm: string) => at(shiftDate(today, offset), hm);

  const tara = [
    "u-003",
    "u-006",
    "u-009",
    "u-011",
    "u-020",
    "u-021",
    "u-022",
    "u-023",
    "u-024",
    "u-026",
    "u-029",
    "u-031",
    "u-033",
    "u-036",
  ];
  const seeds: SeedSession[] = [
    {
      org: ["community", "com-1"],
      venue: "c-001",
      host: "u-003",
      title: "Tara Pikol Night Rally",
      description: "Two courts, paddle stack rotation. All levels; beginners get paired with a regular.",
      type: "open_play",
      level: "all",
      start: liveStart.toISOString(),
      end: liveEnd.toISOString(),
      courts: ["court-008", "court-009"],
      capacity: 16,
      fee: 150,
      member_fee: 100,
      players: tara,
      checkedIn: 10,
      paid: 7,
    },
    {
      org: ["venue", "c-001"],
      venue: "c-001",
      host: "u-002",
      title: "Thursday Social Night",
      description: "Mixed doubles, music on, merienda at the break. Members pay less.",
      type: "social",
      level: "all",
      start: d(1, "18:00"),
      end: d(1, "21:00"),
      courts: ["court-008", "court-009"],
      capacity: 12,
      fee: 200,
      member_fee: 150,
      players: [
        "u-020",
        "u-021",
        "u-022",
        "u-023",
        "u-024",
        "u-026",
        "u-027",
        "u-028",
        "u-029",
        "u-030",
        "u-031",
        "u-032",
      ],
      waitlist: ["u-033", "u-034"],
    },
    {
      org: ["community", "com-1"],
      venue: "c-001",
      host: "u-006",
      title: "Beginner Clinic and Play",
      description: "30 minutes of basics, then easy games. Paddles available to borrow.",
      type: "beginner",
      level: "beginner",
      start: d(2, "08:00"),
      end: d(2, "10:00"),
      courts: ["court-008"],
      capacity: 8,
      fee: 100,
      member_fee: 50,
      players: ["u-021", "u-033", "u-037"],
    },
    {
      org: ["community", "com-2"],
      venue: "c-002",
      host: "u-008",
      title: "Dinkers Doubles Ladder",
      description: "Competitive doubles. Winners move up a court.",
      type: "competitive",
      level: "intermediate",
      start: d(1, "06:00"),
      end: d(1, "08:00"),
      courts: ["court-003"],
      capacity: 8,
      fee: 120,
      member_fee: 84,
      players: ["u-008", "u-004", "u-007", "u-022", "u-025"],
    },
    {
      org: ["community", "com-2"],
      venue: "c-001",
      host: "u-008",
      title: "Dinkers Away Day at Mauban",
      description: "Lucena Dinkers visit Mauban. Guests welcome.",
      type: "intermediate",
      level: "intermediate",
      start: d(3, "18:00"),
      end: d(3, "20:00"),
      courts: ["court-009"],
      capacity: 8,
      fee: 150,
      member_fee: 105,
      status: "pending_approval",
      players: ["u-008"],
    },
    {
      org: ["community", "com-3"],
      venue: "c-002",
      host: "u-010",
      title: "Saturday Advanced Games",
      description: "Fast games for advanced players.",
      type: "advanced",
      level: "advanced",
      start: d(2, "16:00"),
      end: d(2, "18:00"),
      courts: ["court-005"],
      capacity: 8,
      fee: 100,
      member_fee: 100,
      players: ["u-010", "u-027", "u-034", "u-007", "u-028", "u-004", "u-032", "u-022"],
      waitlist: ["u-030"],
    },
    {
      org: ["community", "com-1"],
      venue: "c-001",
      host: "u-003",
      title: "Members Night",
      description: "Free for Tara Pikol members. Bring a friend next time.",
      type: "open_play",
      level: "all",
      start: d(5, "19:00"),
      end: d(5, "21:00"),
      courts: ["court-008", "court-009"],
      capacity: 16,
      fee: 0,
      member_fee: 0,
      members_only: true,
      players: ["u-003", "u-006", "u-020"],
    },
    {
      org: ["community", "com-1"],
      venue: "c-001",
      host: "u-003",
      title: "Tara Pikol Sunday Session",
      description: "Last Sunday's games.",
      type: "open_play",
      level: "all",
      start: d(-3, "16:00"),
      end: d(-3, "18:00"),
      courts: ["court-008", "court-009"],
      capacity: 16,
      fee: 150,
      member_fee: 100,
      players: tara.slice(0, 12),
      checkedIn: 12,
      paid: 12,
    },
  ];

  for (const seed of seeds) {
    const s: MockSession = {
      id: nextId("op"),
      organizer_type: seed.org[0],
      organizer_id: seed.org[1],
      venue_id: seed.venue,
      host_id: seed.host,
      title: seed.title,
      description: seed.description,
      session_type: seed.type,
      skill_level: seed.level,
      starts_at: seed.start,
      ends_at: seed.end,
      registration_deadline: new Date(new Date(seed.start).getTime() - 60 * 60_000).toISOString(),
      court_ids: seed.courts,
      capacity: seed.capacity,
      fee: seed.fee,
      member_fee: seed.member_fee,
      members_only: !!seed.members_only,
      status: seed.status ?? "published",
      status_reason: null,
      court_fee: 0,
      created_at: new Date(new Date(seed.start).getTime() - 5 * DAY).toISOString(),
    };
    s.court_fee = courtFeeFor(s);
    sessions.push(s);
    const ended = s.ends_at < now();

    seed.players.forEach((pid, i) => {
      const p: MockParticipant = {
        id: nextId("pt"),
        session_id: s.id,
        player_id: pid,
        status: "registered",
        waitlist_position: null,
        registered_at: new Date(new Date(s.created_at).getTime() + i * 3_600_000).toISOString(),
        checked_in_at: null,
        fee_due: feeFor(s, pid),
        is_member: isActiveMember(s.organizer_type, s.organizer_id, pid),
        games_played: 0,
      };
      if (i < (seed.checkedIn ?? 0)) {
        p.status = ended ? "completed" : "checked_in";
        p.checked_in_at = new Date(new Date(s.starts_at).getTime() - 10 * 60_000 + i * 60_000).toISOString();
      } else if (ended) {
        p.status = "no_show";
      }
      participants.push(p);
      if (i < (seed.paid ?? 0) && p.fee_due > 0) {
        feePayments.push({
          id: nextId("fp"),
          kind: "session_fee",
          organizer_type: s.organizer_type,
          organizer_id: s.organizer_id,
          ref_id: p.id,
          payer_id: pid,
          amount: p.fee_due,
          method: i % 3 === 0 ? "gcash_at_venue" : "cash",
          reference_number: i % 3 === 0 ? `7731 55${String(i).padStart(2, "0")} 100` : null,
          received_by: s.host_id,
          received_at: p.checked_in_at ?? s.starts_at,
          description: `${s.title} fee`,
        });
      }
    });
    (seed.waitlist ?? []).forEach((pid, i) =>
      participants.push({
        id: nextId("pt"),
        session_id: s.id,
        player_id: pid,
        status: "waitlisted",
        waitlist_position: i + 1,
        registered_at: new Date(new Date(s.created_at).getTime() + (20 + i) * 3_600_000).toISOString(),
        checked_in_at: null,
        fee_due: 0,
        is_member: isActiveMember(s.organizer_type, s.organizer_id, pid),
        games_played: 0,
      }),
    );

    // Queue for the live and past sessions: two games on court, the rest in line.
    if (seed.checkedIn) {
      const checked = participants.filter(
        (p) => p.session_id === s.id && (p.status === "checked_in" || p.status === "completed"),
      );
      const q: MockQueue = { version: 1, waiting: [], resting: [], games: [] };
      queues[s.id] = q;
      if (ended) {
        for (let g = 0; g < 9; g++) {
          const four = [0, 1, 2, 3].map((k) => checked[(g * 4 + k) % checked.length]!.id);
          q.games.push({
            id: nextId("game"),
            court_id: s.court_ids[g % 2]!,
            team_a: [four[0]!, four[3]!],
            team_b: [four[1]!, four[2]!],
            started_at: new Date(new Date(s.starts_at).getTime() + g * 12 * 60_000).toISOString(),
            ended_at: new Date(new Date(s.starts_at).getTime() + (g + 1) * 12 * 60_000).toISOString(),
            winner: g % 2 ? "a" : "b",
          });
          four.forEach((pid) => participants.find((p) => p.id === pid)!.games_played++);
        }
      } else {
        // Two finished games, two on court now, two players waiting.
        const ids = checked.map((p) => p.id);
        for (let g = 0; g < 2; g++) {
          const four = ids.slice(g * 4, g * 4 + 4);
          q.games.push({
            id: nextId("game"),
            court_id: s.court_ids[g]!,
            team_a: [four[0]!, four[3]!],
            team_b: [four[1]!, four[2]!],
            started_at: new Date(Date.now() - 30 * 60_000).toISOString(),
            ended_at: new Date(Date.now() - 16 * 60_000).toISOString(),
            winner: g ? "b" : "a",
          });
          four.forEach((pid) => participants.find((p) => p.id === pid)!.games_played++);
        }
        const order = [...ids.slice(8), ...ids.slice(0, 8)];
        q.games.push(
          {
            id: nextId("game"),
            court_id: s.court_ids[0]!,
            team_a: [order[0]!, order[3]!],
            team_b: [order[1]!, order[2]!],
            started_at: new Date(Date.now() - 9 * 60_000).toISOString(),
            ended_at: null,
            winner: null,
          },
          {
            id: nextId("game"),
            court_id: s.court_ids[1]!,
            team_a: [order[4]!, order[7]!],
            team_b: [order[5]!, order[6]!],
            started_at: new Date(Date.now() - 4 * 60_000).toISOString(),
            ended_at: null,
            winner: null,
          },
        );
        q.waiting = order.slice(8).map((pid, i) => ({
          participant_id: pid,
          since: new Date(Date.now() - (6 - i) * 60_000).toISOString(),
        }));
      }
    }
    reserveCourts(s);
    if (s.status === "pending_approval") syncReservations(s);
  }

  // A court fee the venue already collected from Tara Pikol for last Sunday.
  const sunday = sessions.find((s) => s.title === "Tara Pikol Sunday Session")!;
  feePayments.push({
    id: nextId("fp"),
    kind: "court_fee",
    organizer_type: "venue",
    organizer_id: "c-001",
    ref_id: sunday.id,
    payer_id: "u-003",
    amount: sunday.court_fee,
    method: "cash",
    reference_number: null,
    received_by: "u-005",
    received_at: sunday.ends_at,
    description: `Court fee: ${sunday.title}`,
  });
}

seedMembers();
seedSessions();

export const courtFeePaid = (sessionId: string) => paidFor(sessionId, "court_fee");
export { paidFor, refundedFor };

/** A stand-in GCash receipt image for the sample data (SVG data URL). */
function sampleReceipt(amount: string, ref: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="520" viewBox="0 0 360 520"><rect width="360" height="520" fill="#f4f7fb"/><rect width="360" height="96" fill="#0a5bd8"/><text x="24" y="58" font-family="Arial" font-size="26" font-weight="700" fill="#fff">GCash</text><text x="24" y="150" font-family="Arial" font-size="16" fill="#444">Sent via GCash</text><text x="24" y="196" font-family="Arial" font-size="34" font-weight="700" fill="#111">PHP ${amount}</text><text x="24" y="250" font-family="Arial" font-size="15" fill="#444">To: Jamie Player</text><text x="24" y="278" font-family="Arial" font-size="15" fill="#444">0917 123 4567</text><text x="24" y="330" font-family="Arial" font-size="15" fill="#444">Ref No. ${ref}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/** The match scoring a queue game, if any (Phase 5: "Score this game" on the queue board). */
function matchFor(gameId: string) {
  const m = matches.find((x) => x.queue_game_id === gameId && x.status !== "voided");
  return m ? { id: m.id, called: stateOf(m).called, status: m.status } : null;
}
