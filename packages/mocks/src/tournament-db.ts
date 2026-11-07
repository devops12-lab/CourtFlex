// Tournaments (Phase 5, M4): entries, the draw, and moving winners on.
// Tournament matches are ordinary matches (category "tournament"); when one
// becomes official, `completeMatch` moves its winner through the draw.
import { notify } from "./notify-db";
import type { MatchFormat, MatchType, Side, TournamentFormat, TournamentStatus } from "@courtflex/api";
import {
  RATING_VERSION,
  bracketSize,
  finalScore,
  roundRobin,
  seedOrder,
  snakePools,
  standings,
} from "@courtflex/api";
import { courts, users } from "./db";
import { matches, stateOf, type MockMatch } from "./match-db";
import { profileOf, rateMatch, ratingEvents } from "./rating-db";

export interface MockTournament {
  id: string;
  slug: string;
  name: string;
  description: string;
  host: { type: "venue" | "community"; id: string };
  venue_id: string;
  court_ids: string[];
  match_type: MatchType;
  format: TournamentFormat;
  game: MatchFormat;
  starts_at: string;
  registration_closes_at: string;
  capacity: number;
  entry_fee: string;
  pools: number | null;
  status: TournamentStatus;
  champion_entry_id: string | null;
  cancel_reason: string | null;
  created_by: string;
  created_at: string;
}

export interface MockEntry {
  id: string;
  tournament_id: string;
  players: string[];
  seed: number | null;
  /** Rating used for seeding, fixed when the draw is made. */
  rating: number | null;
  status: "registered" | "withdrawn";
  registered_by: string;
  registered_at: string;
}

export interface MockTMatch {
  id: string;
  tournament_id: string;
  stage: "knockout" | "round_robin" | "pool";
  pool: string | null;
  round: number;
  slot: number;
  a: string | null;
  b: string | null;
  bye: boolean;
  winner: string | null;
  match_id: string | null;
  /** Knockout: where the winner goes next. */
  next: { id: string; side: 0 | 1 } | null;
}

export const tournaments: MockTournament[] = [];
export const entries: MockEntry[] = [];
export const tmatches: MockTMatch[] = [];

let seq = 1;
const id = (prefix: string) => `${prefix}-${seq++}`;

export const activeEntries = (tid: string) =>
  entries.filter((e) => e.tournament_id === tid && e.status === "registered");

const entryRating = (e: MockEntry, type: MatchType) =>
  Math.round(e.players.reduce((a, p) => a + profileOf(p, type).rating, 0) / e.players.length);

export const entryName = (e: MockEntry) =>
  e.players.map((p) => users.find((u) => u.id === p)?.name.split(" ")[0] ?? "Player").join(" & ");

/** Creates the real match for a draw slot once both sides are known. */
function createMatchFor(t: MockTournament, tm: MockTMatch, at = new Date().toISOString()) {
  if (tm.match_id || !tm.a || !tm.b || tm.winner) return;
  const a = entries.find((e) => e.id === tm.a)!;
  const b = entries.find((e) => e.id === tm.b)!;
  // Spread matches across the tournament's courts.
  const court =
    t.court_ids[tmatches.filter((x) => x.tournament_id === t.id && x.match_id).length % t.court_ids.length] ??
    null;
  const mid = `m-t${seq++}`;
  matches.push({
    id: mid,
    match_type: t.match_type,
    category: "tournament",
    format: t.game,
    status: "scheduled",
    teams: [[...a.players], [...b.players]],
    first_serving: 0,
    venue_id: t.venue_id,
    court_id: court,
    session_id: null,
    queue_game_id: null,
    tournament_id: t.id,
    scorer_id: t.created_by,
    created_by: t.created_by,
    created_at: at,
    started_at: null,
    ended_at: null,
    void_reason: null,
    status_history: [{ from: null, to: "scheduled", by: t.created_by, at, reason: null }],
  });
  tm.match_id = mid;
  // Later rounds: tell the players their next match is set.
  if (!drawing && t.status === "in_progress")
    for (const pid of [...a.players, ...b.players])
      notify(
        pid,
        "tournaments",
        "tournament_match_ready",
        `${t.name}: your next match`,
        `${entryName(a)} vs ${entryName(b)}${court ? ` on ${courts.find((c) => c.id === court)?.name ?? "court"}` : ""}.`,
        `/matches/${mid}`,
        at,
      );
}

