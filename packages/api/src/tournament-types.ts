// Tournaments (Phase 5, M4; blueprint Phase 10). Tournament matches are normal
// matches: scored on the Live Scorer, rated like competitive matches.
import type { MatchFormat } from "./scoring";
import type { MatchStatus, MatchType } from "./match-types";
import type { StandingRow } from "./bracket";
import type { ISODateTime, Money, PersonRef, UUID } from "./types";

export type TournamentFormat = "single_elimination" | "round_robin" | "pool_knockout";
export type TournamentStatus = "registration" | "in_progress" | "completed" | "cancelled";

/** Who runs it: a venue (court owner) or a community club. */
export interface TournamentHost {
  type: "venue" | "community";
  id: UUID;
  name: string;
}

export interface TournamentInput {
  host: { type: "venue" | "community"; id: UUID };
  name: string;
  description: string;
  match_type: MatchType;
  format: TournamentFormat;
  game: MatchFormat;
  /** Where it's played; for a club tournament, the venue it uses. */
  venue_id: UUID;
  court_ids: UUID[];
  starts_at: ISODateTime;
  registration_closes_at: ISODateTime;
  /** Entries (players for singles, teams for doubles): 4 to 32. */
  capacity: number;
  /** Paid at the venue on the day; "0" for free. */
  entry_fee: Money;
  /** Pool play then knockout: 2 to 4 pools; the top 2 of each go through. */
  pools?: number | null;
}

/** A player, or a doubles team, in the draw. */
export interface EntryRef {
  id: UUID;
  name: string;
  seed: number | null;
}

export interface TournamentEntry extends EntryRef {
  players: PersonRef[];
  /** The rating the seeding used (doubles: the team's average). */
  rating: number;
}

export interface TournamentMatchView {
  id: UUID;
  stage: "knockout" | "round_robin" | "pool";
  /** 1-based, within its stage. */
  round: number;
  /** "Final", "Semifinals", "Round 1"… */
  round_name: string;
  pool: string | null;
  slot: number;
  entries: [EntryRef | null, EntryRef | null];
  /** One side had no opponent: the other goes through. */
  bye: boolean;
  winner_entry_id: UUID | null;
  match: { id: UUID; status: MatchStatus; score: string; winner: 0 | 1 | null; court: string | null } | null;
}

export interface TournamentSummary {
  id: UUID;
  slug: string;
  name: string;
  host: TournamentHost;
  venue: { id: UUID; name: string; city: string };
  format: TournamentFormat;
  match_type: MatchType;
  status: TournamentStatus;
  starts_at: ISODateTime;
  registration_closes_at: ISODateTime;
  entries_count: number;
  capacity: number;
  entry_fee: Money;
  champion: EntryRef | null;
}

export interface TournamentDetail extends TournamentSummary {
  description: string;
  game: MatchFormat;
  courts: Array<{ id: UUID; name: string }>;
  pools: number | null;
  entries: TournamentEntry[];
  matches: TournamentMatchView[];
  /** Round robin: one table; pool play: one per pool. */
  standings: Array<{ pool: string | null; rows: Array<StandingRow & { entry: EntryRef }> }>;
  my_entry_id: UUID | null;
  can_manage: boolean;
  can_register: boolean;
  /** Why the viewer can't register, when they can't. */
  register_note: string | null;
  cancel_reason: string | null;
}

/** Venues and clubs the viewer can run a tournament for. */
export interface TournamentHostOption extends TournamentHost {
  /** A venue hosts at itself; a club picks a venue. */
  venue_id: UUID | null;
}
