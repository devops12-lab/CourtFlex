// Endpoints for clubs (venue and community), members, plans, open play
// sessions, registration, the live queue and payments (Phase 4).
import { notify } from "./notify-db";
import { decide } from "./handlers-admin";
import { http } from "msw";
import type {
  ClubPaymentOptions,
  CommunityInput,
  FeePaymentInput,
  FeeRefundInput,
  JoinClubInput,
  LedgerEntry,
  LedgerKind,
  MembershipPayMethod,
  MembershipReceiptInput,
  OrganizerType,
  PaymentMethod,
  PlanInput,
  RevenueReport,
  SessionInput,
  SkillLevel,
  WalletAccount,
} from "@courtflex/api";
import { formatTimeRange, todayIn } from "@courtflex/api";
import {
  TZ,
  activeMembership,
  adjustments,
  bookings,
  clubs,
  courts,
  nextId,
  payments,
  person,
  priceFor,
  reservations,
  unbookableReason,
  users,
} from "./db";
import {
  activeParticipants,
  cancelUntil,
  canManageOrganizer,
  canManageSession,
  communities,
  courtFeeFor,
  courtFeePaid,
  effectiveStatus,
  feeFor,
  feePayments,
  feeRefunds,
  isActiveMember,
  listing,
  logMemberEvent,
  memberDetail,
  memberOf,
  memberView,
  members,
  organizerExists,
  paidFor,
  participants,
  plans,
  profile,
  promoteFromWaitlist,
  queueView,
  queues,
  refundedFor,
  refundedOfPayment,
  releaseCourts,
  removeFromQueue,
  renumberWaitlist,
  reserveCourts,
  sessionDetail,
  sessionStatus,
  sessionView,
  sessions,
  startGame,
  syncReservations,
  waitlisted,
  type Community,
  type MockMember,
  type MockSession,
} from "./open-play-db";
import { API, fail, invalid, latency, noContent, ok, sessionUser } from "./http-helpers";

const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const METHODS: PaymentMethod[] = ["cash", "gcash_at_venue", "maya_at_venue", "card_at_venue", "other"];
const isoNow = () => new Date().toISOString();
const peso = (n: number) => `₱${n.toFixed(2).replace(/\.00$/, "")}`;

function signedIn() {
  const user = sessionUser();
  return user
    ? { user, error: null }
    : { user: null, error: fail(401, "Your session has ended. Sign in again.") };
}

function orgParam(params: Record<string, unknown>) {
  const type = String(params.type) as OrganizerType;
  const id = String(params.id);
  if (!["venue", "community"].includes(type) || !organizerExists(type, id)) return null;
  return { type, id };
}

/** Venue changes are refused while its subscription has ended; communities aren't tenants. */
function organizerReadOnly(type: OrganizerType, id: string) {
  return type === "venue" && clubs.find((c) => c.id === id)!.read_only;
}

const readOnlyError = () =>
  fail(403, "This club is read-only because its subscription has ended. Renew the plan to make changes.");

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

// ── Sessions: validation shared by create and edit ────────

function validateSession(body: SessionInput, userId: string, existing?: MockSession) {
  const errors: Record<string, string[]> = {};
  if (!organizerExists(body.organizer_type, body.organizer_id)) {
    return {
      errors: { organizer_id: ["Choose a club to host as."] } as Record<string, string[]>,
      forbidden: undefined,
    };
  }
  if (!canManageOrganizer(userId, body.organizer_type, body.organizer_id) && existing?.host_id !== userId) {
    return {
      errors: {} as Record<string, string[]>,
      forbidden: "Only the club's admins can host sessions for it.",
    };
  }
  if (body.organizer_type === "community") {
    const c = communities.find((x) => x.id === body.organizer_id)!;
    if (c.status !== "active") {
      return {
        errors: {} as Record<string, string[]>,
        forbidden: `${c.name} is waiting for CourtFlex review. You can host sessions once it's approved.`,
      };
    }
  }
  if (organizerReadOnly(body.organizer_type, body.organizer_id)) {
    return { errors: {} as Record<string, string[]>, forbidden: "read-only" };
  }

  const venue = clubs.find((c) => c.id === body.venue_id);
  if (!venue) errors.venue_id = ["Choose a venue."];
  else if (body.organizer_type === "venue" && body.venue_id !== body.organizer_id) {
    errors.venue_id = ["A venue's own sessions are played on its own courts."];
  } else if (venue.read_only) {
    errors.venue_id = [`${venue.name} isn't taking bookings right now.`];
  } else if (body.organizer_type === "community" && !venue.settings.allow_player_open_play) {
    errors.venue_id = [`${venue.name} doesn't host community sessions. Choose another venue.`];
  }
  if (!body.title?.trim()) errors.title = ["Give the session a name players will recognise."];
  const s = new Date(body.starts_at);
  const e = new Date(body.ends_at);
  const deadline = new Date(body.registration_deadline);
  const minutes = (e.getTime() - s.getTime()) / 60_000;
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || minutes <= 0) {
    errors.ends_at = ["The session must end after it starts."];
  } else if (minutes < 60 || minutes > 360) {
    errors.ends_at = ["Sessions run between 1 and 6 hours."];
  } else if (!existing && s.getTime() < Date.now()) {
    errors.starts_at = ["That time has already passed."];
  }
  if (Number.isNaN(deadline.getTime()) || deadline > s) {
    errors.registration_deadline = ["Registration has to close at or before the start time."];
  }
  if (!Number.isInteger(body.capacity) || body.capacity < 4 || body.capacity > 64) {
    errors.capacity = ["Choose between 4 and 64 players."];
  } else if (existing && body.capacity < activeParticipants(existing.id).length) {
    errors.capacity = [
      `${activeParticipants(existing.id).length} players are already registered. Capacity can't go below that.`,
    ];
  }
  if (!MONEY_RE.test(String(body.fee))) errors.fee = ["Enter the fee in pesos, or 0 for free."];
  if (!MONEY_RE.test(String(body.member_fee))) errors.member_fee = ["Enter the member fee in pesos, or 0."];
  else if (Number(body.member_fee) > Number(body.fee))
    errors.member_fee = ["Members can't pay more than everyone else."];
  if (!Array.isArray(body.court_ids) || body.court_ids.length === 0)
    errors.court_ids = ["Choose at least one court."];

  if (venue && !errors.ends_at && !errors.starts_at && Array.isArray(body.court_ids)) {
    const startsAt = s.toISOString();
    const endsAt = e.toISOString();
    const problems: string[] = [];
    for (const id of body.court_ids) {
      const c = courts.find((x) => x.id === id && x.club_id === venue.id);
      if (!c) {
        problems.push("One of the courts isn't at this venue.");
        continue;
      }
      const reason = unbookableReason(c, startsAt, endsAt);
      if (reason) problems.push(reason);
      const overlap = reservations.find(
        (r) =>
          r.court_id === c.id &&
          (r.status === "held" || r.status === "confirmed" || r.status === "active") &&
          r.starts_at < endsAt &&
          r.ends_at > startsAt &&
          (!existing || r.session_id !== existing.id),
      );
      if (overlap) {
        problems.push(`${c.name} is taken ${formatTimeRange(overlap.starts_at, overlap.ends_at, TZ)}.`);
      }
    }
    if (problems.length) errors.court_ids = problems;
  }
  return {
    errors,
    forbidden: undefined,
    venue,
    startsAt: s.toISOString(),
    endsAt: e.toISOString(),
    deadline: deadline.toISOString(),
  };
}

function findSession(id: string) {
  return sessions.find((s) => s.id === id);
}

/** Visible to everyone once published; before that only to the people involved. */
function canSee(s: MockSession, userId: string | undefined) {
  if (s.status === "published") return true;
  if (canManageSession(userId, s)) return true;
  if (userId && canManageOrganizer(userId, "venue", s.venue_id, "approvePlayerOpenPlay")) return true;
  return !!userId && participants.some((p) => p.session_id === s.id && p.player_id === userId);
}

// ── Ledger ────────────────────────────────────────────────

function ledgerFor(type: OrganizerType, id: string, from: string, to: string): LedgerEntry[] {
  const inRange = (iso: string) => {
    const d = todayIn(TZ, new Date(iso));
    return d >= from && d <= to;
  };
  const out: LedgerEntry[] = [];
  if (type === "venue") {
    for (const p of payments.filter((x) => x.status === "paid")) {
      const b = bookings.find((x) => x.id === p.booking_id);
      if (!b || b.club_id !== id || !inRange(p.received_at)) continue;
      const refunded = adjustments
        .filter((a) => a.payment_record_id === p.id)
        .reduce((s, a) => s + Number(a.amount), 0);
      out.push({
        id: p.id,
        kind: "court_booking",
        description: `${courts.find((c) => c.id === b.court_id)?.name ?? "Court"} booking ${b.booking_code}`,
        payer: b.player?.name ?? b.guest_name ?? "Guest",
        amount: p.amount,
        refunded: refunded.toFixed(2),
        currency: "PHP",
        method: p.method,
        reference_number: p.reference_number,
        received_by: p.received_by,
        received_at: p.received_at,
      });
    }
  }
  for (const f of feePayments.filter(
    (x) => x.organizer_type === type && x.organizer_id === id && inRange(x.received_at),
  )) {
    out.push({
      id: f.id,
      kind: f.kind,
      description: f.description,
      payer: person(f.payer_id).name,
      amount: f.amount.toFixed(2),
      refunded: refundedOfPayment(f.id).toFixed(2),
      currency: "PHP",
      method: f.method,
      reference_number: f.reference_number,
      received_by: person(f.received_by),
      received_at: f.received_at,
    });
  }
  return out.sort((a, b) => b.received_at.localeCompare(a.received_at));
}