/** Puts a winner into the next knockout slot, and plays byes straight through. */
function advance(t: MockTournament, tm: MockTMatch, winner: string, at?: string) {
  tm.winner = winner;
  if (!tm.next) return;
  const next = tmatches.find((x) => x.id === tm.next!.id)!;
  if (tm.next.side === 0) next.a = winner;
  else next.b = winner;
  createMatchFor(t, next, at);
}

const roundName = (round: number, rounds: number) =>
  round === rounds
    ? "Final"
    : round === rounds - 1
      ? "Semifinals"
      : round === rounds - 2
        ? "Quarterfinals"
        : `Round ${round}`;
export { roundName };

/** A single-elimination bracket for entries already in seed order (index 0 = seed 1). */
function buildKnockout(t: MockTournament, seeded: string[], at?: string) {
  const size = bracketSize(seeded.length);
  const rounds = Math.log2(size);
  const order = seedOrder(size);
  const byRound: MockTMatch[][] = [];
  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r;
    byRound.push(
      Array.from({ length: count }, (_, slot) => ({
        id: id("tm"),
        tournament_id: t.id,
        stage: "knockout" as const,
        pool: null,
        round: r,
        slot,
        a: null,
        b: null,
        bye: false,
        winner: null,
        match_id: null,
        next: null,
      })),
    );
  }
  byRound.forEach((round, r) =>
    round.forEach((tm) => {
      if (r < rounds - 1)
        tm.next = { id: byRound[r + 1]![Math.floor(tm.slot / 2)]!.id, side: (tm.slot % 2) as 0 | 1 };
    }),
  );
  tmatches.push(...byRound.flat());
  // First round from the standard seed order; seeds past the entry count are byes.
  byRound[0]!.forEach((tm, i) => {
    tm.a = seeded[order[2 * i]! - 1] ?? null;
    tm.b = seeded[order[2 * i + 1]! - 1] ?? null;
  });
  for (const tm of byRound[0]!) {
    if (tm.a && tm.b) createMatchFor(t, tm, at);
    else if (tm.a || tm.b) {
      tm.bye = true;
      advance(t, tm, (tm.a ?? tm.b)!, at);
    }
  }
}

function buildRoundRobin(
  t: MockTournament,
  ids: string[],
  stage: "round_robin" | "pool",
  pool: string | null,
  at?: string,
) {
  roundRobin(ids.length).forEach((pairs, r) =>
    pairs.forEach(([x, y], slot) => {
      const tm: MockTMatch = {
        id: id("tm"),
        tournament_id: t.id,
        stage,
        pool,
        round: r + 1,
        slot,
        a: ids[x]!,
        b: ids[y]!,
        bye: false,
        winner: null,
        match_id: null,
        next: null,
      };
      tmatches.push(tm);
      createMatchFor(t, tm, at);
    }),
  );
}

let drawing = false;

/** Makes the draw: seeds by rating, then the format's matches. */
export function startTournament(t: MockTournament, at = new Date().toISOString()) {
  drawing = true;
  try {
    draw(t, at);
  } finally {
    drawing = false;
  }
  for (const e of activeEntries(t.id))
    for (const pid of e.players)
      notify(
        pid,
        "tournaments",
        "tournament_draw",
        `${t.name}: the draw is made`,
        `You're seed ${e.seed} of ${activeEntries(t.id).length}. Your first match is on the tournament page.`,
        `/tournaments/${t.slug}`,
        at,
      );
}

function draw(t: MockTournament, at: string) {
  const list = activeEntries(t.id);
  for (const e of list) e.rating = entryRating(e, t.match_type);
  list.sort((x, y) => y.rating! - x.rating! || x.registered_at.localeCompare(y.registered_at));
  list.forEach((e, i) => (e.seed = i + 1));
  const ids = list.map((e) => e.id);
  t.status = "in_progress";
  if (t.format === "single_elimination") buildKnockout(t, ids, at);
  else if (t.format === "round_robin") buildRoundRobin(t, ids, "round_robin", null, at);
  else
    snakePools(ids.length, t.pools ?? 2).forEach((pool, p) =>
      buildRoundRobin(
        t,
        pool.map((i) => ids[i]!),
        "pool",
        String.fromCharCode(65 + p),
        at,
      ),
    );
}

/** Results of finished round-robin or pool matches, for standings. */
export function resultsOf(t: MockTournament, stage: "round_robin" | "pool", pool: string | null) {
  return tmatches
    .filter((x) => x.tournament_id === t.id && x.stage === stage && x.pool === pool && x.winner && x.match_id)
    .map((x) => {
      const m = matches.find((mm) => mm.id === x.match_id)!;
      const s = stateOf(m);
      const points: [number, number] = [0, 0];
      for (const g of s.games) {
        points[0] += g.points[0];
        points[1] += g.points[1];
      }
      return { a: x.a!, b: x.b!, points, winner: (x.winner === x.a ? 0 : 1) as 0 | 1 };
    });
}

