// Sample tournaments (Phase 5, M4): one taking entries, one being played, one
// finished today. The ones underway are played through the same draw code.
import type { MatchFormat, Side } from "@courtflex/api";
import { matches, scoreEvents } from "./match-db";
import { skillOf } from "./open-play-db";
import {
  completeMatch,
  entries,
  startTournament,
  tmatches,
  tournaments,
  type MockTournament,
} from "./tournament-db";

const H = 3_600_000;
const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();
/** `days` from today at `hour`:00 Manila time. */
function atManila(days: number, hour: number) {
  const today = new Date(Date.now() + 8 * H).toISOString().slice(0, 10);
  const d = new Date(`${today}T${String(hour).padStart(2, "0")}:00:00+08:00`);
  return new Date(d.getTime() + days * 24 * H).toISOString();
}
const rally11: MatchFormat = { target: 11, win_by: 2, best_of: 1, scoring: "rally" };
const strength: Record<string, number> = { novice: 1, beginner: 2, intermediate: 3, advanced: 4 };

let s = 77;
const rand = () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

function tournament(
  t: Omit<MockTournament, "status" | "champion_entry_id" | "cancel_reason">,
  teams: string[][],
) {
  tournaments.push({ ...t, status: "registration", champion_entry_id: null, cancel_reason: null });
  teams.forEach((players, i) =>
    entries.push({
      id: `te-${t.id}-${i + 1}`,
      tournament_id: t.id,
      players,
      seed: null,
      rating: null,
      status: "registered",
      registered_by: players[0]!,
      registered_at: new Date(new Date(t.created_at).getTime() + i * H).toISOString(),
    }),
  );
  return tournaments.at(-1)!;
}

/** Plays a scheduled tournament match: the stronger side usually wins, rally scoring. */
function play(matchId: string, endedAt: number) {
  const m = matches.find((x) => x.id === matchId)!;
  const power = (side: Side) =>
    m.teams[side].reduce((a, p) => a + strength[skillOf(p)]!, 0) / m.teams[side].length;
  const edge = Math.max(-0.4, Math.min(0.4, (power(0) - power(1)) * 0.3));
  const winner: Side = rand() < 0.5 + edge ? 0 : 1;
  const loserPoints = Math.floor(rand() * 10);
  const rallies: Side[] = [];
  let w = 0;
  let l = 0;
  while (w < 11) {
    if (l < loserPoints && rand() < 0.45) {
      rallies.push(winner === 0 ? 1 : 0);
      l++;
    } else {
      rallies.push(winner);
      w++;
    }
  }
  const end = iso(endedAt);
  const start = iso(endedAt - 0.4 * H);
  m.status = "in_progress";
  m.started_at = start;
  m.status_history.push({ from: "scheduled", to: "in_progress", by: m.scorer_id, at: start, reason: null });
  rallies.forEach((winnerSide, i) =>
    scoreEvents.push({
      id: `se-${m.id}-${i + 1}`,
      match_id: m.id,
      seq: i + 1,
      event_uuid: `seed-${m.id}-${i + 1}`,
      type: "rally",
      winner: winnerSide,
      scorer_id: m.scorer_id,
      created_at: start,
    }),
  );
  m.ended_at = end;
  m.result = {
    submitted_by: m.scorer_id,
    submitted_at: end,
    confirmations: [],
    dispute: null,
    verified_at: null,
    verified_by: null,
  };
  // The organizer kept score and isn't playing: official at once.
  completeMatch(m, m.scorer_id, end);
}

/** Plays a tournament's scheduled matches in draw order, up to `limit` of them. */
function playThrough(t: MockTournament, from: number, step: number, limit = Infinity) {
  let n = 0;
  let at = from;
  for (;;) {
    const next = tmatches.find(
      (x) =>
        x.tournament_id === t.id &&
        x.match_id &&
        !x.winner &&
        matches.find((m) => m.id === x.match_id)?.status === "scheduled",
    );
    if (!next || n >= limit) return;
    play(next.match_id!, at);
    at += step;
    n++;
  }
}

// 1. Taking entries: Mauban's doubles knockout, a week from now. Jamie isn't in yet.
tournament(
  {
    id: "t-1",
    slug: "mauban-doubles-open",
    name: "Mauban Doubles Open",
    description:
      "Eight teams, one day, single elimination. Games to 11, win by 2. Bring water: the outdoor courts get hot by noon.",
    host: { type: "venue", id: "c-001" },
    venue_id: "c-001",
    court_ids: ["court-001", "court-004", "court-008"],
    match_type: "doubles",
    format: "single_elimination",
    game: { target: 11, win_by: 2, best_of: 1, scoring: "side_out" },
    starts_at: atManila(7, 8),
    registration_closes_at: atManila(5, 20),
    capacity: 8,
    entry_fee: "400.00",
    pools: null,
    created_by: "u-002",
    created_at: iso(-3 * 24 * H),
  },
  [
    ["u-022", "u-026"],
    ["u-006", "u-007"],
    ["u-020", "u-029"],
    ["u-031", "u-036"],
    ["u-011", "u-014"],
    ["u-033", "u-037"],
  ],
);

// 2. Being played: Lucena Dinkers' singles round robin at Quezon Sports Courts.
const rr = tournament(
  {
    id: "t-2",
    slug: "lucena-dinkers-singles-round-robin",
    name: "Lucena Dinkers Singles Round Robin",
    description: "Everyone plays everyone. Most wins takes it; point difference breaks ties.",
    host: { type: "community", id: "com-2" },
    venue_id: "c-002",
    court_ids: ["court-003", "court-005"],
    match_type: "singles",
    format: "round_robin",
    game: rally11,
    starts_at: iso(-3 * H),
    registration_closes_at: iso(-24 * H),
    capacity: 8,
    entry_fee: "0.00",
    pools: null,
    created_by: "u-008",
    created_at: iso(-6 * 24 * H),
  },
  [["u-004"], ["u-008"], ["u-025"], ["u-028"], ["u-030"], ["u-035"]],
);
startTournament(rr, iso(-3 * H));
playThrough(rr, -2.8 * H, 0.3 * H, 7);

// 3. Finished earlier today: Tara Pikol's Saturday Shootout at Mauban, two pools then a knockout.
const shootout = tournament(
  {
    id: "t-3",
    slug: "saturday-shootout",
    name: "Saturday Shootout",
    description: "Two pools of four, round robin, then the top two of each pool play it out.",
    host: { type: "community", id: "com-1" },
    venue_id: "c-001",
    court_ids: ["court-001", "court-002", "court-004", "court-008"],
    match_type: "doubles",
    format: "pool_knockout",
    game: rally11,
    starts_at: iso(-11 * H),
    registration_closes_at: iso(-36 * H),
    capacity: 8,
    entry_fee: "200.00",
    pools: 2,
    created_by: "u-006",
    created_at: iso(-8 * 24 * H),
  },
  [
    ["u-022", "u-030"],
    ["u-026", "u-034"],
    ["u-010", "u-007"],
    ["u-020", "u-031"],
    ["u-003", "u-009"],
    ["u-021", "u-024"],
    ["u-029", "u-036"],
    ["u-033", "u-037"],
  ],
);
startTournament(shootout, iso(-11 * H));
playThrough(shootout, -10.5 * H, 0.25 * H);
