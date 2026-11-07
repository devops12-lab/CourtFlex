// Super Admin API (blueprint §9.2). Only the Super Admin (global role super_admin), who owns the whole system.
import { http } from "msw";
import type {
  AdminClubDetail,
  AdminClubRow,
  AdminDashboard,
  AdminVenueDetail,
  AdminVenueRow,
  OrgAction,
  OrgDecision,
  OrgDecisionInput,
  OrgKind,
  OrgStatus,
  ReviewItem,
} from "@courtflex/api";
import {
  adjustments,
  bookings,
  clubs,
  courts,
  memberships,
  payments,
  startTrial,
  subscriptionFor,
  TZ,
  users,
} from "./db";
import { todayIn } from "@courtflex/api";
import { communities, members, plans, sessions } from "./open-play-db";
import { matches } from "./match-db";
import { places } from "./player-db";
import { audit, auditLogs, platformSettings, reviewKey, reviews } from "./admin-db";
import { API, fail, invalid, latency, ok, sessionUser } from "./http-helpers";

/** Signed in as the Super Admin. Everyone else is refused, with no hint of what's here. */
export function authorizeAdmin() {
  const user = sessionUser();
  if (!user) return { error: fail(401, "Your session has ended. Sign in again.") } as const;
  if (!user.super_admin) return { error: fail(403, "This area is for the Super Admin.") } as const;
  return { user, error: null } as const;
}

const DAY = 86_400_000;

/** Who signed a venue up: its owner. */
function venueOwner(clubId: string) {
  const m = memberships.find((x) => x.club_id === clubId && x.role_key === "owner");
  return users.find((u) => u.id === m?.user_id);
}

export function reviewQueue(): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const v of clubs) {
    if (v.status !== "pending_review") continue;
    const owner = venueOwner(v.id);
    items.push({
      kind: "venue",
      id: v.id,
      name: v.name,
      city: v.city,
      province: v.province,
      submitted_at: reviews[reviewKey("venue", v.id)]?.submitted_at ?? new Date().toISOString(),
      submitted_by: { id: owner?.id ?? "", name: owner?.name ?? "Unknown", email: owner?.email ?? "" },
    });
  }
  for (const c of communities) {
    if (c.status !== "pending_review") continue;
    const by = users.find((u) => u.id === c.created_by);
    items.push({
      kind: "club",
      id: c.id,
      name: c.name,
      city: c.city,
      province: c.province,
      submitted_at: reviews[reviewKey("club", c.id)]?.submitted_at ?? c.created_at,
      submitted_by: { id: by?.id ?? "", name: by?.name ?? "Unknown", email: by?.email ?? "" },
    });
  }
  return items.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
}

// ── Decisions on venues and clubs ─────────────────────────

const allowedFrom: Record<OrgAction, OrgStatus[]> = {
  approve: ["pending_review", "rejected"],
  reject: ["pending_review"],
  suspend: ["active"],
  reactivate: ["suspended"],
};
const statusAfter: Record<OrgAction, OrgStatus> = {
  approve: "active",
  reject: "rejected",
  suspend: "suspended",
  reactivate: "active",
};
const verb: Record<OrgAction, string> = {
  approve: "Approved",
  reject: "Declined",
  suspend: "Suspended",
  reactivate: "Reactivated",
};
const statusWords: Record<OrgStatus, string> = {
  pending_review: "waiting for review",
  active: "active",
  suspended: "suspended",
  rejected: "declined",
};

/**
 * Approve, decline, suspend or reactivate a venue or club. Declining and
 * suspending need a reason, which the owner sees. Approving a venue starts its
 * 14-day trial (once). Every decision is audited.
 */
export function decide(kind: OrgKind, id: string, input: OrgDecisionInput, actorId: string): Response | null {
  const org = kind === "venue" ? clubs.find((c) => c.id === id) : communities.find((c) => c.id === id);
  const noun = kind === "venue" ? "venue" : "club";
  if (!org) return fail(404, `This ${noun} doesn't exist.`);
  const action = input.action;
  if (!(action in allowedFrom))
    return invalid({ action: ["Choose approve, decline, suspend or reactivate."] });
  const reason = input.reason?.trim() ?? "";
  if ((action === "reject" || action === "suspend") && reason.length < 10)
    return invalid({
      reason: [`Say why in a sentence (at least 10 characters). The ${noun}'s owner sees it.`],
    });
  const status = org.status as OrgStatus;
  if (!allowedFrom[action].includes(status))
    return fail(409, `This ${noun} is ${statusWords[status]}, so it can't be ${verb[action].toLowerCase()}.`);

  org.status = statusAfter[action];
  const note = action === "reject" || action === "suspend" ? reason : null;
  (org as { status_reason?: string | null }).status_reason = note;
  if (kind === "venue" && action === "approve") startTrial(id, platformSettings.trial_days);
  const key = reviewKey(kind, id);
  reviews[key] = {
    submitted_at: reviews[key]?.submitted_at ?? new Date().toISOString(),
    decided_at: new Date().toISOString(),
    decided_by: actorId,
    reason: reason || null,
  };
  audit(
    actorId,
    `${kind}.${action}`,
    `${verb[action]} ${org.name}`,
    { type: kind, id, name: org.name },
    reason || null,
  );
  return null;
}