function canSeeMoney(userId: string, type: OrganizerType, id: string) {
  return type === "venue"
    ? canManageOrganizer(userId, "venue", id, "viewClubReports")
    : canManageOrganizer(userId, "community", id);
}

// ── Handlers ──────────────────────────────────────────────

/** Starts the membership period from now, on the plan they joined. */
function activate(m: MockMember) {
  const p = plans.find((x) => x.id === m.plan_id);
  const club =
    m.organizer_type === "community" ? communities.find((c) => c.id === m.organizer_id) : undefined;
  if (club && m.status !== "active")
    notify(
      m.player_id,
      "clubs",
      "membership_active",
      `Welcome to ${club.name}`,
      "Your membership is active. Member rates and members-only sessions are open to you.",
      `/clubs/community/${club.slug}`,
    );
  m.status = "active";
  m.starts_at = isoNow();
  m.expires_at = p?.duration_days ? new Date(Date.now() + p.duration_days * 86_400_000).toISOString() : null;
}

/** Only clubs have members and membership plans. Venues answer "not found". */
const noVenueMembers = () => fail(404, "Venues don't have members. Players join clubs instead.");

export const openPlayHandlers = [
  http.all(`${API}/organizers/venue/:id/join`, noVenueMembers),
  http.all(`${API}/organizers/venue/:id/leave`, noVenueMembers),
  http.all(`${API}/organizers/venue/:id/members`, noVenueMembers),
  http.all(`${API}/organizers/venue/:id/members/*`, noVenueMembers),
  http.all(`${API}/organizers/venue/:id/plans`, noVenueMembers),
  http.all(`${API}/organizers/venue/:id/plans/*`, noVenueMembers),

  // Directory: active clubs of both kinds, plus your own clubs still in review.
  http.get(`${API}/discovery/clubs`, async ({ request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const url = new URL(request.url);
    const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
    const city = (url.searchParams.get("city") ?? "").trim().toLowerCase();
    // Clubs are player communities. Venues are listed only when asked for with type=venue
    // (forms that pick a home venue or where to host), never mixed in with clubs.
    const venuesOnly = url.searchParams.get("type") === "venue";
    const venueList = clubs
      .filter((c) => c.status === "active" && !c.read_only)
      .map((c) => listing("venue", c.id));
    const communityList = communities
      .filter(
        (c) =>
          c.status === "active" ||
          members.some(
            (m) =>
              m.organizer_type === "community" &&
              m.organizer_id === c.id &&
              m.player_id === auth.user.id &&
              m.role === "owner",
          ),
      )
      .map((c) => listing("community", c.id));
    const all = (venuesOnly ? venueList : communityList)
      .filter(
        (l) =>
          !search ||
          l.name.toLowerCase().includes(search) ||
          l.city.toLowerCase().includes(search) ||
          l.tagline.toLowerCase().includes(search),
      )
      .filter((l) => !city || l.city.toLowerCase() === city)
      .sort((a, b) => b.live_session_count - a.live_session_count || b.member_count - a.member_count);
    return ok(all);
  }),

  http.get(`${API}/discovery/clubs/:type/:slug`, async ({ params }) => {
    await latency();
    const type = String(params.type) as OrganizerType;
    // Venue pages are public, like court search. Club pages need an account.
    if (type === "venue" && !sessionUser()) {
      const v = clubs.find((c) => c.slug === String(params.slug) && !c.read_only && c.status === "active");
      return v ? ok(profile("venue", v.id, undefined)) : fail(404, "Club not found.");
    }
    const auth = signedIn();
    if (auth.error) return auth.error;
    const slug = String(params.slug);
    const id =
      type === "venue"
        ? clubs.find((c) => c.slug === slug && !c.read_only && c.status === "active")?.id
        : communities.find((c) => c.slug === slug)?.id;
    if (!id) return fail(404, "Club not found.");
    if (type === "community") {
      const c = communities.find((x) => x.id === id)!;
      const isOwnerOrAdmin = canManageOrganizer(auth.user.id, "community", id);
      if (c.status !== "active" && !isOwnerOrAdmin) return fail(404, "Club not found.");
    }
    return ok(profile(type, id, auth.user.id));
  }),

  // Community clubs: anyone signed in can start one; CourtFlex reviews it before it can host.
  http.post(`${API}/communities`, async ({ request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const body = (await request.json()) as CommunityInput;
    const errors = validateCommunity(body);
    const slug = slugify(body.name ?? "");
    if (
      !errors.name &&
      communities.some((c) => c.slug === slug || c.name.toLowerCase() === body.name.trim().toLowerCase())
    ) {
      errors.name = ["A club with this name already exists. Choose another name."];
    }
    if (Object.keys(errors).length) return invalid(errors);
    const c: Community = {
      id: nextId("com"),
      slug,
      ...cleanCommunity(body),
      status: "pending_review",
      created_by: auth.user.id,
      created_at: isoNow(),
    };
    communities.push(c);
    plans.push({
      id: nextId("pl"),
      organizer_type: "community",
      organizer_id: c.id,
      name: "Member",
      description: "Free.",
      price: "0.00",
      currency: "PHP",
      duration_days: null,
      session_discount_percent: 0,
      perks: [],
      recommended: false,
      is_active: true,
    });
    const m: MockMember = {
      id: nextId("mem"),
      organizer_type: "community",
      organizer_id: c.id,
      player_id: auth.user.id,
      role: "owner",
      status: "active",
      plan_id: null,
      requested_at: isoNow(),
      starts_at: isoNow(),
      expires_at: null,
      dues_due: 0,
      application: null,
      payment: null,
    };
    members.push(m);
    logMemberEvent(m, "approved", auth.user.id, "Started the club");
    return ok(profile("community", c.id, auth.user.id), 201);
  }),

  http.patch(`${API}/communities/:id`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const c = communities.find((x) => x.id === params.id);
    if (!c) return fail(404, "Club not found.");
    if (!canManageOrganizer(auth.user.id, "community", c.id))
      return fail(403, "Only the club's admins can change its details.");
    const body = (await request.json()) as CommunityInput;
    const errors = validateCommunity(body);
    if (communities.some((x) => x.id !== c.id && x.name.toLowerCase() === body.name?.trim().toLowerCase())) {
      errors.name = ["A club with this name already exists."];
    }
    if (Object.keys(errors).length) return invalid(errors);
    Object.assign(c, cleanCommunity(body));
    return ok(profile("community", c.id, auth.user.id));
  }),

  // Mock-only shortcut: approves everything waiting, as the demo Super Admin (same rules and audit log).
  http.post(`${API}/__mock/approve-communities`, async () => {
    const waiting = [
      ...clubs.filter((v) => v.status === "pending_review").map((v) => ["venue", v.id] as const),
      ...communities.filter((c) => c.status === "pending_review").map((c) => ["club", c.id] as const),
    ];
    for (const [kind, id] of waiting) decide(kind, id, { action: "approve" }, "u-001");
    return ok({ approved: waiting.length });
  }),

  // ── Membership ──────────────────────────────────────────
  http.post(`${API}/organizers/:type/:id/join`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const o = orgParam(params);
    if (!o) return fail(404, "Club not found.");
    const c = communities.find((x) => x.id === o.id)!;
    if (c.status !== "active") return fail(409, "This club isn't open to members yet.");
    if (organizerReadOnly(o.type, o.id)) return fail(409, "This club isn't taking new members right now.");
    const body = (await request.json()) as JoinClubInput;
    const orgPlans = plans.filter(
      (p) => p.organizer_type === o.type && p.organizer_id === o.id && p.is_active,
    );
    const plan = body.plan_id
      ? orgPlans.find((p) => p.id === body.plan_id)
      : orgPlans.length === 1
        ? orgPlans[0]
        : undefined;
    const existing = memberOf(o.type, o.id, auth.user.id);
    if (existing && ["pending", "active", "suspended"].includes(effectiveStatus(existing))) {
      const st = effectiveStatus(existing);
      return fail(
        409,
        st === "pending"
          ? "Your request to join is already waiting for the club."
          : st === "suspended"
            ? "Your membership is suspended. Contact the club."
            : "You're already a member.",
      );
    }

    // Every detail is required, the waiver must be accepted and the signature present.
    const errors = applicationErrors(body.application);
    if (orgPlans.length > 0 && !plan) errors.plan_id = ["Choose a membership plan."];
    const price = Number(plan?.price ?? 0);
    const methods = payMethods(c.payment_options);
    if (price > 0) {
      if (!body.payment_method || !methods.includes(body.payment_method))
        errors.payment_method = [
          methods.length ? "Choose how you'll pay." : "This club hasn't set up payments yet. Ask an admin.",
        ];
    }
    if (Object.keys(errors).length) return invalid(errors);
    const a = body.application!;

    const paid = price > 0;
    const instant = !paid && c.join_policy === "open";
    const t = isoNow();
    const m: MockMember = existing ?? {
      id: nextId("mem"),
      organizer_type: o.type,
      organizer_id: o.id,
      player_id: auth.user.id,
      role: "member",
      status: "pending",
      plan_id: null,
      requested_at: t,
      starts_at: null,
      expires_at: null,
      dues_due: 0,
      application: null,
      payment: null,
    };
    Object.assign(m, {
      role: m.role === "owner" ? "owner" : "member",
      plan_id: plan?.id ?? null,
      requested_at: t,
      // A paid plan starts when an admin confirms the payment.
      status: instant ? "active" : "pending",
      starts_at: instant ? t : null,
      expires_at:
        instant && plan?.duration_days
          ? new Date(Date.now() + plan.duration_days * 86_400_000).toISOString()
          : null,
      dues_due: price,
      application: {
        full_name: a.full_name.trim(),
        email: a.email.trim(),
        phone: a.phone.trim(),
        birth_date: a.birth_date,
        gender: a.gender,
        emergency_contact_name: a.emergency_contact_name.trim(),
        emergency_contact_phone: a.emergency_contact_phone.trim(),
        skill_level: a.skill_level,
        dominant_hand: a.dominant_hand,
        play_focus: a.play_focus,
        preferred_times: [...new Set(a.preferred_times)],
        signature:
          a.signature.kind === "typed" ? { kind: "typed", name: a.signature.name.trim() } : a.signature,
        waiver_accepted_at: t,
      },
      payment: paid
        ? {
            method: body.payment_method!,
            status: body.payment_method === "in_person" ? "pay_in_person" : "awaiting_receipt",
            amount: price.toFixed(2),
            receipt_url: null,
            reference_number: null,
            submitted_at: null,
            rejection_reason: null,
          }
        : null,
    } satisfies Partial<MockMember>);
    if (!existing) members.push(m);
    logMemberEvent(m, "requested", auth.user.id);
    if (instant) logMemberEvent(m, "approved", auth.user.id, "Open membership");
    return ok(memberView(m), 201);
  }),

  // The player sends their GCash or Maya receipt. It's checked by a club admin; it never counts as paid by itself.
  http.post(`${API}/organizers/community/:id/membership/receipt`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const c = communities.find((x) => x.id === params.id);
    if (!c) return fail(404, "Club not found.");
    const m = memberOf("community", c.id, auth.user.id);
    if (!m || effectiveStatus(m) !== "pending" || !m.payment)
      return fail(409, "There's no membership payment waiting for a receipt.");
    if (m.payment.method === "in_person")
      return fail(409, "You chose to pay in person. A club admin records it when you pay.");
    if (m.payment.status === "in_review")
      return fail(409, "Your receipt is already with the club. You'll see here when it's checked.");
    if (m.payment.status === "confirmed") return fail(409, "Your payment is already confirmed.");
    const body = (await request.json()) as MembershipReceiptInput;
    const errors: Record<string, string[]> = {};
    if (!body.receipt || !/^data:image\/(png|jpeg|webp);base64,/.test(body.receipt))
      errors.receipt = ["Upload a screenshot of your receipt (PNG, JPG or WebP)."];
    else if (body.receipt.length > 1_500_000) errors.receipt = ["That image is too big. Use one under 1 MB."];
    const ref = body.reference_number?.trim() ?? "";
    if (ref && !/^[A-Za-z0-9 -]{4,30}$/.test(ref))
      errors.reference_number = ["Use the reference number from the receipt: letters and numbers only."];
    if (Object.keys(errors).length) return invalid(errors);
    Object.assign(m.payment, {
      status: "in_review",
      receipt_url: body.receipt,
      reference_number: ref || null,
      submitted_at: isoNow(),
      rejection_reason: null,
    });
    const label = m.payment.method === "gcash" ? "GCash" : "Maya";
    logMemberEvent(
      m,
      "payment_submitted",
      auth.user.id,
      ref ? `${label} receipt, ref ${ref}` : `${label} receipt`,
    );
    return ok(memberView(m));
  }),

  http.post(`${API}/organizers/:type/:id/leave`, async ({ params }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const o = orgParam(params);
    if (!o) return fail(404, "Club not found.");
    const m = memberOf(o.type, o.id, auth.user.id);
    if (!m) return fail(404, "You're not a member of this club.");
    if (m.role === "owner") return fail(403, "The owner can't leave their own club.");
    members.splice(members.indexOf(m), 1);
    return noContent();
  }),

  http.get(`${API}/organizers/:type/:id/members`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const o = orgParam(params);
    if (!o) return fail(404, "Club not found.");
    if (!canManageOrganizer(auth.user.id, o.type, o.id, "manageClubMembers")) {
      return fail(403, "Only the club's admins can see the member list.");
    }
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
    const order = { pending: 0, active: 1, suspended: 2, expired: 3, rejected: 4 } as const;
    return ok(
      members
        .filter((m) => m.organizer_type === o.type && m.organizer_id === o.id)
        .map(memberView)
        .filter((m) => !status || m.status === status)
        .filter((m) => !search || m.player.name.toLowerCase().includes(search))
        .sort((a, b) => order[a.status] - order[b.status] || a.player.name.localeCompare(b.player.name)),
    );
  }),

  http.get(`${API}/organizers/:type/:id/members/:member`, async ({ params }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const o = orgParam(params);
    if (!o || !canManageOrganizer(auth.user.id, o.type, o.id, "manageClubMembers"))
      return fail(403, "Not allowed.");
    const m = members.find(
      (x) => x.id === params.member && x.organizer_type === o.type && x.organizer_id === o.id,
    );
    if (!m) return fail(404, "Member not found.");
    return ok(memberDetail(m));
  }),

  http.post(`${API}/organizers/:type/:id/members/:member/dues`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const o = orgParam(params);
    if (
      !o ||
      !canManageOrganizer(
        auth.user.id,
        o.type,
        o.id,
        o.type === "venue" ? "recordOnsitePayment" : "manageOpenPlay",
      )
    ) {
      return fail(403, "Your role can't record payments.");
    }
    if (organizerReadOnly(o.type, o.id)) return readOnlyError();
    const m = members.find(
      (x) => x.id === params.member && x.organizer_type === o.type && x.organizer_id === o.id,
    );
    if (!m) return fail(404, "Member not found.");
    const body = (await request.json()) as FeePaymentInput;
    const owed = m.dues_due - paidFor(m.id, "membership_dues");
    const err = paymentErrors(body, owed, "No dues are owed.");
    if (err) return err;
    const p = plans.find((x) => x.id === m.plan_id);
    feePayments.push({
      id: nextId("fp"),
      kind: "membership_dues",
      organizer_type: o.type,
      organizer_id: o.id,
      ref_id: m.id,
      payer_id: m.player_id,
      amount: Number(body.amount),
      method: body.method,
      reference_number: body.reference_number?.trim() || null,
      received_by: auth.user.id,
      received_at: isoNow(),
      description: `${p?.name ?? "Membership"} dues`,
    });
    logMemberEvent(
      m,
      "dues_paid",
      auth.user.id,
      `${peso(Number(body.amount))} ${body.method.replace(/_/g, " ")}`,
    );
    // Paid in full on a pending application: that's the club accepting them.
    if (effectiveStatus(m) === "pending" && paidFor(m.id, "membership_dues") >= m.dues_due) {
      if (m.payment) m.payment.status = "confirmed";
      activate(m);
      logMemberEvent(m, "approved", auth.user.id, "Dues paid");
    }
    return ok(memberDetail(m));
  }),

  http.post(`${API}/organizers/:type/:id/members/:member/:action`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const o = orgParam(params);
    if (!o) return fail(404, "Club not found.");
    if (!canManageOrganizer(auth.user.id, o.type, o.id, "manageClubMembers")) {
      return fail(403, "Only the club's admins can manage members.");
    }
    if (organizerReadOnly(o.type, o.id)) return readOnlyError();
    const m = members.find(
      (x) => x.id === params.member && x.organizer_type === o.type && x.organizer_id === o.id,
    );
    if (!m) return fail(404, "Member not found.");
    const action = String(params.action);
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
      reason?: string;
      plan_id?: string | null;
    };
    const status = effectiveStatus(m);
    const reason = body.reason?.trim() || null;
    const p = plans.find((x) => x.id === m.plan_id);

    switch (action) {
      case "approve":
        if (status !== "pending") return fail(409, "Only pending requests can be approved.");
        // GCash and Maya payments are checked first: confirming the receipt approves them.
        // Paying in person can come after approval; the dues show as owed until recorded.
        if (m.payment?.status === "in_review")
          return fail(409, "Check their receipt first: confirming the payment approves them.");
        if (m.payment?.status === "awaiting_receipt" || m.payment?.status === "rejected")
          return fail(
            409,
            "They haven't sent a receipt that's been accepted yet. Approve them once it's confirmed.",
          );
        activate(m);
        logMemberEvent(m, "approved", auth.user.id, reason);
        break;
      case "confirm-payment": {
        if (status !== "pending" || m.payment?.status !== "in_review")
          return fail(409, "There's no receipt waiting to be checked.");
        const owed = m.dues_due - paidFor(m.id, "membership_dues");
        feePayments.push({
          id: nextId("fp"),
          kind: "membership_dues",
          organizer_type: o.type,
          organizer_id: o.id,
          ref_id: m.id,
          payer_id: m.player_id,
          amount: owed,
          method: m.payment.method === "gcash" ? "gcash_at_venue" : "maya_at_venue",
          reference_number: m.payment.reference_number,
          received_by: auth.user.id,
          received_at: isoNow(),
          description: `${p?.name ?? "Membership"} dues`,
        });
        m.payment.status = "confirmed";
        logMemberEvent(
          m,
          "payment_confirmed",
          auth.user.id,
          `${peso(owed)} ${m.payment.method === "gcash" ? "GCash" : "Maya"}`,
        );
        activate(m);
        logMemberEvent(m, "approved", auth.user.id, reason);
        break;
      }
      case "reject-payment":
        if (status !== "pending" || m.payment?.status !== "in_review")
          return fail(409, "There's no receipt waiting to be checked.");
        if (!reason) return invalid({ reason: ["Say what's wrong, so they can send the right receipt."] });
        m.payment.status = "rejected";
        m.payment.rejection_reason = reason;
        logMemberEvent(m, "payment_rejected", auth.user.id, reason);
        break;
      case "reject":
        if (status !== "pending") return fail(409, "Only pending requests can be turned down.");
        if (paidFor(m.id, "membership_dues") > 0)
          return fail(409, "They've already paid. Refund the payment before turning them down.");
        m.status = "rejected";
        logMemberEvent(m, "rejected", auth.user.id, reason);
        break;
      case "suspend":
        if (m.role === "owner") return fail(403, "The owner can't be suspended.");
        if (status !== "active" && status !== "expired")
          return fail(409, "Only current members can be suspended.");
        if (!reason) return invalid({ reason: ["Add a reason. The member sees it."] });
        m.status = "suspended";
        logMemberEvent(m, "suspended", auth.user.id, reason);
        break;
      case "reactivate":
        if (status !== "suspended") return fail(409, "Only suspended members can be reactivated.");
        m.status = "active";
        logMemberEvent(m, "reactivated", auth.user.id, reason);
        break;
      case "renew": {
        if (status !== "active" && status !== "expired")
          return fail(409, "Only current or expired members can be renewed.");
        if (!p?.duration_days) return fail(409, "This plan doesn't expire, so there's nothing to renew.");
        // Renewal continues from the current end date, or from today if it already lapsed.
        const from = Math.max(Date.now(), m.expires_at ? new Date(m.expires_at).getTime() : 0);
        m.status = "active";
        m.expires_at = new Date(from + p.duration_days * 86_400_000).toISOString();
        m.dues_due += Number(p.price);
        logMemberEvent(m, "renewed", auth.user.id, reason);
        break;
      }
      case "make-admin":
      case "remove-admin":
        if (o.type !== "community") return fail(409, "Venue staff are managed on the Staff page.");
        if (
          !members.some(
            (x) =>
              x.organizer_type === "community" &&
              x.organizer_id === o.id &&
              x.player_id === auth.user.id &&
              x.role === "owner",
          )
        ) {
          return fail(403, "Only the club owner can choose admins.");
        }
        if (m.role === "owner") return fail(403, "The owner's role can't change.");
        if (status !== "active") return fail(409, "Only active members can be admins.");
        m.role = action === "make-admin" ? "admin" : "member";
        logMemberEvent(
          m,
          "role_changed",
          auth.user.id,
          action === "make-admin" ? "Made admin" : "No longer admin",
        );
        break;
      default:
        return fail(404, "Unknown action.");
    }
    return ok(memberDetail(m));
  }),

  http.get(`${API}/organizers/:type/:id/plans`, async ({ params }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const o = orgParam(params);
    if (!o) return fail(404, "Club not found.");
    const manage = canManageOrganizer(auth.user.id, o.type, o.id, "manageClubMembers");
    return ok(
      plans.filter((p) => p.organizer_type === o.type && p.organizer_id === o.id && (manage || p.is_active)),
    );
  }),

  http.post(`${API}/organizers/:type/:id/plans`, async ({ params, request }) => savePlan(params, request)),
  http.patch(`${API}/organizers/:type/:id/plans/:plan`, async ({ params, request }) =>
    savePlan(params, request),
  ),

  // ── Sessions ────────────────────────────────────────────
  http.get(`${API}/open-play`, async ({ request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") ?? "upcoming";
    const level = url.searchParams.get("level") as SkillLevel | null;
    const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
    const uid = auth.user.id;
    const joined = (s: MockSession) =>
      participants.some(
        (p) => p.session_id === s.id && p.player_id === uid && !["cancelled"].includes(p.status),
      );
    const hosted = (s: MockSession) =>
      s.host_id === uid || canManageOrganizer(uid, s.organizer_type, s.organizer_id);
    let list = sessions.filter((s) => {
      const st = sessionStatus(s);
      const ended = st === "completed";
      switch (scope) {
        case "joined":
          return joined(s) && !ended && st !== "rejected";
        case "hosted":
          return hosted(s) && !ended;
        case "past":
          return ended && (joined(s) || hosted(s));
        default:
          return st === "published" || st === "live";
      }
    });
    if (level) list = list.filter((s) => s.skill_level === level || s.skill_level === "all");
    if (search) {
      list = list.filter((s) =>
        [s.title, clubs.find((c) => c.id === s.venue_id)!.name, sessionView(s, uid).organizer.name].some(
          (t) => t.toLowerCase().includes(search),
        ),
      );
    }
    list.sort((a, b) =>
      scope === "past" ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at),
    );
    return ok(list.map((s) => sessionView(s, uid)));
  }),

  http.get(`${API}/organizers/:type/:id/sessions`, async ({ params, request }) => {
    await latency();
    // A venue's sessions show on its public page; a club's need an account.
    const auth = params.type === "venue" && !sessionUser() ? { user: undefined, error: null } : signedIn();
    if (auth.error) return auth.error;
    const o = orgParam(params);
    if (!o) return fail(404, "Club not found.");
    const when = new URL(request.url).searchParams.get("when") ?? "upcoming";
    const viewer = auth.user?.id;
    const isStaff = o.type === "venue" && !!viewer && !!activeMembership(o.id, viewer);
    const manage = isStaff || (!!viewer && canManageOrganizer(viewer, o.type, o.id));
    const list = sessions
      // A venue sees every session on its courts; a community sees its own.
      .filter((s) =>
        o.type === "venue"
          ? s.venue_id === o.id
          : s.organizer_type === "community" && s.organizer_id === o.id,
      )
      .filter((s) => {
        const st = sessionStatus(s);
        if (when === "pending") return st === "pending_approval";
        if (when === "past")
          return st === "completed" || ((st === "cancelled" || st === "rejected") && manage);
        if (st === "pending_approval") return manage;
        return st === "published" || st === "live";
      })
      .sort((a, b) =>
        when === "past" ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at),
      );
    return ok(list.map((s) => sessionView(s, viewer)));
  }),

  http.get(`${API}/open-play/:id`, async ({ params }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const s = findSession(String(params.id));
    if (!s || !canSee(s, auth.user.id)) return fail(404, "Session not found.");
    return ok(sessionDetail(s, auth.user.id));
  }),

  http.post(`${API}/open-play`, async ({ request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const body = (await request.json()) as SessionInput;
    const v = validateSession(body, auth.user.id);
    if (v.forbidden) return v.forbidden === "read-only" ? readOnlyError() : fail(403, v.forbidden);
    if (Object.keys(v.errors).length) return invalid(v.errors);
    const needsApproval = body.organizer_type === "community" && v.venue!.settings.require_open_play_approval;
    const s: MockSession = {
      id: nextId("op"),
      organizer_type: body.organizer_type,
      organizer_id: body.organizer_id,
      venue_id: v.venue!.id,
      host_id: auth.user.id,
      title: body.title.trim(),
      description: body.description?.trim() ?? "",
      session_type: body.session_type,
      skill_level: body.skill_level,
      starts_at: v.startsAt!,
      ends_at: v.endsAt!,
      registration_deadline: v.deadline!,
      court_ids: [...new Set(body.court_ids)],
      capacity: body.capacity,
      fee: Number(body.fee),
      member_fee: Number(body.member_fee),
      members_only: !!body.members_only,
      status: needsApproval ? "pending_approval" : "published",
      status_reason: null,
      court_fee: 0,
      created_at: isoNow(),
    };
    s.court_fee = courtFeeFor(s);
    // Session and court reservations are created together, so neither exists without the other.
    sessions.push(s);
    reserveCourts(s);
    syncReservations(s);
    return ok(sessionView(s, auth.user.id), 201);
  }),

  http.patch(`${API}/open-play/:id`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const s = findSession(String(params.id));
    if (!s) return fail(404, "Session not found.");
    if (
      !canManageSession(auth.user.id, s) ||
      (s.organizer_type === "venue" && !canManageOrganizer(auth.user.id, "venue", s.organizer_id))
    ) {
      return fail(403, "Only the session's organizers can edit it.");
    }
    const st = sessionStatus(s);
    if (st !== "published" && st !== "pending_approval")
      return fail(409, "Only upcoming sessions can be edited.");
    const body = (await request.json()) as SessionInput;
    if (
      body.organizer_type !== s.organizer_type ||
      body.organizer_id !== s.organizer_id ||
      body.venue_id !== s.venue_id
    ) {
      return invalid({
        venue_id: ["The host club and venue can't change. Cancel and create a new session instead."],
      });
    }
    const v = validateSession(body, auth.user.id, s);
    if (v.forbidden) return v.forbidden === "read-only" ? readOnlyError() : fail(403, v.forbidden);
    if (Object.keys(v.errors).length) return invalid(v.errors);
    const timeOrCourtsChanged =
      s.starts_at !== v.startsAt ||
      s.ends_at !== v.endsAt ||
      s.court_ids.join() !== [...new Set(body.court_ids)].join();
    Object.assign(s, {
      title: body.title.trim(),
      description: body.description?.trim() ?? "",
      session_type: body.session_type,
      skill_level: body.skill_level,
      starts_at: v.startsAt,
      ends_at: v.endsAt,
      registration_deadline: v.deadline,
      court_ids: [...new Set(body.court_ids)],
      capacity: body.capacity,
      fee: Number(body.fee),
      member_fee: Number(body.member_fee),
      members_only: !!body.members_only,
    });
    if (timeOrCourtsChanged) {
      releaseCourts(s);
      reserveCourts(s);
      s.court_fee = courtFeeFor(s);
      // Moving a community session needs the venue's approval again.
      if (
        s.organizer_type === "community" &&
        clubs.find((c) => c.id === s.venue_id)!.settings.require_open_play_approval
      ) {
        s.status = "pending_approval";
      }
    }
    promoteFromWaitlist(s);
    syncReservations(s);
    return ok(sessionView(s, auth.user.id));
  }),

  http.post(`${API}/open-play/:id/:action`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const s = findSession(String(params.id));
    if (!s || !canSee(s, auth.user.id)) return fail(404, "Session not found.");
    const action = String(params.action);
    const uid = auth.user.id;
    const body = ((await request.json().catch(() => ({}))) ?? {}) as { reason?: string };
    const st = sessionStatus(s);
    const mine = participants.find(
      (p) => p.session_id === s.id && p.player_id === uid && p.status !== "cancelled",
    );

    switch (action) {
      case "join":
      case "waitlist": {
        if (st !== "published" && st !== "live")
          return fail(409, "This session isn't open for registration.");
        if (isoNow() > s.registration_deadline) return fail(409, "Registration for this session has closed.");
        const membership = memberOf(s.organizer_type, s.organizer_id, uid);
        if (membership && effectiveStatus(membership) === "suspended") {
          return fail(403, `Your membership with ${sessionView(s, uid).organizer.name} is suspended.`);
        }
        if (s.members_only && !isActiveMember(s.organizer_type, s.organizer_id, uid)) {
          return fail(
            403,
            `This session is for ${sessionView(s, uid).organizer.name} members. Join the club first.`,
          );
        }
        if (mine) {
          return fail(
            409,
            mine.status === "waitlisted"
              ? `You're already on the waitlist (number ${mine.waitlist_position}).`
              : "You're already registered for this session.",
          );
        }
        // Count and add in one step so two people can't take the last spot.
        const full = activeParticipants(s.id).length >= s.capacity;
        if (action === "join" && full)
          return fail(409, "This session is full. Join the waitlist to get the next open spot.");
        if (action === "waitlist" && !full) return fail(409, "There are open spots. Register instead.");
        participants.push({
          id: nextId("pt"),
          session_id: s.id,
          player_id: uid,
          status: full ? "waitlisted" : "registered",
          waitlist_position: full ? waitlisted(s.id).length + 1 : null,
          registered_at: isoNow(),
          checked_in_at: null,
          fee_due: full ? 0 : feeFor(s, uid),
          is_member: isActiveMember(s.organizer_type, s.organizer_id, uid),
          games_played: 0,
        });
        syncReservations(s);
        break;
      }
      case "leave": {
        if (!mine) return fail(404, "You're not registered for this session.");
        if (mine.status !== "registered" && mine.status !== "waitlisted") {
          return fail(409, "You've already checked in. Ask the host if you need to leave.");
        }
        if (mine.status === "registered" && isoNow() > cancelUntil(s)) {
          return fail(
            409,
            `Cancellations closed ${sessionDetail(s, uid).cancellation_hours} hours before the start. Message the host.`,
          );
        }
        mine.status = "cancelled";
        mine.waitlist_position = null;
        promoteFromWaitlist(s);
        renumberWaitlist(s.id);
        syncReservations(s);
        break;
      }
      case "cancel": {
        const canCancel =
          s.host_id === uid ||
          (s.organizer_type === "venue"
            ? canManageOrganizer(uid, "venue", s.organizer_id)
            : canManageOrganizer(uid, "community", s.organizer_id));
        if (!canCancel) return fail(403, "Only the session's organizers can cancel it.");
        if (st !== "published" && st !== "pending_approval")
          return fail(409, "Only upcoming sessions can be cancelled.");
        if (!body.reason?.trim()) return invalid({ reason: ["Add a reason. Registered players see it."] });
        s.status = "cancelled";
        s.status_reason = body.reason.trim();
        releaseCourts(s);
        break;
      }
      case "approve":
      case "reject": {
        if (!canManageOrganizer(uid, "venue", s.venue_id, "approvePlayerOpenPlay")) {
          return fail(403, "Only the venue's managers can approve sessions on its courts.");
        }
        if (clubs.find((c) => c.id === s.venue_id)!.read_only) return readOnlyError();
        if (s.status !== "pending_approval") return fail(409, "This session isn't waiting for approval.");
        if (action === "reject") {
          if (!body.reason?.trim())
            return invalid({ reason: ["Tell the host why, so they can choose another time."] });
          s.status = "rejected";
          s.status_reason = body.reason.trim();
          releaseCourts(s);
        } else {
          s.status = "published";
          s.status_reason = null;
          syncReservations(s);
        }
        break;
      }
      default:
        return fail(404, "Unknown action.");
    }
    return ok(sessionDetail(s, uid));
  }),

  // ── Running a session ───────────────────────────────────
  http.post(`${API}/open-play/:id/participants`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const s = findSession(String(params.id));
    if (!s) return fail(404, "Session not found.");
    if (!canManageSession(auth.user.id, s))
      return fail(403, "Only the session's organizers can add players.");
    const st = sessionStatus(s);
    if (st !== "published" && st !== "live")
      return fail(409, "Players can only be added to upcoming or live sessions.");
    const { player_id } = (await request.json()) as { player_id: string };
    if (!users.some((u) => u.id === player_id && u.has_player_profile))
      return invalid({ player_id: ["Choose a player."] });
    if (
      participants.some((p) => p.session_id === s.id && p.player_id === player_id && p.status !== "cancelled")
    ) {
      return invalid({ player_id: [`${person(player_id).name} is already on this session's list.`] });
    }
    if (activeParticipants(s.id).length >= s.capacity)
      return fail(409, "The session is full. Raise the capacity first.");
    participants.push({
      id: nextId("pt"),
      session_id: s.id,
      player_id,
      status: "registered",
      waitlist_position: null,
      registered_at: isoNow(),
      checked_in_at: null,
      fee_due: feeFor(s, player_id),
      is_member: isActiveMember(s.organizer_type, s.organizer_id, player_id),
      games_played: 0,
    });
    syncReservations(s);
    return ok(sessionDetail(s, auth.user.id), 201);
  }),

  http.post(`${API}/open-play/:id/participants/:pid/payments`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const s = findSession(String(params.id));
    if (!s) return fail(404, "Session not found.");
    if (!canManageSession(auth.user.id, s))
      return fail(403, "Only the session's organizers can record fees.");
    if (organizerReadOnly(s.organizer_type, s.organizer_id)) return readOnlyError();
    const p = participants.find((x) => x.id === params.pid && x.session_id === s.id);
    if (!p) return fail(404, "Player not found in this session.");
    const body = (await request.json()) as FeePaymentInput;
    const owed = p.fee_due - (paidFor(p.id, "session_fee") - refundedFor(p.id, "session_fee"));
    const err = paymentErrors(body, owed, "This player doesn't owe anything.");
    if (err) return err;
    feePayments.push({
      id: nextId("fp"),
      kind: "session_fee",
      organizer_type: s.organizer_type,
      organizer_id: s.organizer_id,
      ref_id: p.id,
      payer_id: p.player_id,
      amount: Number(body.amount),
      method: body.method,
      reference_number: body.reference_number?.trim() || null,
      received_by: auth.user.id,
      received_at: isoNow(),
      description: `${s.title} fee`,
    });
    return ok(sessionDetail(s, auth.user.id));
  }),

  http.post(`${API}/open-play/:id/participants/:pid/refund`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const s = findSession(String(params.id));
    if (!s) return fail(404, "Session not found.");
    const allowed =
      s.organizer_type === "venue"
        ? canManageOrganizer(auth.user.id, "venue", s.organizer_id, "adjustOnsitePayment")
        : canManageOrganizer(auth.user.id, "community", s.organizer_id);
    if (!allowed) return fail(403, "Only managers can refund fees.");
    const p = participants.find((x) => x.id === params.pid && x.session_id === s.id);
    if (!p) return fail(404, "Player not found in this session.");
    const body = (await request.json()) as FeeRefundInput;
    const held = paidFor(p.id, "session_fee") - refundedFor(p.id, "session_fee");
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return invalid({ amount: ["Enter an amount above zero."] });
    if (amount > held) return invalid({ amount: [`Only ${peso(held)} was collected from this player.`] });
    if (!body.reason?.trim()) return invalid({ reason: ["Add a reason. It's kept in the payment history."] });
    // Refund against the latest payment that still has money on it.
    let left = amount;
    for (const fp of feePayments.filter((x) => x.ref_id === p.id && x.kind === "session_fee").reverse()) {
      const room = fp.amount - refundedOfPayment(fp.id);
      if (room <= 0 || left <= 0) continue;
      const take = Math.min(room, left);
      feeRefunds.push({
        id: nextId("fr"),
        payment_id: fp.id,
        amount: take,
        reason: body.reason.trim(),
        by: auth.user.id,
        at: isoNow(),
      });
      left -= take;
    }
    return ok(sessionDetail(s, auth.user.id));
  }),

  http.post(`${API}/open-play/:id/participants/:pid/:action`, async ({ params }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const s = findSession(String(params.id));
    if (!s) return fail(404, "Session not found.");
    if (!canManageSession(auth.user.id, s))
      return fail(403, "Only the session's organizers can manage players.");
    const p = participants.find((x) => x.id === params.pid && x.session_id === s.id);
    if (!p) return fail(404, "Player not found in this session.");
    const st = sessionStatus(s);
    const q = (queues[s.id] ??= { version: 0, waiting: [], resting: [], games: [] });
    const playing = q.games.some((g) => !g.ended_at && [...g.team_a, ...g.team_b].includes(p.id));

    switch (String(params.action)) {
      case "check-in": {
        if (st !== "published" && st !== "live")
          return fail(409, "Check-in is only open for upcoming or live sessions.");
        if (new Date(s.starts_at).getTime() - Date.now() > 2 * 3_600_000)
          return fail(409, "Check-in opens 2 hours before the start.");
        if (p.status !== "registered")
          return fail(
            409,
            p.status === "checked_in" ? "Already checked in." : "Only registered players can check in.",
          );
        p.status = "checked_in";
        p.checked_in_at = isoNow();
        q.waiting.push({ participant_id: p.id, since: isoNow() });
        q.version++;
        break;
      }
      case "undo-check-in":
        if (p.status !== "checked_in") return fail(409, "This player isn't checked in.");
        if (playing) return fail(409, "Finish their game first.");
        p.status = "registered";
        p.checked_in_at = null;
        removeFromQueue(s, p.id);
        break;
      case "no-show":
        if (p.status !== "registered")
          return fail(409, "Only players who haven't checked in can be marked no-show.");
        if (Date.now() < new Date(s.starts_at).getTime())
          return fail(409, "No-shows can be marked once the session starts.");
        p.status = "no_show";
        promoteFromWaitlist(s);
        break;
      case "remove":
        if (playing) return fail(409, "Finish their game first.");
        if (p.status === "cancelled") return fail(409, "Already removed.");
        p.status = "cancelled";
        p.waitlist_position = null;
        removeFromQueue(s, p.id);
        promoteFromWaitlist(s);
        renumberWaitlist(s.id);
        break;
      default:
        return fail(404, "Unknown action.");
    }
    syncReservations(s);
    return ok(sessionDetail(s, auth.user.id));
  }),

  http.post(`${API}/open-play/:id/court-fee`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const s = findSession(String(params.id));
    if (!s) return fail(404, "Session not found.");
    if (!canManageOrganizer(auth.user.id, "venue", s.venue_id, "recordOnsitePayment")) {
      return fail(403, "Only the venue's staff can record court fees.");
    }
    if (clubs.find((c) => c.id === s.venue_id)!.read_only) return readOnlyError();
    if (s.organizer_type === "venue") return fail(409, "The venue's own sessions have no court fee.");
    const body = (await request.json()) as FeePaymentInput;
    const err = paymentErrors(body, s.court_fee - courtFeePaid(s.id), "The court fee is already paid.");
    if (err) return err;
    feePayments.push({
      id: nextId("fp"),
      kind: "court_fee",
      organizer_type: "venue",
      organizer_id: s.venue_id,
      ref_id: s.id,
      payer_id: s.host_id,
      amount: Number(body.amount),
      method: body.method,
      reference_number: body.reference_number?.trim() || null,
      received_by: auth.user.id,
      received_at: isoNow(),
      description: `Court fee: ${s.title}`,
    });
    return ok(sessionDetail(s, auth.user.id));
  }),

  // ── Live queue ──────────────────────────────────────────
  http.get(`${API}/open-play/:id/queue`, async ({ params }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const s = findSession(String(params.id));
    if (!s || !canSee(s, auth.user.id)) return fail(404, "Session not found.");
    return ok(queueView(s));
  }),

  http.post(`${API}/open-play/:id/queue/:command`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const s = findSession(String(params.id));
    if (!s) return fail(404, "Session not found.");
    if (!canManageSession(auth.user.id, s))
      return fail(403, "Only the session's organizers can run the queue.");
    const st = sessionStatus(s);
    if (
      st !== "live" &&
      !(st === "published" && new Date(s.starts_at).getTime() - Date.now() < 30 * 60_000)
    ) {
      return fail(409, "The queue opens 30 minutes before the session starts.");
    }
    const q = (queues[s.id] ??= { version: 0, waiting: [], resting: [], games: [] });
    const body = (await request.json()) as {
      court_id?: string;
      participant_ids?: string[];
      game_id?: string;
      winner?: "a" | "b" | null;
      participant_id?: string;
      position?: number;
      resting?: boolean;
    };
    const courtBusy = (id: string) => q.games.some((g) => g.court_id === id && !g.ended_at);

    switch (String(params.command)) {
      case "fill": {
        if (!body.court_id || !s.court_ids.includes(body.court_id))
          return invalid({ court_id: ["Choose one of this session's courts."] });
        if (courtBusy(body.court_id)) return fail(409, "That court already has a game. Finish it first.");
        let four: string[];
        if (body.participant_ids?.length) {
          four = [...new Set(body.participant_ids)];
          if (four.length !== 4) return invalid({ participant_ids: ["Pick exactly 4 players for doubles."] });
          const free = new Set([...q.waiting.map((w) => w.participant_id), ...q.resting]);
          const busy = four.filter((pid) => !free.has(pid));
          if (busy.length)
            return fail(409, "Some of those players are already on a court. Refresh and pick again.");
        } else {
          // Automatic: the four who have waited longest.
          if (q.waiting.length < 4) {
            return fail(
              409,
              `Need 4 players waiting to start a game. ${q.waiting.length} ${q.waiting.length === 1 ? "is" : "are"} waiting.`,
            );
          }
          four = q.waiting.slice(0, 4).map((w) => w.participant_id);
        }
        startGame(s, body.court_id, four);
        break;
      }
      case "finish": {
        const g = q.games.find((x) => x.id === body.game_id && !x.ended_at);
        if (!g) return fail(409, "That game already ended. The board has been refreshed.");
        g.ended_at = isoNow();
        g.winner = body.winner ?? null;
        // Everyone goes to the back of the line, then the court refills automatically.
        for (const pid of [...g.team_a, ...g.team_b]) {
          participants.find((p) => p.id === pid)!.games_played++;
          q.waiting.push({ participant_id: pid, since: isoNow() });
        }
        q.version++;
        if (
          q.waiting.length >= 8 ||
          (q.waiting.length >= 4 &&
            !q.waiting.slice(0, 4).every((w) => [...g.team_a, ...g.team_b].includes(w.participant_id)))
        ) {
          startGame(
            s,
            g.court_id,
            q.waiting.slice(0, 4).map((w) => w.participant_id),
          );
        }
        break;
      }
      case "move": {
        const i = q.waiting.findIndex((w) => w.participant_id === body.participant_id);
        if (i < 0) return fail(409, "That player isn't waiting in line.");
        const to = Math.max(1, Math.min(Number(body.position) || 1, q.waiting.length)) - 1;
        const [entry] = q.waiting.splice(i, 1);
        q.waiting.splice(to, 0, entry!);
        q.version++;
        break;
      }
      case "rest": {
        const pid = body.participant_id!;
        if (body.resting) {
          if (!q.waiting.some((w) => w.participant_id === pid))
            return fail(409, "Only players waiting in line can sit out.");
          q.waiting = q.waiting.filter((w) => w.participant_id !== pid);
          q.resting.push(pid);
        } else {
          if (!q.resting.includes(pid)) return fail(409, "That player isn't sitting out.");
          q.resting = q.resting.filter((x) => x !== pid);
          q.waiting.push({ participant_id: pid, since: isoNow() });
        }
        q.version++;
        break;
      }
      default:
        return fail(404, "Unknown command.");
    }
    return ok(queueView(s));
  }),

  http.get(`${API}/player/clubs`, async () => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    return ok(
      members
        .filter((m) => m.player_id === auth.user.id && effectiveStatus(m) !== "rejected")
        .filter(
          (m) => m.organizer_type === "community" || !clubs.find((c) => c.id === m.organizer_id)!.read_only,
        )
        .map((m) => ({
          club: listing(m.organizer_type, m.organizer_id),
          membership: memberView(m),
          can_host:
            m.organizer_type === "community" &&
            communities.find((c) => c.id === m.organizer_id)!.status === "active" &&
            canManageOrganizer(auth.user.id, "community", m.organizer_id),
        }))
        .map(({ membership, ...rest }) => ({
          ...rest,
          membership: {
            id: membership.id,
            status: membership.status,
            role: membership.role,
            plan: membership.plan,
            starts_at: membership.starts_at,
            expires_at: membership.expires_at,
            payment: membership.payment,
          },
        })),
    );
  }),

  // Player search for hosts adding a walk-in to a session. Anyone who runs a session can use it.
  http.get(`${API}/players`, async ({ request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const q = (new URL(request.url).searchParams.get("search") ?? "").trim().toLowerCase();
    if (q.length < 2) return ok([]);
    return ok(
      users
        .filter((u) => u.has_player_profile && u.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map((u) => ({ id: u.id, name: u.name, home_city: u.home_city, phone_last4: null })),
    );
  }),

  // ── Courts for hosting ──────────────────────────────────
  http.get(`${API}/venues/:venue/court-options`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const venue = clubs.find((c) => c.id === params.venue);
    if (!venue) return fail(404, "Venue not found.");
    const url = new URL(request.url);
    const startsAt = new Date(url.searchParams.get("starts_at") ?? "").toISOString();
    const endsAt = new Date(url.searchParams.get("ends_at") ?? "").toISOString();
    const exclude = url.searchParams.get("exclude_session");
    return ok(
      courts
        .filter((c) => c.club_id === venue.id)
        .map((c) => {
          const reason = unbookableReason(c, startsAt, endsAt);
          const overlap = reservations.find(
            (r) =>
              r.court_id === c.id &&
              ["held", "confirmed", "active"].includes(r.status) &&
              r.starts_at < endsAt &&
              r.ends_at > startsAt &&
              (!exclude || r.session_id !== exclude),
          );
          return {
            id: c.id,
            name: c.name,
            indoor_outdoor: c.indoor_outdoor,
            available: !reason && !overlap,
            reason:
              reason ?? (overlap ? `Taken ${formatTimeRange(overlap.starts_at, overlap.ends_at, TZ)}` : null),
            price: priceFor(c, startsAt, endsAt).toFixed(2),
          };
        }),
    );
  }),

  // ── Money ───────────────────────────────────────────────
  http.get(`${API}/organizers/:type/:id/payments`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const o = orgParam(params);
    if (!o) return fail(404, "Club not found.");
    if (!canSeeMoney(auth.user.id, o.type, o.id))
      return fail(403, "Only managers can see the club's payments.");
    const url = new URL(request.url);
    const today = todayIn(TZ);
    const from = url.searchParams.get("from") ?? today;
    const to = url.searchParams.get("to") ?? today;
    const kind = url.searchParams.get("kind") as LedgerKind | null;
    return ok(ledgerFor(o.type, o.id, from, to).filter((e) => !kind || e.kind === kind));
  }),

  http.get(`${API}/organizers/:type/:id/reports/revenue`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const o = orgParam(params);
    if (!o) return fail(404, "Club not found.");
    if (!canSeeMoney(auth.user.id, o.type, o.id))
      return fail(403, "Only managers can see the club's revenue.");
    const url = new URL(request.url);
    const today = todayIn(TZ);
    const from = url.searchParams.get("from") ?? today;
    const to = url.searchParams.get("to") ?? today;
    const entries = ledgerFor(o.type, o.id, from, to);
    const kinds = new Map<LedgerKind, { amount: number; count: number }>();
    const methods = new Map<PaymentMethod, number>();
    let total = 0;
    let refunds = 0;
    for (const e of entries) {
      const net = Number(e.amount) - Number(e.refunded);
      total += net;
      refunds += Number(e.refunded);
      const k = kinds.get(e.kind) ?? { amount: 0, count: 0 };
      kinds.set(e.kind, { amount: k.amount + net, count: k.count + 1 });
      methods.set(e.method, (methods.get(e.method) ?? 0) + net);
    }
    const report: RevenueReport = {
      from,
      to,
      currency: "PHP",
      total: total.toFixed(2),
      refunds: refunds.toFixed(2),
      by_kind: [...kinds.entries()].map(([kind, v]) => ({
        kind,
        amount: v.amount.toFixed(2),
        count: v.count,
      })),
      by_method: [...methods.entries()].map(([method, amount]) => ({ method, amount: amount.toFixed(2) })),
    };
    return ok(report);
  }),
];

