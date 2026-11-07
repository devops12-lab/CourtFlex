// Matches and the Live Scorer (Phase 5, M1; blueprint §9.6, §12.5, §13.4).
import { notify } from "./notify-db";
import { http } from "msw";
import type {
  MatchDetail,
  MatchInput,
  MatchResultView,
  MatchStatus,
  MatchSummary,
  PlayerStats,
  RatingSummary,
  ScoreEventView,
  Side,
} from "@courtflex/api";
import { finalScore, replay } from "@courtflex/api";
import { clubs, courts, nextId, person, users } from "./db";
import { canManageOrganizer, canManageSession, participants, queues, sessions } from "./open-play-db";
import { eventsOf, inputsOf, matches, scoreEvents, stateOf, type MockMatch } from "./match-db";
import { isProvisional, profileOf, ratingEvents, ratingRules } from "./rating-db";
import { completeMatch, replaceVoidedMatch, tournaments } from "./tournament-db";
import { canManageTournament } from "./handlers-tournaments";
import { skillOf } from "./open-play-db";
import { board, homeAreas } from "./ranking-db";
import { API, authorize, fail, invalid, latency, ok, sessionUser } from "./http-helpers";

const isSuperAdmin = (uid: string | undefined) => !!users.find((u) => u.id === uid)?.super_admin;

/** Organizers: the creator, the open play session's managers, the venue's staff, the Super Admin. */
function canManage(m: MockMatch, uid: string | undefined) {
  if (!uid) return false;
  if (isSuperAdmin(uid) || m.created_by === uid) return true;
  const s = m.session_id ? sessions.find((x) => x.id === m.session_id) : undefined;
  if (s && canManageSession(uid, s)) return true;
  const t = m.tournament_id ? tournaments.find((x) => x.id === m.tournament_id) : undefined;
  if (t && canManageTournament(t, uid)) return true;
  return !!m.venue_id && canManageOrganizer(uid, "venue", m.venue_id, "createWalkInBooking");
}

const canScore = (m: MockMatch, uid: string | undefined) =>
  !!uid && (m.scorer_id === uid || canManage(m, uid));

export function summary(m: MockMatch): MatchSummary {
  const state = stateOf(m);
  const venue = clubs.find((c) => c.id === m.venue_id);
  const court = courts.find((c) => c.id === m.court_id);
  const session = sessions.find((s) => s.id === m.session_id);
  return {
    id: m.id,
    match_type: m.match_type,
    category: m.category,
    status: m.status,
    format: m.format,
    teams: [m.teams[0].map(person), m.teams[1].map(person)],
    score: state.rallies > 0 ? finalScore(state) : "",
    winner: m.status === "in_progress" || m.status === "scheduled" ? null : state.winner,
    awaiting_side: m.status === "awaiting_confirmation" ? awaitingSide(m) : null,
    venue: venue ? { id: venue.id, name: venue.name } : null,
    court: court ? { id: court.id, name: court.name } : null,
    session: session ? { id: session.id, title: session.title } : null,
    scorer: person(m.scorer_id),
    created_by: person(m.created_by),
    created_at: m.created_at,
    started_at: m.started_at,
    ended_at: m.ended_at,
  };
}

const AUTO_VERIFY_MS = 48 * 3_600_000;

/** The side that confirms: the one the submitter isn't on. Null when an organizer who isn't playing submitted. */
function awaitingSide(m: MockMatch): Side | null {
  const by = m.result?.submitted_by;
  if (!by) return null;
  if (m.teams[0].includes(by)) return 1;
  if (m.teams[1].includes(by)) return 0;
  return null;
}

/** Organizers who aren't playing (and the Super Admin) can make a result official. */
const canVerify = (m: MockMatch, uid: string | undefined) =>
  !!uid && (isSuperAdmin(uid) || (canManage(m, uid) && !m.teams.flat().includes(uid)));

