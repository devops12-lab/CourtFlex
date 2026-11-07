import type {
  DominantHand,
  Gender,
  JoinPlayTime,
  LedgerKind,
  MemberPayment,
  MembershipPayMethod,
  PlayFocus,
  MemberStatus,
  ParticipantStatus,
  SessionStatus,
  SessionType,
  SkillLevel,
} from "@courtflex/api";

export const sessionTypeLabels: Record<SessionType, string> = {
  open_play: "Open play",
  beginner: "Beginner session",
  intermediate: "Intermediate session",
  advanced: "Advanced session",
  competitive: "Competitive play",
  social: "Social play",
  tournament: "Tournament",
};

export const skillLabels: Record<SkillLevel, string> = {
  all: "All levels",
  beginner: "Beginner",
  novice: "Novice",
  intermediate: "Intermediate",
  advanced: "Advanced",
  pro: "Pro",
};

export const sessionStatusLabels: Record<SessionStatus, string> = {
  pending_approval: "Waiting for venue approval",
  published: "Upcoming",
  live: "Live now",
  completed: "Finished",
  cancelled: "Cancelled",
  rejected: "Turned down by the venue",
};

export const participantStatusLabels: Record<ParticipantStatus, string> = {
  registered: "Registered",
  waitlisted: "Waitlist",
  checked_in: "Checked in",
  completed: "Played",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export const memberStatusLabels: Record<MemberStatus, string> = {
  pending: "Waiting for approval",
  active: "Active",
  expired: "Expired",
  suspended: "Suspended",
  rejected: "Turned down",
};

export const ledgerKindLabels: Record<LedgerKind, string> = {
  court_booking: "Court bookings",
  session_fee: "Open play fees",
  membership_dues: "Membership dues",
  court_fee: "Court fees from clubs",
};

export function durationLabel(days: number | null) {
  if (days === null) return "No expiry";
  if (days === 365) return "12 months";
  return `${Math.round(days / 30)} ${days === 30 ? "month" : "months"}`;
}

export function pesos(amount: string | number) {
  const n = Number(amount);
  return n === 0
    ? "Free"
    : `₱${n.toLocaleString("en-PH", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2 })}`;
}

/** "Wed, Nov 4" in the club's timezone. */
export function shortDay(iso: string, timeZone = "Asia/Manila") {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(iso));
}

// ── Joining a club ────────────────────────────────────────

/** Rating ranges shown on the join form's level cards (DUPR-style). */
export const skillRatings: Record<Exclude<SkillLevel, "all">, { rating: string; about: string }> = {
  beginner: { rating: "2.0–2.5", about: "Learning the kitchen rule, serves and scoring." },
  novice: { rating: "2.5–3.0", about: "Keeps a rally going and starting to dink." },
  intermediate: { rating: "3.0–3.5", about: "Steady dinks, third-shot drops, good court position." },
  advanced: { rating: "3.5–4.5", about: "Fast hands, resets, placement and spin." },
  pro: { rating: "4.5 and up", about: "Tournament player. Power, resets and attacking dinks." },
};

export const genderLabels: Record<Gender, string> = {
  female: "Female",
  male: "Male",
  other: "Another gender",
  prefer_not_to_say: "Prefer not to say",
};

export const handLabels: Record<DominantHand, string> = {
  right: "Right-handed",
  left: "Left-handed",
  both: "Both hands",
};

export const focusLabels: Record<PlayFocus, string> = {
  social: "Social games and open play",
  fitness: "Fitness",
  competitive: "Competitive play and leagues",
  learning: "Learning and drills",
};

export const joinTimeLabels: Record<JoinPlayTime, string> = {
  morning: "Mornings (6–11 AM)",
  midday: "Midday (11 AM–4 PM)",
  evening: "Evenings (4–10 PM)",
  weekends: "Weekends",
};

export const payMethodLabels: Record<MembershipPayMethod, string> = {
  in_person: "Pay in person",
  gcash: "GCash",
  maya: "Maya",
};

export const memberPaymentLabels: Record<MemberPayment["status"], string> = {
  awaiting_receipt: "Waiting for receipt",
  in_review: "Receipt to check",
  rejected: "Receipt turned down",
  pay_in_person: "Paying in person",
  confirmed: "Paid",
};