// ── helpers ───────────────────────────────────────────────

function validateCommunity(body: CommunityInput) {
  const errors: Record<string, string[]> = {};
  if (!body.name?.trim() || body.name.trim().length < 3)
    errors.name = ["Give the club a name of at least 3 letters."];
  if (!body.tagline?.trim()) errors.tagline = ["Add one line about the club. It shows on the club card."];
  if (!body.city?.trim()) errors.city = ["Enter the city or municipality where you play."];
  if (!body.province?.trim()) errors.province = ["Enter the province."];
  if (body.contact_email && !EMAIL_RE.test(body.contact_email.trim()))
    errors.contact_email = ["Enter a valid email."];
  if (body.home_venue_id && !clubs.some((c) => c.id === body.home_venue_id))
    errors.home_venue_id = ["Choose a venue from the list."];
  if (!["open", "approval"].includes(body.join_policy)) errors.join_policy = ["Choose how people join."];
  if (
    !Number.isInteger(body.cancellation_hours) ||
    body.cancellation_hours < 0 ||
    body.cancellation_hours > 72
  ) {
    errors.cancellation_hours = ["Choose between 0 and 72 hours."];
  }
  if (!body.waiver?.trim() || body.waiver.trim().length < 40)
    errors.waiver = ["Write the agreement members sign when they join (at least a few sentences)."];
  else if (body.waiver.length > 6000) errors.waiver = ["Keep the agreement under 6,000 characters."];
  const po = body.payment_options;
  if (!po || (!po.in_person && !po.gcash && !po.maya))
    errors.payment_options = ["Choose at least one way members can pay."];
  for (const key of ["gcash", "maya"] as const) {
    const w = po?.[key];
    if (!w) continue;
    if (!w.account_name?.trim()) errors[`${key}_name`] = ["Enter the account name members will see."];
    if (!/^09\d{9}$/.test(w.account_number?.replace(/\s/g, "") ?? ""))
      errors[`${key}_number`] = ["Enter the 11-digit number, like 09171234567."];
    if (w.qr_url && !/^data:image\/(png|jpeg|webp);base64,/.test(w.qr_url))
      errors[`${key}_qr`] = ["Upload the QR code as a PNG, JPG or WebP image."];
  }
  if ((po?.instructions?.length ?? 0) > 300)
    errors.payment_instructions = ["Keep the notes under 300 characters."];
  for (const key of ["logo_url", "cover_url"] as const) {
    const v = body[key];
    if (v && !/^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/.test(v))
      errors[key] = ["Upload a PNG, JPG or WebP image."];
    if (v && v.length > 1_500_000) errors[key] = ["That image is too big. Use one under 1 MB."];
  }
  return errors;
}