export function poolIds(t: MockTournament) {
  const pools = new Map<string | null, string[]>();
  for (const x of tmatches.filter((y) => y.tournament_id === t.id && y.stage !== "knockout")) {
    const list = pools.get(x.pool) ?? [];
    for (const e of [x.a, x.b]) if (e && !list.includes(e)) list.push(e);
    pools.set(x.pool, list);
  }
  // Keep seed order inside each pool.
  for (const [k, list] of pools)
    pools.set(
      k,
      list.sort((a, b) => entries.find((e) => e.id === a)!.seed! - entries.find((e) => e.id === b)!.seed!),
    );
  return pools;
}

/** After a tournament match is official: move the winner on, start the next stage, crown a champion. */
export function onTournamentMatch(m: MockMatch, at?: string) {
  const tm = tmatches.find((x) => x.match_id === m.id);
  if (!tm || tm.winner) return;
  const t = tournaments.find((x) => x.id === tm.tournament_id)!;
  const side = stateOf(m).winner as Side;
  const winner = side === 0 ? tm.a! : tm.b!;
  advance(t, tm, winner, at);

  const mine = tmatches.filter((x) => x.tournament_id === t.id);
  if (tm.stage === "knockout") {
    const lastRound = Math.max(...mine.filter((x) => x.stage === "knockout").map((x) => x.round));
    if (tm.round === lastRound) {
      t.champion_entry_id = winner;
      t.status = "completed";
    }
    return;
  }
  const groupDone = mine.filter((x) => x.stage === tm.stage).every((x) => x.winner);
  if (!groupDone) return;
  if (tm.stage === "round_robin") {
    const table = standings(poolIds(t).get(null)!, resultsOf(t, "round_robin", null));
    t.champion_entry_id = table[0]!.id;
    t.status = "completed";
    return;
  }
  // Pools done: the top 2 of each go to a knockout, pool winners seeded first.
  const tables = [...poolIds(t)].map(([pool, ids]) => standings(ids, resultsOf(t, "pool", pool)));
  // Seeds: pool winners (A1, B1, …) then runners-up (A2, B2, …). With the standard
  // bracket order, seed 1 (A1) meets the last seed (the last pool's runner-up),
  // so no pool's first two meet again in the first knockout round.
  const firsts = tables.map((x) => x[0]!.id);
  const seconds = tables.map((x) => x[1]!.id);
  buildKnockout(t, [...firsts, ...seconds], at);
}

/**
 * Makes a match result official: completed, rated (competitive and tournament),
 * and moved through its tournament. `by` null: automatically after 48 hours.
 */
export function completeMatch(m: MockMatch, by: string | null, at = new Date().toISOString()) {
  m.result ??= {
    submitted_by: by ?? m.scorer_id,
    submitted_at: at,
    confirmations: [],
    dispute: null,
    verified_at: null,
    verified_by: null,
  };
  m.result.verified_at = at;
  m.result.verified_by = by;
  m.status_history.push({ from: m.status, to: "completed", by: by ?? "system", at, reason: null });
  m.status = "completed";
  rateMatch(m, at);
  onTournamentMatch(m, at);
  // Tell the players: who won, and how their rating moved.
  const winner = stateOf(m).winner;
  const score = finalScore(stateOf(m));
  for (const [side, team] of m.teams.entries())
    for (const pid of team) {
      const change = ratingEvents.find(
        (e) => e.match_id === m.id && e.player_id === pid && e.version === RATING_VERSION,
      );
      notify(
        pid,
        "matches",
        "result_official",
        side === winner ? "You won: it's official" : "Result is official",
        `${score}.${change ? ` Your ${m.match_type} rating ${change.change >= 0 ? "rose" : "fell"} ${Math.abs(change.change)} to ${change.new}.` : ""}`,
        `/matches/${m.id}`,
        at,
      );
    }
}

/** A tournament match was voided: the same pairing gets a fresh match to play. */
export function replaceVoidedMatch(m: MockMatch) {
  const tm = tmatches.find((x) => x.match_id === m.id);
  const t = tm && tournaments.find((x) => x.id === tm.tournament_id);
  if (!tm || !t || tm.winner || t.status !== "in_progress") return;
  tm.match_id = null;
  createMatchFor(t, tm);
}
