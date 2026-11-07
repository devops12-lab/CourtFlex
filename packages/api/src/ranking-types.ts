// Geographic rankings (Phase 5, M3; blueprint §5.2 G "Geographic ranking model").
// One rating per player per format, filtered into each area's leaderboard.
import type { MatchType } from "./match-types";
import type { UUID } from "./types";

export type RankingScope = "barangay" | "city" | "province" | "country" | "global";

export interface RankingEntry {
  /** null for provisional players: they're listed, never ranked. */
  rank: number | null;
  player: { id: UUID; name: string; city: string | null };
  rating: number;
  games: number;
  wins: number;
  losses: number;
  provisional: boolean;
  /** Places gained (+) or lost (−) since a week ago; null if not ranked then. */
  movement: number | null;
}

export interface RankingArea {
  scope: RankingScope;
  id: string;
  name: string;
}

export interface Leaderboard {
  type: MatchType;
  area: RankingArea;
  /** Ranked players, best first. */
  ranked: RankingEntry[];
  /** Players with fewer rated matches than the minimum, by rating. */
  provisional: RankingEntry[];
  /** The viewer's own row, if they're in this area. */
  me: RankingEntry | null;
  /** Rated matches needed to be ranked. */
  minimum_matches: number;
  /** The viewer's home areas, for the scope tabs (empty for visitors). */
  my_areas: RankingArea[];
}

/** Where a player stands in each of their home areas. */
export interface PlayerRank {
  type: MatchType;
  area: RankingArea;
  rank: number;
  of: number;
}
