// Tournaments API (Phase 5, M4).
import { http } from "msw";
import type {
  EntryRef,
  TournamentDetail,
  TournamentHostOption,
  TournamentInput,
  TournamentMatchView,
  TournamentSummary,
} from "@courtflex/api";
import { finalScore, standings } from "@courtflex/api";
import { clubs, courts, person, users } from "./db";
import { canManageOrganizer, communities } from "./open-play-db";
import { matches, stateOf } from "./match-db";
import {
  activeEntries,
  entries,
  entryName,
  poolIds,
  resultsOf,
  roundName,
  startTournament,
  tmatches,
  tournaments,
  type MockTournament,
} from "./tournament-db";
import "./tournament-seed";
import { profileOf } from "./rating-db";
import { API, authorize, fail, invalid, latency, ok, sessionUser } from "./http-helpers";

const isSuperAdmin = (uid?: string) => !!users.find((u) => u.id === uid)?.super_admin;

/** Organizers: the host venue's owner and managers, the host club's owner and admins, the Super Admin. */
export function canManageTournament(t: MockTournament, uid: string | undefined) {
  if (!uid) return false;
  if (isSuperAdmin(uid) || t.created_by === uid) return true;
  return t.host.type === "venue"
    ? canManageOrganizer(uid, "venue", t.host.id, "manageOpenPlay")
    : canManageOrganizer(uid, "community", t.host.id);
}

function hostName(t: MockTournament) {
  return t.host.type === "venue"
    ? (clubs.find((c) => c.id === t.host.id)?.name ?? "Venue")
    : (communities.find((c) => c.id === t.host.id)?.name ?? "Club");
}

const ref = (entryId: string | null): EntryRef | null => {
  const e = entries.find((x) => x.id === entryId);
  return e ? { id: e.id, name: entryName(e), seed: e.seed } : null;
};

function summary(t: MockTournament): TournamentSummary {
  const venue = clubs.find((c) => c.id === t.venue_id)!;
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    host: { type: t.host.type, id: t.host.id, name: hostName(t) },
    venue: { id: venue.id, name: venue.name, city: venue.city },
    format: t.format,
    match_type: t.match_type,
    status: t.status,
    starts_at: t.starts_at,
    registration_closes_at: t.registration_closes_at,
    entries_count: activeEntries(t.id).length,
    capacity: t.capacity,
    entry_fee: t.entry_fee,
    champion: ref(t.champion_entry_id),
  };
}

function registerBlock(t: MockTournament, uid: string | undefined): string | null {
  if (t.status !== "registration") return "Registration is closed.";
  if (new Date(t.registration_closes_at).getTime() < Date.now()) return "Registration has closed.";
  if (activeEntries(t.id).length >= t.capacity) return "The draw is full.";
  if (!uid) return "Sign in to register.";
  if (!users.find((u) => u.id === uid)?.has_player_profile) return "Set up a player profile to register.";
  if (activeEntries(t.id).some((e) => e.players.includes(uid))) return "You're registered.";
  return null;
}