const DECISION_RE = /\.(approve|reject|suspend|reactivate)$/;

function decisionOf(kind: OrgKind, id: string): OrgDecision | null {
  const entry = [...auditLogs]
    .reverse()
    .find((a) => a.target.type === kind && a.target.id === id && DECISION_RE.test(a.action));
  if (!entry) return null;
  return {
    at: entry.at,
    by: entry.actor,
    action: entry.action.split(".")[1] as OrgAction,
    reason: entry.reason,
  };
}

const historyOf = (kind: OrgKind, id: string) =>
  auditLogs.filter((a) => a.target.type === kind && a.target.id === id).reverse();

const personWithEmail = (userId: string | undefined) => {
  const u = users.find((x) => x.id === userId);
  return u ? { id: u.id, name: u.name, email: u.email } : null;
};

function venueRow(id: string): AdminVenueRow {
  const v = clubs.find((c) => c.id === id)!;
  const sub = subscriptionFor(id);
  return {
    id: v.id,
    slug: v.slug,
    name: v.name,
    city: v.city,
    province: v.province,
    status: v.status as OrgStatus,
    owner: personWithEmail(venueOwner(id)?.id),
    courts: courts.filter((c) => c.club_id === id).length,
    plan: sub.plan.name,
    subscription_status: sub.status,
    submitted_at: reviews[reviewKey("venue", id)]?.submitted_at ?? null,
  };
}

function clubRow(id: string): AdminClubRow {
  const c = communities.find((x) => x.id === id)!;
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    city: c.city,
    province: c.province,
    status: c.status as OrgStatus,
    created_by: personWithEmail(c.created_by),
    members: members.filter(
      (m) => m.organizer_type === "community" && m.organizer_id === id && m.status === "active",
    ).length,
    submitted_at: reviews[reviewKey("club", id)]?.submitted_at ?? c.created_at,
  };
}

/** Search by name, city or owner; filter by status. Waiting ones first, then by name. */
function filterRows<T extends { name: string; city: string; status: OrgStatus }>(
  rows: T[],
  url: URL,
  person: (r: T) => { name: string; email: string } | null,
) {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const status = url.searchParams.get("status");
  return rows
    .filter((r) => !status || r.status === status)
    .filter((r) => {
      if (!q) return true;
      const p = person(r);
      return [r.name, r.city, p?.name ?? "", p?.email ?? ""].some((x) => x.toLowerCase().includes(q));
    })
    .sort(
      (a, b) =>
        Number(b.status === "pending_review") - Number(a.status === "pending_review") ||
        a.name.localeCompare(b.name),
    );
}