function cleanCommunity(body: CommunityInput) {
  return {
    name: body.name.trim(),
    tagline: body.tagline.trim(),
    description: body.description?.trim() ?? "",
    rules: body.rules?.trim() ?? "",
    city: body.city.trim(),
    province: body.province.trim(),
    home_venue_id: body.home_venue_id || null,
    contact_email: body.contact_email?.trim() ?? "",
    contact_phone: body.contact_phone?.trim() ?? "",
    join_policy: body.join_policy,
    cancellation_hours: body.cancellation_hours,
    logo_url: body.logo_url || null,
    cover_url: body.cover_url || null,
    waiver: body.waiver.trim(),
    payment_options: {
      in_person: !!body.payment_options.in_person,
      gcash: cleanWallet(body.payment_options.gcash),
      maya: cleanWallet(body.payment_options.maya),
      instructions: body.payment_options.instructions?.trim() ?? "",
    },
  };
}

function cleanWallet(w: WalletAccount | null): WalletAccount | null {
  if (!w) return null;
  return {
    account_name: w.account_name.trim(),
    account_number: w.account_number.replace(/\s/g, ""),
    qr_url: w.qr_url || null,
  };
}

/** The ways a club accepts membership payments. */
function payMethods(po: ClubPaymentOptions): MembershipPayMethod[] {
  return [
    ...(po.in_person ? (["in_person"] as const) : []),
    ...(po.gcash ? (["gcash"] as const) : []),
    ...(po.maya ? (["maya"] as const) : []),
  ];
}