function detail(t: MockTournament, uid: string | undefined): TournamentDetail {
  const mine = tmatches.filter((x) => x.tournament_id === t.id);
  const koRounds = Math.max(0, ...mine.filter((x) => x.stage === "knockout").map((x) => x.round));
  const views: TournamentMatchView[] = mine
    .sort(
      (a, b) =>
        ["pool", "round_robin", "knockout"].indexOf(a.stage) -
          ["pool", "round_robin", "knockout"].indexOf(b.stage) ||
        (a.pool ?? "").localeCompare(b.pool ?? "") ||
        a.round - b.round ||
        a.slot - b.slot,
    )
    .map((x) => {
      const m = matches.find((mm) => mm.id === x.match_id);
      const state = m ? stateOf(m) : null;
      return {
        id: x.id,
        stage: x.stage,
        round: x.round,
        round_name: x.stage === "knockout" ? roundName(x.round, koRounds) : `Round ${x.round}`,
        pool: x.pool,
        slot: x.slot,
        entries: [ref(x.a), ref(x.b)],
        bye: x.bye,
        winner_entry_id: x.winner,
        match: m
          ? {
              id: m.id,
              status: m.status,
              score: state && state.rallies > 0 ? finalScore(state) : "",
              winner: m.status === "completed" ? state!.winner : null,
              court: courts.find((c) => c.id === m.court_id)?.name ?? null,
            }
          : null,
      };
    });
  const groups = t.status === "registration" ? new Map() : poolIds(t);
  const tables = [...groups].map(([pool, ids]: [string | null, string[]]) => ({
    pool,
    rows: standings(ids, resultsOf(t, pool === null ? "round_robin" : "pool", pool)).map((r) => ({
      ...r,
      entry: ref(r.id)!,
    })),
  }));
  const myEntry = uid ? activeEntries(t.id).find((e) => e.players.includes(uid)) : undefined;
  const block = registerBlock(t, uid);
  return {
    ...summary(t),
    description: t.description,
    game: t.game,
    courts: t.court_ids.map((cid) => ({ id: cid, name: courts.find((c) => c.id === cid)?.name ?? "Court" })),
    pools: t.pools,
    entries: activeEntries(t.id)
      .map((e) => ({
        id: e.id,
        name: entryName(e),
        seed: e.seed,
        players: e.players.map(person),
        rating:
          e.rating ??
          Math.round(
            e.players.reduce((a, p) => a + (profileRating(p, t.match_type) ?? 1200), 0) / e.players.length,
          ),
      }))
      .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99) || b.rating - a.rating),
    matches: views,
    standings: tables,
    my_entry_id: myEntry?.id ?? null,
    can_manage: canManageTournament(t, uid),
    can_register: block === null,
    register_note: block === "You're registered." ? null : block,
    cancel_reason: t.cancel_reason,
  };
}

const profileRating = (p: string, type: "singles" | "doubles") => profileOf(p, type).rating;

const find = (idOrSlug: unknown) => tournaments.find((t) => t.id === idOrSlug || t.slug === idOrSlug);

function signedIn() {
  const user = sessionUser();
  return user
    ? ({ user, error: null } as const)
    : ({ error: fail(401, "Your session has ended. Sign in again.") } as const);
}

/** Venues (owner or manager) and clubs (owner or admin) the person can host for. */
function hostOptions(uid: string): TournamentHostOption[] {
  const all = isSuperAdmin(uid);
  const venues = clubs.filter(
    (c) => c.status === "active" && (all || canManageOrganizer(uid, "venue", c.id, "manageOpenPlay")),
  );
  const clubsRun = communities.filter(
    (c) => c.status === "active" && (all || canManageOrganizer(uid, "community", c.id)),
  );
  return [
    ...venues.map((v) => ({ type: "venue" as const, id: v.id, name: v.name, venue_id: v.id })),
    ...clubsRun.map((c) => ({
      type: "community" as const,
      id: c.id,
      name: c.name,
      venue_id: c.home_venue_id,
    })),
  ];
}

