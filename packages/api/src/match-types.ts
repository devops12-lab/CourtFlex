// Matches and the Live Scorer (Phase 5, M1; blueprint §5.2 F, §9.6, §13.4).
import type { MatchFormat, ScoreState, Side } from "./scoring";
import type { ISODateTime, PersonRef, UUID } from "./types";
import type { PlayerRank } from "./ranking-types";

export type MatchType = "singles" | "doubles";
export type PlayCategory = "casual" | "competitive" | "tournament";
export type MatchStatus =
  "scheduled" | "in_progress" | "awaiting_confirmation" | "completed" | "disputed" | "voided";

export interface MatchInput {
  match_type: MatchType;
  category: "casual" | "competitive";
  format: MatchFormat;
  /** Side A then side B: 1 player each for singles, 2 for doubles. */
  team_a: UUID[];
  team_b: UUID[];
  /** Which side serves first. */
  first_serving: Side;
  /** Who keeps score; defaults to whoever creates the match. */
  scorer_id?: UUID;
  /** A court at a venue, when the match is played there. */
  court_id?: UUID | null;
  /** The open play session it belongs to, if any; organizers only. */
  session_id?: UUID | null;
  /** An open play queue game it's scoring, if any. */
  queue_game_id?: UUID | null;
}

export interface MatchSummary {
  id: UUID;
  match_type: MatchType;
  category: PlayCategory;
  status: MatchStatus;
  format: MatchFormat;
  teams: [PersonRef[], PersonRef[]];
  /** "11-7" or "11-7, 9-11, 11-4" from side A's view, once points are scored. */
  score: string;
  /** The side that won, once the match is over. */
  winner: Side | null;
  /** While a result waits for confirmation: the side that confirms it. */
  awaiting_side: Side | null;
  venue: { id: UUID; name: string } | null;
  court: { id: UUID; name: string } | null;
  session: { id: UUID; title: string } | null;
  scorer: PersonRef;
  created_by: PersonRef;
  created_at: ISODateTime;
  started_at: ISODateTime | null;
  ended_at: ISODateTime | null;
}

export interface MatchDetail extends MatchSummary {
  first_serving: Side;
  /** The official score, from the server. */
  state: ScoreState;
  /** Increases with every score event: screens poll and compare. */
  version: number;
  /** What the viewer can do. */
  can_score: boolean;
  can_manage: boolean;
  /** A player on the side that needs to confirm, and hasn't. */
  can_confirm: boolean;
  /** A player in the match, while the result waits for confirmation. */
  can_dispute: boolean;
  /** An organizer who isn't playing (or the Super Admin), while the result isn't final. */
  can_verify: boolean;
  /** Once a result is submitted. */
  result: MatchResultView | null;
  /** Rating changes, once a competitive result is verified. */
  ratings: Array<{ player: PersonRef; old: number; change: number; new: number }>;
}

export interface MatchResultView {
  submitted_by: PersonRef;
  submitted_at: ISODateTime;
  /** The side whose confirmation makes it official (the side that didn't submit). */
  awaiting_side: Side | null;
  confirmations: Array<{ player: PersonRef; at: ISODateTime }>;
  dispute: {
    by: PersonRef;
    reason: string;
    at: ISODateTime;
    /** How the Super Admin settled it, when they did. */
    resolution: { decision: "keep" | "void"; note: string; by: PersonRef; at: ISODateTime } | null;
  } | null;
  verified_at: ISODateTime | null;
  /** Who made it official; null when it became official automatically after 48 hours. */
  verified_by: PersonRef | null;
  /** When it becomes official on its own if no one disputes it. */
  auto_verify_at: ISODateTime | null;
}

// ── Ratings and statistics (M2) ───────────────────────────

export interface RatingSummary {
  type: MatchType;
  rating: number;
  /** Fewer rated matches than needed for a ranking. */
  provisional: boolean;
  /** Rated matches. */
  games: number;
  wins: number;
  losses: number;
  /** Rated matches still needed before the player is ranked. */
  matches_to_rank: number;
}

export interface PlayerStats {
  player: PersonRef & { home_city: string | null; skill: string };
  ratings: { singles: RatingSummary; doubles: RatingSummary };
  /** Finished matches that weren't voided, rated or not. */
  totals: { played: number; wins: number; losses: number; casual: number };
  /** Newest last: W or L for the last 5 finished matches. */
  form: Array<"W" | "L">;
  /** Rating after each rated match, oldest first. */
  history: {
    singles: Array<{ at: ISODateTime; rating: number }>;
    doubles: Array<{ at: ISODateTime; rating: number }>;
  };
  recent: MatchSummary[];
  /** Where the player is ranked in their home areas (ranked formats only). */
  ranks: PlayerRank[];
}

export interface ScoreEventView {
  seq: number;
  type: "rally" | "undo";
  /** For a rally, the side that won it. */
  winner: Side | null;
  /** The score as called after this event. */
  called_after: string;
  game: number;
  scorer: PersonRef;
  at: ISODateTime;
}