export const adminHandlers = [
  http.get(`${API}/admin/venues`, async ({ request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    return ok(
      filterRows(
        clubs.map((c) => venueRow(c.id)),
        new URL(request.url),
        (r) => r.owner,
      ),
    );
  }),

  http.get(`${API}/admin/venues/:id`, async ({ params }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const v = clubs.find((c) => c.id === params.id || c.slug === params.id);
    if (!v) return fail(404, "This venue doesn't exist.");
    const now = new Date().toISOString();
    const week = new Date(Date.now() + 7 * DAY).toISOString();
    const place = places[v.id];
    const detail: AdminVenueDetail = {
      ...venueRow(v.id),
      address: v.address,
      contact_phone: v.contact_phone,
      contact_email: v.contact_email,
      pin: place ? { lat: place.lat, lng: place.lng } : null,
      court_list: courts
        .filter((c) => c.club_id === v.id)
        .map((c) => ({
          id: c.id,
          name: c.name,
          indoor_outdoor: c.indoor_outdoor,
          base_price: c.base_price,
          status: c.status,
        })),
      bookings_next_7_days: bookings.filter(
        (b) =>
          b.club_id === v.id &&
          b.starts_at >= now &&
          b.starts_at < week &&
          b.status !== "cancelled" &&
          b.status !== "expired",
      ).length,
      decision: decisionOf("venue", v.id),
      history: historyOf("venue", v.id),
    };
    return ok(detail);
  }),

  http.post(`${API}/admin/venues/:id/decision`, async ({ params, request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const error = decide(
      "venue",
      String(params.id),
      (await request.json()) as OrgDecisionInput,
      auth.user.id,
    );
    return error ?? ok(venueRow(String(params.id)));
  }),

  http.get(`${API}/admin/clubs`, async ({ request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    return ok(
      filterRows(
        communities.map((c) => clubRow(c.id)),
        new URL(request.url),
        (r) => r.created_by,
      ),
    );
  }),

  http.get(`${API}/admin/clubs/:id`, async ({ params }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const c = communities.find((x) => x.id === params.id || x.slug === params.id);
    if (!c) return fail(404, "This club doesn't exist.");
    const home = clubs.find((v) => v.id === c.home_venue_id);
    const detail: AdminClubDetail = {
      ...clubRow(c.id),
      tagline: c.tagline,
      description: c.description,
      contact_email: c.contact_email,
      contact_phone: c.contact_phone,
      join_policy: c.join_policy,
      home_venue: home ? { id: home.id, name: home.name } : null,
      plans: plans.filter((p) => p.organizer_type === "community" && p.organizer_id === c.id).length,
      decision: decisionOf("club", c.id),
      history: historyOf("club", c.id),
    };
    return ok(detail);
  }),

  http.post(`${API}/admin/clubs/:id/decision`, async ({ params, request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const error = decide("club", String(params.id), (await request.json()) as OrgDecisionInput, auth.user.id);
    return error ?? ok(clubRow(String(params.id)));
  }),

  http.get(`${API}/admin/dashboard`, async () => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const now = Date.now();
    const from = new Date(now).toISOString();
    const to = new Date(now + 7 * DAY).toISOString();
    const trials_ending = clubs
      .filter((c) => c.status === "active")
      .flatMap((c) => {
        const sub = subscriptionFor(c.id);
        if (sub.status !== "trialing" || !sub.trial_ends_at || sub.trial_days_left === null) return [];
        if (sub.trial_days_left > 7) return [];
        return [
          { club_id: c.id, club_name: c.name, ends_at: sub.trial_ends_at, days_left: sub.trial_days_left },
        ];
      })
      .sort((a, b) => a.ends_at.localeCompare(b.ends_at));
    // This month in Manila: "YYYY-MM" of the local date.
    const month = todayIn(TZ).slice(0, 7);
    const inMonth = (iso: string | null) =>
      !!iso && new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso)).slice(0, 7) === month;
    const subs = clubs.map((c) => subscriptionFor(c.id));
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0).toFixed(2);
    const revenue = {
      mrr: sum(subs.filter((x) => x.status === "active").map((x) => Number(x.plan.price))),
      subscriptions_paid_this_month: sum(
        subs
          .flatMap((x) => x.invoices)
          .filter((i) => i.status === "paid" && inMonth(i.paid_at))
          .map((i) => Number(i.amount)),
      ),
      subscriptions_unpaid: sum(
        subs
          .flatMap((x) => x.invoices)
          .filter((i) => i.status === "issued" || i.status === "overdue")
          .map((i) => Number(i.amount)),
      ),
      bookings_paid_this_month: sum([
        ...payments.filter((p) => p.status === "paid" && inMonth(p.received_at)).map((p) => Number(p.amount)),
        ...adjustments.filter((a) => inMonth(a.created_at)).map((a) => -Number(a.amount)),
      ]),
    };
    const result: AdminDashboard = {
      counts: {
        venues_active: clubs.filter((c) => c.status === "active").length,
        venues_pending: clubs.filter((c) => c.status === "pending_review").length,
        venues_suspended: clubs.filter((c) => c.status === "suspended").length,
        clubs_active: communities.filter((c) => c.status === "active").length,
        clubs_pending: communities.filter((c) => c.status === "pending_review").length,
        players: users.filter((u) => u.has_player_profile).length,
        bookings_next_7_days: bookings.filter(
          (b) =>
            b.starts_at >= from && b.starts_at < to && b.status !== "cancelled" && b.status !== "expired",
        ).length,
        disputes: matches.filter((m) => m.status === "disputed").length,
        sessions_next_7_days: sessions.filter(
          (s) => s.starts_at >= from && s.starts_at < to && s.status === "published",
        ).length,
      },
      revenue,
      trials_ending,
      review: reviewQueue().slice(0, 5),
      recent_activity: auditLogs.slice(-6).reverse(),
    };
    return ok(result);
  }),
];
