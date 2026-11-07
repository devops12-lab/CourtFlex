// ELO ratings (Phase 5, M2; blueprint §5.2 G "ELO rules"). One pure function,
// versioned, so a rating can always be recalculated and audited.
//
// Expected score: E = 1 / (1 + 10^((opponent - own) / 400)), using each side's
// average rating in doubles. Change = K × (result − E), rounded; K is higher
// while a player is provisional, so new players find their level quickly.

export const RATING_VERSION = "elo-v1";

export interface RatingRules {
  initial: number;
  /** Rated matches before a player stops being provisional (and shows a rank). */
  provisional_matches: number;
  k_provisional: number;
  k_established: number;
}

export const defaultRatingRules: RatingRules = {
  initial: 1200,
  provisional_matches: 5,
  k_provisional: 32,
  k_established: 24,
};

export interface RatedPlayer {
  id: string;
  rating: number;
  /** Rated matches before this one. */
  games: number;
}

export const expected = (own: number, opponent: number) => 1 / (1 + 10 ** ((opponent - own) / 400));

const average = (team: RatedPlayer[]) => team.reduce((a, p) => a + p.rating, 0) / team.length;

/** The rating change for every player in a match. `winner` is 0 (side A) or 1 (side B). */
export function ratingChanges(
  teams: [RatedPlayer[], RatedPlayer[]],
  winner: 0 | 1,
  rules: RatingRules = defaultRatingRules,
): Array<{ id: string; old: number; change: number; new: number }> {
  const [a, b] = [average(teams[0]), average(teams[1])];
  return ([0, 1] as const).flatMap((side) => {
    const e = side === 0 ? expected(a, b) : expected(b, a);
    const result = side === winner ? 1 : 0;
    return teams[side].map((p) => {
      const k = p.games < rules.provisional_matches ? rules.k_provisional : rules.k_established;
      const change = Math.round(k * (result - e));
      return { id: p.id, old: p.rating, change, new: p.rating + change };
    });
  });
}