const GENDERS = ["female", "male", "other", "prefer_not_to_say"];
const HANDS = ["right", "left", "both"];
const FOCUS = ["social", "fitness", "competitive", "learning"];
const JOIN_TIMES = ["morning", "midday", "evening", "weekends"];
const LEVELS = ["beginner", "novice", "intermediate", "advanced", "pro"];
const PHONE_RE = /^(\+?63|0)9\d{9}$/;

/** Every detail on the join form is required. Field names match the form's. */
function applicationErrors(a: JoinClubInput["application"]): Record<string, string[]> {
  const e: Record<string, string[]> = {};
  if (!a) return { application: ["Fill in the join form."] };
  if (!a.full_name?.trim() || a.full_name.trim().length < 3) e.full_name = ["Enter your full name."];
  if (!EMAIL_RE.test(a.email?.trim() ?? "")) e.email = ["Enter a valid email."];
  if (!PHONE_RE.test(a.phone?.replace(/[\s-]/g, "") ?? ""))
    e.phone = ["Enter a mobile number, like 09171234567."];
  const born = /^\d{4}-\d{2}-\d{2}$/.test(a.birth_date ?? "") ? new Date(`${a.birth_date}T00:00:00Z`) : null;
  const age = born ? (Date.now() - born.getTime()) / (365.25 * 86_400_000) : NaN;
  if (!born || Number.isNaN(born.getTime())) e.birth_date = ["Enter your date of birth."];
  else if (age < 7 || age > 100) e.birth_date = ["Check your date of birth."];
  if (!GENDERS.includes(a.gender)) e.gender = ["Choose an option."];
  if (!a.emergency_contact_name?.trim())
    e.emergency_contact_name = ["Enter who we should call in an emergency."];
  if (!PHONE_RE.test(a.emergency_contact_phone?.replace(/[\s-]/g, "") ?? ""))
    e.emergency_contact_phone = ["Enter their mobile number, like 09171234567."];
  else if (a.emergency_contact_phone.replace(/[\s-]/g, "") === a.phone?.replace(/[\s-]/g, ""))
    e.emergency_contact_phone = ["Use someone else's number, not your own."];
  if (!LEVELS.includes(a.skill_level)) e.skill_level = ["Choose your level."];
  if (!HANDS.includes(a.dominant_hand)) e.dominant_hand = ["Choose your playing hand."];
  if (!FOCUS.includes(a.play_focus)) e.play_focus = ["Choose what you play for."];
  if (
    !Array.isArray(a.preferred_times) ||
    !a.preferred_times.length ||
    a.preferred_times.some((t) => !JOIN_TIMES.includes(t))
  )
    e.preferred_times = ["Choose at least one time you usually play."];
  if (!a.accept_waiver) e.accept_waiver = ["Agree to the club's membership agreement to join."];
  const sig = a.signature;
  if (!sig) e.signature = ["Sign the agreement."];
  else if (sig.kind === "typed") {
    const typed = sig.name?.trim().toLowerCase() ?? "";
    if (!typed) e.signature = ["Type your full name to sign."];
    else if (typed !== a.full_name?.trim().toLowerCase()) e.signature = ["Type your name exactly as above."];
  } else if (sig.kind === "drawn") {
    if (!/^data:image\/png;base64,/.test(sig.image ?? "")) e.signature = ["Draw your signature."];
    else if (sig.image.length > 400_000)
      e.signature = ["That signature is too detailed. Clear it and sign again."];
  } else e.signature = ["Sign the agreement."];
  return e;
}

