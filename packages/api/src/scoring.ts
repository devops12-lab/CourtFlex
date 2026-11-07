// Pickleball scoring, as one pure function: replay a match's score events and
// get the official state. The server uses it as the authority (blueprint §13.4);
// screens use the same rules to show "game point" and who's serving.
//
// Side-out scoring (traditional): only the serving side scores. In doubles each
// side has two servers; the side that serves first in a game starts with one
// server only ("0-0-2"). Rally scoring: every rally scores, whoever served.

export type Side = 0 | 1;

export interface MatchFormat {
  /** Points to win a game. */
  target: 11 | 15 | 21;
  /** Lead needed to win a game. */
  win_by: 1 | 2;
  /** Games in the match: 1, or best of 3. */
  best_of: 1 | 3;
  scoring: "side_out" | "rally";
}

export const defaultFormat: MatchFormat = { target: 11, win_by: 2, best_of: 1, scoring: "side_out" };

/** What the scorer recorded. "undo" cancels the latest rally that isn't cancelled yet. */
export type ScoreInput = { type: "rally"; winner: Side } | { type: "undo" };

export interface GameScore {
  points: [number, number];
  winner: Side | null;
}

export interface ScoreState {
  games: GameScore[];
  /** The game being played (or the last one, once the match is over). */
  current: number;
  serving: Side;
  /** Doubles side-out only: 1 or 2. */
  server: 1 | 2 | null;
  /** Games each side has won. */
  games_won: [number, number];
  winner: Side | null;
  /** The side one rally from winning the game (or the match), if any. */
  game_point: Side | null;
  match_point: Side | null;
  /** The score as players call it: "4-2-1" (side-out doubles), "4-2", or by side in rally scoring. */
  called: string;
  /** Rallies counted (after undos). */
  rallies: number;
}

const other = (s: Side): Side => (s === 0 ? 1 : 0);

/** Who serves first in game n (0-based): sides take turns starting games. */
const firstServer = (firstServing: Side, game: number): Side =>
  game % 2 === 0 ? firstServing : other(firstServing);

export function gamesToWin(format: MatchFormat) {
  return format.best_of === 3 ? 2 : 1;
}

function gameWinner(points: [number, number], format: MatchFormat): Side | null {
  for (const s of [0, 1] as const) {
    if (points[s] >= format.target && points[s] - points[other(s)] >= format.win_by) return s;
  }
  return null;
}

/** Would one more point for `side` win the game? */
function oneAway(points: [number, number], side: Side, format: MatchFormat) {
  const next: [number, number] = [...points];
  next[side] += 1;
  return gameWinner(next, format) === side;
}

/**
 * Replays the events. Undos cancel the latest rally still standing, so the
 * original events stay as recorded (nothing is deleted) and the result is the
 * same every time.
 */
export function replay(
  events: ScoreInput[],
  format: MatchFormat,
  matchType: "singles" | "doubles",
  firstServing: Side = 0,
): ScoreState {
  // 1. Work out which rallies stand.
  const standing: Side[] = [];
  for (const e of events) {
    if (e.type === "rally") standing.push(e.winner);
    else standing.pop();
  }

  // 2. Play them.
  const doublesSideOut = format.scoring === "side_out" && matchType === "doubles";
  const games: GameScore[] = [{ points: [0, 0], winner: null }];
  const won: [number, number] = [0, 0];
  let serving = firstServer(firstServing, 0);
  let server: 1 | 2 | null = doublesSideOut ? 2 : null;
  let winner: Side | null = null;

  for (const side of standing) {
    if (winner !== null) break; // rallies after the match ended are ignored
    const g = games[games.length - 1]!;
    if (format.scoring === "rally" || side === serving) {
      g.points[side] += 1;
      serving = side;
    } else if (doublesSideOut && server === 1) {
      server = 2; // the partner serves
    } else {
      serving = side; // side out
      server = doublesSideOut ? 1 : null;
    }
    const gw = gameWinner(g.points, format);
    if (gw !== null) {
      g.winner = gw;
      won[gw] += 1;
      if (won[gw] >= gamesToWin(format)) {
        winner = gw;
      } else {
        games.push({ points: [0, 0], winner: null });
        serving = firstServer(firstServing, games.length - 1);
        server = doublesSideOut ? 2 : null;
      }
    }
  }

  const g = games[games.length - 1]!;
  let gamePoint: Side | null = null;
  if (winner === null) {
    // In side-out scoring only the serving side can win the next rally's point.
    const candidates: Side[] = format.scoring === "rally" ? [0, 1] : [serving];
    gamePoint = candidates.find((s) => oneAway(g.points, s, format)) ?? null;
  }
  const matchPoint = gamePoint !== null && won[gamePoint] + 1 >= gamesToWin(format) ? gamePoint : null;

  const called =
    format.scoring === "rally"
      ? `${g.points[0]}-${g.points[1]}`
      : `${g.points[serving]}-${g.points[other(serving)]}${server ? `-${server}` : ""}`;

  return {
    games,
    current: games.length - 1,
    serving,
    server,
    games_won: won,
    winner,
    game_point: gamePoint,
    match_point: matchPoint,
    called,
    rallies: standing.length,
  };
}

/** "11-7" or "11-7, 9-11, 11-4", from side A's view. */
export function finalScore(state: ScoreState) {
  return state.games
    .filter((g) => g.winner !== null || g.points[0] + g.points[1] > 0)
    .map((g) => `${g.points[0]}-${g.points[1]}`)
    .join(", ");
}
