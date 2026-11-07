// Matches and score events (Phase 5, M1). Score events are never edited or
// removed; undo is its own event (blueprint §13.4).
import type { MatchFormat, MatchStatus, MatchType, PlayCategory, ScoreInput, Side } from "@courtflex/api";
import { replay } from "@courtflex/api";

export interface MockMatch {
  id: string;
  match_type: MatchType;
  category: PlayCategory;
  format: MatchFormat;
  status: MatchStatus;
  /** User ids, side A then side B. */
  teams: [string[], string[]];
  first_serving: Side;
  venue_id: string | null;
  court_id: string | null;
  session_id: string | null;
  queue_game_id: string | null;
  tournament_id: string | null;
  scorer_id: string;
  created_by: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  void_reason: string | null;
  /** The result workflow (M2): who submitted, who confirmed, any dispute, when it became official. */
  result?: {
    submitted_by: string;
    submitted_at: string;
    confirmations: Array<{ player_id: string; at: string }>;
    dispute: {
      by: string;
      reason: string;
      at: string;
      /** The Super Admin's decision, when they settled it. */
      resolution?: { decision: "keep" | "void"; note: string; by: string; at: string } | null;
    } | null;
    verified_at: string | null;
    /** null: verified automatically after 48 hours with no dispute. */
    verified_by: string | null;
  };
  status_history: Array<{
    from: MatchStatus | null;
    to: MatchStatus;
    by: string;
    at: string;
    reason: string | null;
  }>;
}

export interface MockScoreEvent {
  id: string;
  match_id: string;
  seq: number;
  /** From the scorer's device: the same id twice is the same tap (a retry). */
  event_uuid: string;
  type: "rally" | "undo";
  winner: Side | null;
  scorer_id: string;
  created_at: string;
}

export const matches: MockMatch[] = [];
export const scoreEvents: MockScoreEvent[] = [];

export const eventsOf = (matchId: string) =>
  scoreEvents.filter((e) => e.match_id === matchId).sort((a, b) => a.seq - b.seq);

export const inputsOf = (matchId: string): ScoreInput[] =>
  eventsOf(matchId).map((e) => (e.type === "undo" ? { type: "undo" } : { type: "rally", winner: e.winner! }));

export function stateOf(m: MockMatch) {
  return replay(inputsOf(m.id), m.format, m.match_type, m.first_serving);
}

// ── Sample matches ────────────────────────────────────────

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export function seed(
  m: Omit<MockMatch, "status_history" | "void_reason" | "tournament_id" | "result">,
  rallies: Side[],
) {
  matches.push({
    ...m,
    tournament_id: null,
    void_reason: null,
    status_history: [{ from: null, to: m.status, by: m.created_by, at: m.created_at, reason: null }],
    // A finished sample was submitted by its scorer when it ended.
    result:
      m.status === "awaiting_confirmation" || m.status === "completed"
        ? {
            submitted_by: m.scorer_id,
            submitted_at: m.ended_at!,
            confirmations: [],
            dispute: null,
            verified_at: m.status === "completed" ? m.ended_at : null,
            verified_by: m.status === "completed" ? m.scorer_id : null,
          }
        : undefined,
  });
  rallies.forEach((winner, i) =>
    scoreEvents.push({
      id: `se-${m.id}-${i + 1}`,
      match_id: m.id,
      seq: i + 1,
      event_uuid: `seed-${m.id}-${i + 1}`,
      type: "rally",
      winner,
      scorer_id: m.scorer_id,
      created_at: new Date(new Date(m.started_at ?? m.created_at).getTime() + (i + 1) * 40_000).toISOString(),
    }),
  );
}

/**
 * Singles, side-out scoring: the rallies that give these points in this order.
 * A side has to win the serve back (a rally with no point) before it can score.
 */
function singlesRallies(points: Side[], firstServing: Side = 0): Side[] {
  const rallies: Side[] = [];
  let serving = firstServing;
  for (const p of points) {
    if (p !== serving) {
      rallies.push(p); // side out
      serving = p;
    }
    rallies.push(p);
  }
  return rallies;
}

const sideOut11: MatchFormat = { target: 11, win_by: 2, best_of: 1, scoring: "side_out" };

// Live now at Mauban: the front desk keeps score, so anyone can watch.
seed(
  {
    id: "m-1",
    match_type: "doubles",
    category: "casual",
    format: sideOut11,
    status: "in_progress",
    teams: [
      ["u-006", "u-007"],
      ["u-008", "u-009"],
    ],
    first_serving: 0,
    venue_id: "c-001",
    court_id: "court-004",
    session_id: null,
    queue_game_id: null,
    scorer_id: "u-005",
    created_by: "u-005",
    created_at: ago(14),
    started_at: ago(12),
    ended_at: null,
  },
  [0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1],
);

// Yesterday: Jamie beat Sam 11-7 in singles; Sam hasn't confirmed yet.
seed(
  {
    id: "m-2",
    match_type: "singles",
    category: "competitive",
    format: sideOut11,
    status: "awaiting_confirmation",
    teams: [["u-003"], ["u-004"]],
    first_serving: 0,
    venue_id: "c-001",
    court_id: "court-002",
    session_id: null,
    queue_game_id: null,
    scorer_id: "u-003",
    created_by: "u-003",
    created_at: ago(26 * 60),
    started_at: ago(26 * 60 - 2),
    ended_at: ago(25 * 60),
  },
  // Points in the order they were won, 11-7 for Jamie.
  singlesRallies([0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0]),
);

// Jamie keeps score for tonight's doubles: ready to start.
seed(
  {
    id: "m-3",
    match_type: "doubles",
    category: "competitive",
    format: sideOut11,
    status: "scheduled",
    teams: [
      ["u-003", "u-010"],
      ["u-011", "u-012"],
    ],
    first_serving: 0,
    venue_id: null,
    court_id: null,
    session_id: null,
    queue_game_id: null,
    scorer_id: "u-003",
    created_by: "u-003",
    created_at: ago(30),
    started_at: null,
    ended_at: null,
  },
  [],
);

// Disputed yesterday: Kim says the final rally was out. Waits for the Super Admin (Competition > Disputes).
seed(
  {
    id: "m-4",
    match_type: "doubles",
    category: "competitive",
    format: { target: 11, win_by: 2, best_of: 1, scoring: "rally" },
    status: "disputed",
    teams: [
      ["u-006", "u-012"],
      ["u-014", "u-009"],
    ],
    first_serving: 0,
    venue_id: "c-001",
    court_id: "court-008",
    session_id: null,
    queue_game_id: null,
    scorer_id: "u-006",
    created_by: "u-006",
    created_at: ago(30 * 60),
    started_at: ago(30 * 60 - 1),
    ended_at: ago(29 * 60),
  },
  // 11-9 to Andrea and Joy.
  [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0],
);
{
  const m = matches.find((x) => x.id === "m-4")!;
  m.result = {
    submitted_by: "u-006",
    submitted_at: ago(29 * 60),
    confirmations: [],
    dispute: { by: "u-014", reason: "The final rally was out. It should be 10-10.", at: ago(28 * 60) },
    verified_at: null,
    verified_by: null,
  };
}