export const tournamentHandlers = [
  http.get(`${API}/tournaments`, async ({ request }) => {
    await latency();
    const status = new URL(request.url).searchParams.get("status");
    const rank = { in_progress: 0, registration: 1, completed: 2, cancelled: 3 };
    return ok(
      tournaments
        .filter((t) => (status ? t.status === status : t.status !== "cancelled"))
        .sort((a, b) => rank[a.status] - rank[b.status] || a.starts_at.localeCompare(b.starts_at))
        .map(summary),
    );
  }),

  http.get(`${API}/tournaments/hosting-options`, async () => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    return ok(hostOptions(auth.user.id));
  }),

  http.get(`${API}/clubs/:club/tournaments`, async ({ params }) => {
    await latency();
    const auth = authorize(String(params.club), "viewBookings");
    if (auth.error) return auth.error;
    return ok(
      tournaments
        .filter((t) => t.venue_id === auth.club.id || (t.host.type === "venue" && t.host.id === auth.club.id))
        .map(summary),
    );
  }),

  http.get(`${API}/tournaments/:id`, async ({ params }) => {
    const t = find(params.id);
    if (!t) return fail(404, "This tournament doesn't exist.");
    return ok(detail(t, sessionUser()?.id));
  }),

  http.post(`${API}/tournaments`, async ({ request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const uid = auth.user.id;
    const b = (await request.json()) as Partial<TournamentInput>;
    const errors: Record<string, string[]> = {};
    const host = b.host && hostOptions(uid).find((h) => h.type === b.host!.type && h.id === b.host!.id);
    if (!host) errors.host = ["Choose a venue or club you run."];
    const name = b.name?.trim() ?? "";
    if (name.length < 3 || name.length > 80) errors.name = ["Use 3 to 80 characters."];
    if (b.match_type !== "singles" && b.match_type !== "doubles")
      errors.match_type = ["Choose singles or doubles."];
    if (!["single_elimination", "round_robin", "pool_knockout"].includes(b.format ?? ""))
      errors.format = ["Choose a format."];
    const g = b.game;
    if (
      !g ||
      ![11, 15, 21].includes(g.target) ||
      ![1, 3].includes(g.best_of) ||
      !["side_out", "rally"].includes(g.scoring)
    )
      errors.game = ["Choose the game rules."];
    const venue = clubs.find((c) => c.id === b.venue_id && c.status === "active");
    if (!venue) errors.venue_id = ["Choose the venue."];
    else if (host?.type === "venue" && venue.id !== host.id)
      errors.venue_id = ["A venue hosts at its own courts."];
    const courtIds = (b.court_ids ?? []).filter((c) =>
      courts.some((x) => x.id === c && x.club_id === venue?.id),
    );
    if (venue && (courtIds.length === 0 || courtIds.length !== (b.court_ids ?? []).length))
      errors.court_ids = ["Choose at least one of the venue's courts."];
    const starts = new Date(b.starts_at ?? "");
    const closes = new Date(b.registration_closes_at ?? "");
    if (Number.isNaN(starts.getTime()) || starts.getTime() < Date.now())
      errors.starts_at = ["Choose a start in the future."];
    if (Number.isNaN(closes.getTime()) || closes.getTime() < Date.now())
      errors.registration_closes_at = ["Choose when registration closes, in the future."];
    else if (!errors.starts_at && closes > starts)
      errors.registration_closes_at = ["Close registration before the tournament starts."];
    const cap = Number(b.capacity);
    if (!Number.isInteger(cap) || cap < 4 || cap > 32) errors.capacity = ["Choose 4 to 32 entries."];
    const fee = Number(b.entry_fee ?? 0);
    if (!Number.isFinite(fee) || fee < 0 || fee > 5000) errors.entry_fee = ["Enter ₱0 to ₱5,000."];
    const pools = b.format === "pool_knockout" ? Number(b.pools ?? 2) : null;
    if (pools !== null && (!Number.isInteger(pools) || pools < 2 || pools > 4))
      errors.pools = ["Choose 2 to 4 pools."];
    else if (pools !== null && Number.isInteger(cap) && cap < pools * 3)
      errors.capacity = [`${pools} pools need at least ${pools * 3} entries.`];
    if (Object.keys(errors).length) return invalid(errors);

    let slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    while (tournaments.some((t) => t.slug === slug)) slug += "-2";
    const t: MockTournament = {
      id: `t-${tournaments.length + 1}-${Date.now() % 100000}`,
      slug,
      name,
      description: b.description?.trim() ?? "",
      host: { type: host!.type, id: host!.id },
      venue_id: venue!.id,
      court_ids: courtIds,
      match_type: b.match_type!,
      format: b.format!,
      game: { target: g!.target, win_by: 2, best_of: g!.best_of, scoring: g!.scoring },
      starts_at: starts.toISOString(),
      registration_closes_at: closes.toISOString(),
      capacity: cap,
      entry_fee: fee.toFixed(2),
      pools,
      status: "registration",
      champion_entry_id: null,
      cancel_reason: null,
      created_by: uid,
      created_at: new Date().toISOString(),
    };
    tournaments.push(t);
    return ok(detail(t, uid), 201);
  }),

  http.post(`${API}/tournaments/:id/register`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const t = find(params.id);
    if (!t) return fail(404, "This tournament doesn't exist.");
    const block = registerBlock(t, auth.user.id);
    if (block) return fail(409, block);
    const { partner_id } = (await request.json()) as { partner_id?: string };
    const players = [auth.user.id];
    if (t.match_type === "doubles") {
      const partner = users.find((u) => u.id === partner_id && u.has_player_profile);
      if (!partner || partner.id === auth.user.id) return invalid({ partner_id: ["Choose your partner."] });
      if (activeEntries(t.id).some((e) => e.players.includes(partner.id)))
        return invalid({ partner_id: [`${partner.name} is already in this tournament.`] });
      players.push(partner.id);
    }
    entries.push({
      id: `te-${entries.length + 1}-${Date.now() % 100000}`,
      tournament_id: t.id,
      players,
      seed: null,
      rating: null,
      status: "registered",
      registered_by: auth.user.id,
      registered_at: new Date().toISOString(),
    });
    return ok(detail(t, auth.user.id), 201);
  }),

  http.post(`${API}/tournaments/:id/withdraw`, async ({ params }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const t = find(params.id);
    if (!t) return fail(404, "This tournament doesn't exist.");
    const e = activeEntries(t.id).find((x) => x.players.includes(auth.user.id));
    if (!e) return fail(409, "You're not registered.");
    if (t.status !== "registration")
      return fail(409, "The draw is made. Ask the organizer if you can't play.");
    e.status = "withdrawn";
    return ok(detail(t, auth.user.id));
  }),

  http.post(`${API}/tournaments/:id/start`, async ({ params }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const t = find(params.id);
    if (!t) return fail(404, "This tournament doesn't exist.");
    if (!canManageTournament(t, auth.user.id))
      return fail(403, "Only the tournament's organizers can start it.");
    if (t.status !== "registration") return fail(409, "This tournament has already started.");
    const n = activeEntries(t.id).length;
    const need = t.format === "single_elimination" ? 2 : t.format === "round_robin" ? 3 : (t.pools ?? 2) * 2;
    if (n < need) return fail(409, `It needs at least ${need} entries to start; it has ${n}.`);
    startTournament(t);
    return ok(detail(t, auth.user.id));
  }),

  http.post(`${API}/tournaments/:id/cancel`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const t = find(params.id);
    if (!t) return fail(404, "This tournament doesn't exist.");
    if (!canManageTournament(t, auth.user.id))
      return fail(403, "Only the tournament's organizers can cancel it.");
    if (t.status === "completed" || t.status === "cancelled")
      return fail(409, "This tournament is already over.");
    const { reason } = (await request.json()) as { reason?: string };
    if ((reason?.trim().length ?? 0) < 10)
      return invalid({ reason: ["Say why in a sentence (at least 10 characters)."] });
    t.status = "cancelled";
    t.cancel_reason = reason!.trim();
    // Matches not played yet are void; finished ones stay in history.
    for (const tm of tmatches.filter((x) => x.tournament_id === t.id)) {
      const m = matches.find((x) => x.id === tm.match_id);
      if (m && (m.status === "scheduled" || m.status === "in_progress")) {
        m.status_history.push({
          from: m.status,
          to: "voided",
          by: auth.user.id,
          at: new Date().toISOString(),
          reason: t.cancel_reason,
        });
        m.status = "voided";
        m.void_reason = t.cancel_reason;
      }
    }
    return ok(detail(t, auth.user.id));
  }),
];