function paymentErrors(body: FeePaymentInput, owed: number, nothingOwed: string) {
  if (owed <= 0) return fail(409, nothingOwed);
  const amount = Number(body.amount);
  const errors: Record<string, string[]> = {};
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = ["Enter the amount you collected."];
  else if (amount > owed) errors.amount = [`Only ${peso(owed)} is owed.`];
  if (!METHODS.includes(body.method)) errors.method = ["Choose how they paid."];
  return Object.keys(errors).length ? invalid(errors) : null;
}

async function savePlan(params: Record<string, unknown>, request: Request) {
  await latency();
  const auth = signedIn();
  if (auth.error) return auth.error;
  const o = orgParam(params);
  if (!o) return fail(404, "Club not found.");
  if (!canManageOrganizer(auth.user.id, o.type, o.id, "manageClubMembers")) {
    return fail(403, "Only the club's admins can change membership plans.");
  }
  if (organizerReadOnly(o.type, o.id)) return readOnlyError();
  const body = (await request.json()) as PlanInput;
  const errors: Record<string, string[]> = {};
  if (!body.name?.trim()) errors.name = ["Name the plan, like Monthly or Annual."];
  if (!MONEY_RE.test(String(body.price))) errors.price = ["Enter the price in pesos, or 0 for free."];
  if (body.duration_days !== null && ![30, 90, 180, 365].includes(body.duration_days)) {
    errors.duration_days = ["Choose 1, 3, 6 or 12 months, or no expiry."];
  }
  if (!(body.session_discount_percent >= 0 && body.session_discount_percent <= 100)) {
    errors.session_discount_percent = ["Use a discount between 0 and 100%."];
  }
  const perks = (body.perks ?? [])
    .map((x) => ({ text: String(x.text ?? "").trim(), included: !!x.included }))
    .filter((x) => x.text);
  if (perks.length > 8) errors.perks = ["List up to 8 perks."];
  else if (perks.some((x) => x.text.length > 60)) errors.perks = ["Keep each perk under 60 characters."];
  const existing = params.plan
    ? plans.find((p) => p.id === params.plan && p.organizer_type === o.type && p.organizer_id === o.id)
    : undefined;
  if (params.plan && !existing) return fail(404, "Plan not found.");
  const others = plans.filter(
    (p) => p.organizer_type === o.type && p.organizer_id === o.id && p.id !== existing?.id,
  );
  if (others.some((p) => p.name.toLowerCase() === body.name?.trim().toLowerCase()))
    errors.name = ["Another plan already has this name."];
  if (Object.keys(errors).length) return invalid(errors);
  const values = {
    name: body.name.trim(),
    description: body.description?.trim() ?? "",
    price: Number(body.price).toFixed(2),
    duration_days: body.duration_days,
    session_discount_percent: Math.round(body.session_discount_percent),
    perks,
    recommended: !!body.recommended && !!body.is_active,
    is_active: !!body.is_active,
  };
  // Only one plan is recommended at a time.
  if (values.recommended) for (const x of others) x.recommended = false;
  // Existing members keep the terms they joined on; changes apply to new joins and renewals.
  if (existing) {
    Object.assign(existing, values);
    return ok(existing);
  }
  const p = {
    id: nextId("pl"),
    organizer_type: o.type,
    organizer_id: o.id,
    currency: "PHP" as const,
    ...values,
  };
  plans.push(p);
  return ok(p, 201);
}
