// Ratings (Phase 5, M2): one profile per player per format, and an immutable
// ledger of every change (blueprint §5.2 G). A match is rated once per player.
import type { MatchFormat, MatchType, Side } from "@courtflex/api";
import { RATING_VERSION, defaultRatingRules, ratingChanges } from "@courtflex/api";
import { courts } from "./db";
import { matches, seed, stateOf, type MockMatch } from "./match-db";
import { skillOf } from "./open-play-db";

export interface RatingProfile {
  player_id: string;
  type: MatchType;
  rating: number;
  /** Rated matches. */
  games: number;
  wins: number;
  losses: number;
  last_match_at: string | null;
}

export interface RatingEvent {
  id: string;
  match_id: string;
  player_id: string;
  type: MatchType;
  old: number;
  change: number;
  new: number;
  version: string;
  created_at: string;
}

/** Keyed "player:type". */
export const ratingProfiles: Record<string, RatingProfile> = {};
export const ratingEvents: RatingEvent[] = [];
/** Configurable by the Super Admin (M5). */
export const ratingRules = { ...defaultRatingRules };

export function profileOf(playerId: string, type: MatchType): RatingProfile {
  return (ratingProfiles[`${playerId}:${type}`] ??= {
    player_id: playerId,
    type,
    rating: ratingRules.initial,
    games: 0,
    wins: 0,
    losses: 0,
    last_match_at: null,
  });
}

export const isProvisional = (p: RatingProfile) => p.games < ratingRules.provisional_matches;

/**
 * Rates a verified competitive match. Safe to call twice: a match already in
 * the ledger is skipped (the unique match + player + type rule).
 */
export function rateMatch(m: MockMatch, at = new Date().toISOString()) {
  // Competitive and tournament matches are rated; casual ones never.
  if (m.category === "casual" || m.status !== "completed") return;
  if (ratingEvents.some((e) => e.match_id === m.id)) return;
  const winner = stateOf(m).winner;
  if (winner === null) return;
  const rated = (team: string[]) =>
    team.map((id) => {
      const p = profileOf(id, m.match_type);
      return { id, rating: p.rating, games: p.games };
    });
  const changes = ratingChanges([rated(m.teams[0]), rated(m.teams[1])], winner, ratingRules);
  for (const c of changes) {
    const p = profileOf(c.id, m.match_type);
    const won = m.teams[winner].includes(c.id);
    ratingEvents.push({
      id: `re-${m.id}-${c.id}`,
      match_id: m.id,
      player_id: c.id,
      type: m.match_type,
      old: c.old,
      change: c.change,
      new: c.new,
      version: RATING_VERSION,
      created_at: at,
    });
    p.rating = c.new;
    p.games += 1;
    if (won) p.wins += 1;
    else p.losses += 1;
    p.last_match_at = at;
  }
}

// ── Six weeks of past competitive matches ─────────────────
// Deterministic, so the sample ratings are the same every time.

let s = 20261106;
const rand = () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)]!;

const strength: Record<string, number> = { novice: 1, beginner: 2, intermediate: 3, advanced: 4 };
const pool = [
  "u-003",
  "u-004",
  "u-006",
  "u-007",
  "u-008",
  "u-009",
  "u-010",
  "u-011",
  "u-012",
  "u-014",
  ...Array.from({ length: 18 }, (_, i) => `u-0${20 + i}`),
];
const rally11: MatchFormat = { target: 11, win_by: 2, best_of: 1, scoring: "rally" };
const maubanCourts = courts.filter((c) => c.club_id === "c-001").map((c) => c.id);

/** Rallies for a rally-scored game that `winner` takes, with a believable margin. */
function game(winner: Side): Side[] {
  const loserPoints = Math.floor(rand() * 10); // 0..9
  const loser: Side = winner === 0 ? 1 : 0;
  const rallies: Side[] = [];
  let w = 0;
  let l = 0;
  while (w < 11) {
    if (l < loserPoints && rand() < 0.45) {
      rallies.push(loser);
      l++;
    } else {
      rallies.push(winner);
      w++;
    }
  }
  return rallies;
}