function resultView(m: MockMatch): MatchResultView | null {
  const r = m.result;
  if (!r) return null;
  return {
    submitted_by: person(r.submitted_by),
    submitted_at: r.submitted_at,
    awaiting_side: awaitingSide(m),
    confirmations: r.confirmations.map((c) => ({ player: person(c.player_id), at: c.at })),
    dispute: r.dispute
      ? {
          by: person(r.dispute.by),
          reason: r.dispute.reason,
          at: r.dispute.at,
          resolution: r.dispute.resolution
            ? { ...r.dispute.resolution, by: person(r.dispute.resolution.by) }
            : null,
        }
      : null,
    verified_at: r.verified_at,
    verified_by: r.verified_by ? person(r.verified_by) : null,
    auto_verify_at:
      m.status === "awaiting_confirmation"
        ? new Date(new Date(r.submitted_at).getTime() + AUTO_VERIFY_MS).toISOString()
        : null,
  };
}

function detail(m: MockMatch, viewer: string | undefined): MatchDetail {
  const side = awaitingSide(m);
  const waiting = m.status === "awaiting_confirmation";
  return {
    ...summary(m),
    first_serving: m.first_serving,
    state: stateOf(m),
    version: eventsOf(m.id).length,
    can_score: canScore(m, viewer) && (m.status === "scheduled" || m.status === "in_progress"),
    can_manage: canManage(m, viewer),
    can_confirm:
      waiting &&
      !!viewer &&
      side !== null &&
      m.teams[side].includes(viewer) &&
      !m.result!.confirmations.some((c) => c.player_id === viewer),
    can_dispute: waiting && !!viewer && m.teams.flat().includes(viewer),
    can_verify: (waiting || m.status === "disputed") && canVerify(m, viewer),
    result: resultView(m),
    ratings: ratingEvents
      .filter((e) => e.match_id === m.id)
      .map((e) => ({ player: person(e.player_id), old: e.old, change: e.change, new: e.new })),
  };
}

/** Makes a result official and rates it (competitive only). `by` null: automatically. */
function verify(m: MockMatch, by: string | null) {
  completeMatch(m, by);
}

/** Results waiting 48 hours with no dispute become official (run whenever matches are read). */
export function settleDue() {
  const now = Date.now();
  for (const m of matches) {
    if (
      m.status === "awaiting_confirmation" &&
      m.result &&
      now - new Date(m.result.submitted_at).getTime() >= AUTO_VERIFY_MS
    )
      verify(m, null);
  }
}

function setStatus(m: MockMatch, to: MatchStatus, by: string, reason: string | null = null) {
  m.status_history.push({ from: m.status, to, by, at: new Date().toISOString(), reason });
  m.status = to;
}

/** Live first, then about to start, then the most recent. */
function order(list: MockMatch[]) {
  const rank = (s: MatchStatus) => (s === "in_progress" ? 0 : s === "scheduled" ? 1 : 2);
  return [...list].sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      (b.ended_at ?? b.started_at ?? b.created_at).localeCompare(a.ended_at ?? a.started_at ?? a.created_at),
  );
}

function signedIn() {
  const user = sessionUser();
  return user
    ? ({ user, error: null } as const)
    : ({ error: fail(401, "Your session has ended. Sign in again.") } as const);
}

function findMatch(id: unknown) {
  return matches.find((m) => m.id === id);
}