const DAY = 86_400_000;
for (let i = 0; i < 120; i++) {
  const type: MatchType = rand() < 0.35 ? "singles" : "doubles";
  const size = type === "singles" ? 1 : 2;
  const players: string[] = [];
  while (players.length < size * 2) {
    const p = pick(pool);
    if (!players.includes(p)) players.push(p);
  }
  const teams: [string[], string[]] = [players.slice(0, size), players.slice(size)];
  const power = (t: string[]) => t.reduce((a, id) => a + strength[skillOf(id)]!, 0) / t.length;
  // The stronger side usually wins: 50% at equal skill, up to 90% a level apart or more.
  const edge = Math.max(-0.4, Math.min(0.4, (power(teams[0]) - power(teams[1])) * 0.3));
  const winner: Side = rand() < 0.5 + edge ? 0 : 1;
  const ended = new Date(Date.now() - (45 - i * 0.37) * DAY - 2 * 3_600_000).toISOString();
  const started = new Date(new Date(ended).getTime() - 25 * 60_000).toISOString();
  const id = `m-h${i + 1}`;
  seed(
    {
      id,
      match_type: type,
      category: "competitive",
      format: rally11,
      status: "completed",
      teams,
      first_serving: 0,
      venue_id: "c-001",
      court_id: pick(maubanCourts),
      session_id: null,
      queue_game_id: null,
      scorer_id: teams[0][0]!,
      created_by: teams[0][0]!,
      created_at: started,
      started_at: started,
      ended_at: ended,
    },
    game(winner),
  );
  const m = matches.find((x) => x.id === id)!;
  // Confirmed by the other side.
  m.result!.confirmations.push({ player_id: teams[1][0]!, at: ended });
  rateMatch(m, ended);
}

// ── Corrections (M5): never edit the ledger; add to it ────

export interface MockRatingAdjustment {
  id: string;
  player_id: string;
  type: MatchType;
  old: number;
  new: number;
  reason: string;
  by: string;
  at: string;
}

export const ratingAdjustments: MockRatingAdjustment[] = [];

/**
 * Undoes a match's rating changes with compensating ledger entries (blueprint
 * ELO rule 7). Safe to call twice: a match is reversed once.
 */
export function reverseMatchRatings(matchId: string, at = new Date().toISOString()) {
  if (ratingEvents.some((e) => e.match_id === matchId && e.version === `${RATING_VERSION}-reversal`))
    return 0;
  const original = ratingEvents.filter((e) => e.match_id === matchId && e.version === RATING_VERSION);
  for (const e of original) {
    const p = profileOf(e.player_id, e.type);
    ratingEvents.push({
      id: `${e.id}-rev`,
      match_id: matchId,
      player_id: e.player_id,
      type: e.type,
      old: p.rating,
      change: -e.change,
      new: p.rating - e.change,
      version: `${RATING_VERSION}-reversal`,
      created_at: at,
    });
    p.rating -= e.change;
    p.games = Math.max(0, p.games - 1);
    if (e.change > 0) p.wins = Math.max(0, p.wins - 1);
    else p.losses = Math.max(0, p.losses - 1);
  }
  return original.length;
}

/** Sets a player's rating, with a reason, as a ledger entry. Rated matches played don't change. */
export function adjustRating(playerId: string, type: MatchType, rating: number, reason: string, by: string) {
  const p = profileOf(playerId, type);
  const at = new Date().toISOString();
  const id = `ra-${ratingAdjustments.length + 1}-${Date.now() % 100000}`;
  ratingEvents.push({
    id,
    match_id: id,
    player_id: playerId,
    type,
    old: p.rating,
    change: rating - p.rating,
    new: rating,
    version: "adjustment",
    created_at: at,
  });
  ratingAdjustments.push({ id, player_id: playerId, type, old: p.rating, new: rating, reason, by, at });
  p.rating = rating;
}