export const matchHandlers = [
  http.get(`${API}/player/matches`, async () => {
    await latency();
    settleDue();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const uid = auth.user.id;
    return ok(
      order(
        matches.filter((m) => m.teams.flat().includes(uid) || m.scorer_id === uid || m.created_by === uid),
      ).map(summary),
    );
  }),

  http.get(`${API}/clubs/:club/matches`, async ({ params }) => {
    await latency();
    const auth = authorize(String(params.club), "viewBookings");
    if (auth.error) return auth.error;
    return ok(order(matches.filter((m) => m.venue_id === auth.club.id)).map(summary));
  }),

  http.post(`${API}/matches`, async ({ request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const uid = auth.user.id;
    const body = (await request.json()) as Partial<MatchInput>;
    const errors: Record<string, string[]> = {};

    const type = body.match_type;
    if (type !== "singles" && type !== "doubles") errors.match_type = ["Choose singles or doubles."];
    if (body.category !== "casual" && body.category !== "competitive")
      errors.category = ["Choose casual or competitive."];
    const f = body.format;
    if (
      !f ||
      ![11, 15, 21].includes(f.target) ||
      ![1, 2].includes(f.win_by) ||
      ![1, 3].includes(f.best_of) ||
      !["side_out", "rally"].includes(f.scoring)
    )
      errors.format = ["Choose a game format."];

    // Teams: from the open play queue game when scoring one, otherwise as sent.
    let teamA = body.team_a ?? [];
    let teamB = body.team_b ?? [];
    const session = body.session_id ? sessions.find((s) => s.id === body.session_id) : undefined;
    if (body.session_id && !session) return fail(404, "That open play session doesn't exist.");
    if (session && !canManageSession(uid, session))
      return fail(403, "Only the session's host and the venue's staff can start matches for it.");
    if (body.queue_game_id) {
      const g = session && queues[session.id]?.games.find((x) => x.id === body.queue_game_id);
      if (!g) return invalid({ queue_game_id: ["That game isn't on a court in this session."] });
      if (g.ended_at) return fail(409, "That game has already finished.");
      if (matches.some((m) => m.queue_game_id === g.id && m.status !== "voided"))
        return fail(409, "This game is already being scored.");
      const playerOf = (pid: string) => participants.find((p) => p.id === pid)!.player_id;
      teamA = g.team_a.map(playerOf);
      teamB = g.team_b.map(playerOf);
      body.court_id = g.court_id;
    }
    const size = type === "singles" ? 1 : 2;
    if (type && (teamA.length !== size || teamB.length !== size))
      errors.teams = [
        type === "singles" ? "Choose one player on each side." : "Choose two players on each side.",
      ];
    const everyone = [...teamA, ...teamB];
    if (everyone.some((id) => !users.some((u) => u.id === id && u.has_player_profile)))
      errors.teams = ["Choose players with a CourtFlex player profile."];
    else if (new Set(everyone).size !== everyone.length)
      errors.teams = ["A player can only be on one side, once."];
    if (body.first_serving !== 0 && body.first_serving !== 1)
      errors.first_serving = ["Choose who serves first."];

    // Where it's played, and who may set that.
    const court = body.court_id ? courts.find((c) => c.id === body.court_id) : undefined;
    if (body.court_id && !court) errors.court_id = ["That court doesn't exist."];
    const venueId =
      court?.club_id ??
      (session?.organizer_type === "venue" ? session.organizer_id : session?.venue_id) ??
      null;
    if (
      court &&
      !session &&
      !isSuperAdmin(uid) &&
      !canManageOrganizer(uid, "venue", court.club_id, "createWalkInBooking")
    )
      errors.court_id = ["Only the venue's staff can put a match on its court."];
    if (session && court && !session.court_ids.includes(court.id))
      errors.court_id = ["Choose one of the session's courts."];
    // Players logging their own match must be in it.
    if (!session && !court && !isSuperAdmin(uid) && !everyone.includes(uid))
      errors.teams = ["Add yourself to one of the sides, or ask an organizer to set up the match."];

    const scorerId = body.scorer_id ?? uid;
    if (!users.some((u) => u.id === scorerId)) errors.scorer_id = ["Choose who keeps score."];
    if (Object.keys(errors).length) return invalid(errors);

    const now = new Date().toISOString();
    const m: MockMatch = {
      id: nextId("m"),
      match_type: type!,
      category: body.category!,
      format: { target: f!.target, win_by: f!.win_by, best_of: f!.best_of, scoring: f!.scoring },
      status: "scheduled",
      teams: [teamA, teamB],
      first_serving: body.first_serving!,
      venue_id: venueId,
      court_id: court?.id ?? null,
      session_id: session?.id ?? null,
      queue_game_id: body.queue_game_id ?? null,
      tournament_id: null,
      scorer_id: scorerId,
      created_by: uid,
      created_at: now,
      started_at: null,
      ended_at: null,
      void_reason: null,
      status_history: [{ from: null, to: "scheduled", by: uid, at: now, reason: null }],
    };
    matches.push(m);
    return ok(detail(m, uid), 201);
  }),

  /** Public: anyone can watch a match. */
  http.get(`${API}/matches/:id`, async ({ params }) => {
    settleDue();
    const m = findMatch(params.id);
    if (!m) return fail(404, "This match doesn't exist.");
    return ok(detail(m, sessionUser()?.id));
  }),

  http.get(`${API}/matches/:id/events`, async ({ params }) => {
    await latency();
    const m = findMatch(params.id);
    if (!m) return fail(404, "This match doesn't exist.");
    const inputs = inputsOf(m.id);
    const views: ScoreEventView[] = eventsOf(m.id).map((e, i) => {
      const after = replay(inputs.slice(0, i + 1), m.format, m.match_type, m.first_serving);
      return {
        seq: e.seq,
        type: e.type,
        winner: e.winner,
        called_after: after.called,
        game: after.current + 1,
        scorer: person(e.scorer_id),
        at: e.created_at,
      };
    });
    return ok(views.reverse());
  }),

  http.post(`${API}/matches/:id/start`, async ({ params }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const m = findMatch(params.id);
    if (!m) return fail(404, "This match doesn't exist.");
    if (!canScore(m, auth.user.id)) return fail(403, "Only the scorer or an organizer can start this match.");
    if (m.status !== "scheduled") return fail(409, "This match has already started.");
    m.started_at = new Date().toISOString();
    setStatus(m, "in_progress", auth.user.id);
    return ok(detail(m, auth.user.id));
  }),

  http.post(`${API}/matches/:id/score-events`, async ({ params, request }) => {
    const auth = signedIn();
    if (auth.error) return auth.error;
    const m = findMatch(params.id);
    if (!m) return fail(404, "This match doesn't exist.");
    const body = (await request.json()) as { event_uuid?: string; winner?: Side };
    if (!body.event_uuid) return invalid({ event_uuid: ["Send an id for this point."] });
    // A retry of a point already recorded: answer with the current score, add nothing.
    if (scoreEvents.some((e) => e.match_id === m.id && e.event_uuid === body.event_uuid))
      return ok(detail(m, auth.user.id));
    if (!canScore(m, auth.user.id)) return fail(403, "Only the scorer or an organizer can score this match.");
    if (m.status !== "in_progress") return fail(409, "This match isn't being played.");
    if (body.winner !== 0 && body.winner !== 1)
      return invalid({ winner: ["Choose which side won the rally."] });
    if (stateOf(m).winner !== null)
      return fail(409, "The match is over. Submit the result, or undo the last point.");
    scoreEvents.push({
      id: nextId("se"),
      match_id: m.id,
      seq: eventsOf(m.id).length + 1,
      event_uuid: body.event_uuid,
      type: "rally",
      winner: body.winner,
      scorer_id: auth.user.id,
      created_at: new Date().toISOString(),
    });
    return ok(detail(m, auth.user.id));
  }),

  http.post(`${API}/matches/:id/undo`, async ({ params, request }) => {
    const auth = signedIn();
    if (auth.error) return auth.error;
    const m = findMatch(params.id);
    if (!m) return fail(404, "This match doesn't exist.");
    const body = (await request.json()) as { event_uuid?: string };
    if (!body.event_uuid) return invalid({ event_uuid: ["Send an id for this undo."] });
    if (scoreEvents.some((e) => e.match_id === m.id && e.event_uuid === body.event_uuid))
      return ok(detail(m, auth.user.id));
    if (!canScore(m, auth.user.id)) return fail(403, "Only the scorer or an organizer can score this match.");
    if (m.status !== "in_progress") return fail(409, "This match isn't being played.");
    if (stateOf(m).rallies === 0) return fail(409, "There's no point to undo.");
    scoreEvents.push({
      id: nextId("se"),
      match_id: m.id,
      seq: eventsOf(m.id).length + 1,
      event_uuid: body.event_uuid,
      type: "undo",
      winner: null,
      scorer_id: auth.user.id,
      created_at: new Date().toISOString(),
    });
    return ok(detail(m, auth.user.id));
  }),

  http.post(`${API}/matches/:id/submit-result`, async ({ params }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const m = findMatch(params.id);
    if (!m) return fail(404, "This match doesn't exist.");
    if (!canScore(m, auth.user.id))
      return fail(403, "Only the scorer or an organizer can submit the result.");
    if (m.status !== "in_progress") return fail(409, "This match isn't being played.");
    if (stateOf(m).winner === null) return fail(409, "The match isn't over yet.");
    m.ended_at = new Date().toISOString();
    m.result = {
      submitted_by: auth.user.id,
      submitted_at: m.ended_at,
      confirmations: [],
      dispute: null,
      verified_at: null,
      verified_by: null,
    };
    if (m.category === "casual") {
      // Casual: in everyone's history, never rated.
      m.result.verified_at = m.ended_at;
      m.result.verified_by = auth.user.id;
      setStatus(m, "completed", auth.user.id);
    } else if (awaitingSide(m) === null) {
      // Submitted by an organizer who isn't playing: official now.
      setStatus(m, "awaiting_confirmation", auth.user.id);
      verify(m, auth.user.id);
    } else {
      // The other side confirms (or it's official in 48 hours with no dispute).
      setStatus(m, "awaiting_confirmation", auth.user.id);
      const side = awaitingSide(m)!;
      const score = finalScore(stateOf(m));
      for (const pid of m.teams[side])
        notify(
          pid,
          "matches",
          "result_to_confirm",
          "Confirm your result",
          `${person(auth.user.id).name.split(" ")[0]} submitted ${score}. Confirm it, or dispute it if it's wrong. It's official in 48 hours otherwise.`,
          `/matches/${m.id}`,
        );
    }
    return ok(detail(m, auth.user.id));
  }),

  // Mock-only: ages one match's pending result past the 48-hour mark, to see it become official.
  http.post(`${API}/__mock/age-result/:id`, ({ params }) => {
    const m = findMatch(params.id);
    if (!m?.result) return fail(404, "No result to age.");
    m.result.submitted_at = new Date(Date.now() - 49 * 3_600_000).toISOString();
    return ok({ aged: m.id });
  }),

  // ── Confirm, dispute, verify (M2) ──────────────────────
  http.post(`${API}/matches/:id/confirm-result`, async ({ params }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const m = findMatch(params.id);
    if (!m) return fail(404, "This match doesn't exist.");
    if (m.status !== "awaiting_confirmation") return fail(409, "This result isn't waiting for confirmation.");
    const side = awaitingSide(m);
    if (side === null || !m.teams[side].includes(auth.user.id))
      return fail(403, "Only a player on the other side confirms this result.");
    m.result!.confirmations.push({ player_id: auth.user.id, at: new Date().toISOString() });
    verify(m, auth.user.id);
    return ok(detail(m, auth.user.id));
  }),

  http.post(`${API}/matches/:id/dispute`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const m = findMatch(params.id);
    if (!m) return fail(404, "This match doesn't exist.");
    if (!m.teams.flat().includes(auth.user.id))
      return fail(403, "Only the players in the match can dispute it.");
    if (m.status !== "awaiting_confirmation")
      return fail(
        409,
        m.status === "disputed" ? "This result is already disputed." : "This result can't be disputed now.",
      );
    const { reason } = (await request.json()) as { reason?: string };
    if ((reason?.trim().length ?? 0) < 10)
      return invalid({ reason: ["Say what's wrong in a sentence (at least 10 characters)."] });
    m.result!.dispute = { by: auth.user.id, reason: reason!.trim(), at: new Date().toISOString() };
    setStatus(m, "disputed", auth.user.id, reason!.trim());
    for (const pid of new Set([...m.teams.flat(), m.created_by]))
      if (pid !== auth.user.id)
        notify(
          pid,
          "matches",
          "result_disputed",
          "A result was disputed",
          `${person(auth.user.id).name} disputed it: "${reason!.trim()}" It doesn't count until it's settled.`,
          `/matches/${m.id}`,
        );
    return ok(detail(m, auth.user.id));
  }),

  http.post(`${API}/matches/:id/verify`, async ({ params }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const m = findMatch(params.id);
    if (!m) return fail(404, "This match doesn't exist.");
    if (!canVerify(m, auth.user.id))
      return fail(
        403,
        "Only an organizer who isn't playing, or the Super Admin, can make this result official.",
      );
    if (m.status !== "awaiting_confirmation" && m.status !== "disputed")
      return fail(409, "This result isn't waiting for a decision.");
    verify(m, auth.user.id);
    return ok(detail(m, auth.user.id));
  }),

  // ── Statistics (M2) ────────────────────────────────────
  http.get(`${API}/players/:id/stats`, async ({ params }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    settleDue();
    const id = params.id === "me" ? auth.user.id : String(params.id);
    const u = users.find((x) => x.id === id && x.has_player_profile);
    if (!u) return fail(404, "This player doesn't exist.");
    const summary1 = (type: "singles" | "doubles"): RatingSummary => {
      const p = profileOf(id, type);
      return {
        type,
        rating: p.rating,
        provisional: isProvisional(p),
        games: p.games,
        wins: p.wins,
        losses: p.losses,
        matches_to_rank: Math.max(ratingRules.provisional_matches - p.games, 0),
      };
    };
    const finished = matches
      .filter((m) => m.teams.flat().includes(id) && m.status === "completed")
      .sort((a, b) => (a.ended_at ?? "").localeCompare(b.ended_at ?? ""));
    const won = (m: MockMatch) => {
      const w = stateOf(m).winner;
      return w !== null && m.teams[w].includes(id);
    };
    const history = (type: "singles" | "doubles") =>
      ratingEvents
        .filter((e) => e.player_id === id && e.type === type)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((e) => ({ at: e.created_at, rating: e.new }));
    const result: PlayerStats = {
      player: { id: u.id, name: u.name, home_city: u.home_city, skill: skillOf(u.id) },
      ratings: { singles: summary1("singles"), doubles: summary1("doubles") },
      totals: {
        played: finished.length,
        wins: finished.filter(won).length,
        losses: finished.filter((m) => !won(m)).length,
        casual: finished.filter((m) => m.category === "casual").length,
      },
      form: finished.slice(-5).map((m) => (won(m) ? "W" : "L")),
      history: { singles: history("singles"), doubles: history("doubles") },
      recent: [...finished].reverse().slice(0, 10).map(summary),
      ranks: (["singles", "doubles"] as const).flatMap((type) =>
        homeAreas(id).flatMap((area) => {
          const b = board(type, area.scope, area.id, auth.user.id);
          const row = b.ranked.find((e) => e.player.id === id);
          return row ? [{ type, area, rank: row.rank!, of: b.ranked.length }] : [];
        }),
      ),
    };
    return ok(result);
  }),

  http.post(`${API}/matches/:id/scorer`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const m = findMatch(params.id);
    if (!m) return fail(404, "This match doesn't exist.");
    if (!canManage(m, auth.user.id)) return fail(403, "Only the match's organizer can change the scorer.");
    const { scorer_id } = (await request.json()) as { scorer_id?: string };
    if (!users.some((u) => u.id === scorer_id)) return invalid({ scorer_id: ["Choose who keeps score."] });
    if (m.status !== "scheduled" && m.status !== "in_progress")
      return fail(409, "The scorer can only change before the result is in.");
    m.scorer_id = scorer_id!;
    return ok(detail(m, auth.user.id));
  }),

  http.post(`${API}/matches/:id/void`, async ({ params, request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const m = findMatch(params.id);
    if (!m) return fail(404, "This match doesn't exist.");
    if (!canManage(m, auth.user.id)) return fail(403, "Only the match's organizer can void it.");
    const { reason } = (await request.json()) as { reason?: string };
    if ((reason?.trim().length ?? 0) < 10)
      return invalid({ reason: ["Say why in a sentence (at least 10 characters)."] });
    if (m.status === "completed" || m.status === "voided")
      return fail(
        409,
        m.status === "voided" ? "This match is already void." : "A completed match can't be voided.",
      );
    m.void_reason = reason!.trim();
    m.ended_at ??= new Date().toISOString();
    setStatus(m, "voided", auth.user.id, m.void_reason);
    // A voided tournament match is replayed: its draw slot gets a fresh match.
    if (m.tournament_id) replaceVoidedMatch(m);
    return ok(detail(m, auth.user.id));
  }),
];
