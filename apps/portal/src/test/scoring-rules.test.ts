// Phase 5, M1: pickleball scoring rules (the same function the server uses).
import { finalScore, replay, type MatchFormat, type ScoreInput, type Side } from "@courtflex/api";

const sideOut: MatchFormat = { target: 11, win_by: 2, best_of: 1, scoring: "side_out" };
const rally: MatchFormat = { ...sideOut, scoring: "rally" };
const r = (...winners: Side[]): ScoreInput[] => winners.map((winner) => ({ type: "rally", winner }));

describe("side-out scoring, doubles", () => {
  it("starts at 0-0-2 and only the serving side scores", () => {
    expect(replay([], sideOut, "doubles").called).toBe("0-0-2");
    let s = replay(r(0, 0), sideOut, "doubles");
    expect(s.games[0]!.points).toEqual([2, 0]);
    expect(s.called).toBe("2-0-2");
    // The receivers win a rally: side out (the first serving side had one server only).
    s = replay(r(0, 0, 1), sideOut, "doubles");
    expect(s).toMatchObject({ serving: 1, server: 1, called: "0-2-1" });
    expect(s.games[0]!.points).toEqual([2, 0]);
    // They lose the next rally: their second server serves.
    s = replay(r(0, 0, 1, 0), sideOut, "doubles");
    expect(s).toMatchObject({ serving: 1, server: 2, called: "0-2-2" });
    // And again: side out back to side A, server 1.
    s = replay(r(0, 0, 1, 0, 0), sideOut, "doubles");
    expect(s).toMatchObject({ serving: 0, server: 1, called: "2-0-1" });
  });

  it("wins a game at 11 by 2, not 11-10", () => {
    // Side A serves and wins 10 straight: game point, then the 11th point wins.
    const tenZero = r(...Array<Side>(10).fill(0));
    let s = replay([...tenZero], sideOut, "doubles");
    expect(s.game_point).toBe(0);
    s = replay([...tenZero, ...r(0)], sideOut, "doubles");
    expect(s.winner).toBe(0);
    expect(finalScore(s)).toBe("11-0");
  });

  it("needs a 2-point lead", () => {
    // Rally scoring makes this easy to set up: 10-10, then 11-10 isn't a win.
    const tenAll = r(...Array<Side>(10).fill(0), ...Array<Side>(10).fill(1));
    expect(
      replay(r(...[...Array<Side>(10).fill(0), ...Array<Side>(10).fill(1)], 0), rally, "doubles").winner,
    ).toBeNull();
    const s = replay([...tenAll, ...r(0, 0)], rally, "doubles");
    expect(s.winner).toBe(0);
    expect(finalScore(s)).toBe("12-10");
  });
});

describe("singles", () => {
  it("has no server number and sides out on every lost serve", () => {
    let s = replay(r(0), sideOut, "singles");
    expect(s.called).toBe("1-0");
    s = replay(r(0, 1), sideOut, "singles");
    expect(s).toMatchObject({ serving: 1, server: null, called: "0-1" });
  });
});

describe("undo", () => {
  it("cancels the latest rally still standing, without deleting anything", () => {
    const events: ScoreInput[] = [...r(0, 0, 1), { type: "undo" }];
    expect(replay(events, sideOut, "doubles").called).toBe("2-0-2");
    const twice: ScoreInput[] = [...events, { type: "undo" }];
    expect(replay(twice, sideOut, "doubles").games[0]!.points).toEqual([1, 0]);
    expect(replay([{ type: "undo" }], sideOut, "doubles").rallies).toBe(0); // nothing to undo
  });

  it("can take back the point that ended a game", () => {
    const won = r(...Array<Side>(11).fill(0));
    expect(replay(won, sideOut, "singles").winner).toBe(0);
    const undone = replay([...won, { type: "undo" }], sideOut, "singles");
    expect(undone.winner).toBeNull();
    expect(undone.games[0]!.points).toEqual([10, 0]);
  });
});

describe("best of 3", () => {
  it("plays games until one side wins two, switching who serves first", () => {
    const bo3: MatchFormat = { ...rally, best_of: 3 };
    const elevenA = Array<Side>(11).fill(0);
    const elevenB = Array<Side>(11).fill(1);
    let s = replay(r(...elevenA), bo3, "doubles");
    expect(s).toMatchObject({ current: 1, games_won: [1, 0], winner: null, serving: 1 });
    s = replay(r(...elevenA, ...elevenB), bo3, "doubles");
    expect(s.games_won).toEqual([1, 1]);
    s = replay(r(...elevenA, ...elevenB, ...Array<Side>(10).fill(0)), bo3, "doubles");
    expect(s.match_point).toBe(0);
    s = replay(r(...elevenA, ...elevenB, ...elevenA), bo3, "doubles");
    expect(s.winner).toBe(0);
    expect(finalScore(s)).toBe("11-0, 0-11, 11-0");
  });
});

describe("ELO", () => {
  it("matches the blueprint's example: equal 1200s, the winner gains 16", async () => {
    const { ratingChanges } = await import("@courtflex/api");
    const out = ratingChanges(
      [[{ id: "a", rating: 1200, games: 10 }], [{ id: "b", rating: 1200, games: 10 }]],
      0,
      {
        initial: 1200,
        provisional_matches: 5,
        k_provisional: 32,
        k_established: 32,
      },
    );
    expect(out).toEqual([
      { id: "a", old: 1200, change: 16, new: 1216 },
      { id: "b", old: 1200, change: -16, new: 1184 },
    ]);
  });

  it("an upset moves ratings more than an expected win", async () => {
    const { ratingChanges } = await import("@courtflex/api");
    const strong = { id: "s", rating: 1400, games: 20 };
    const weak = { id: "w", rating: 1200, games: 20 };
    const expectedWin = ratingChanges([[strong], [weak]], 0)[0]!.change;
    const upset = ratingChanges([[strong], [weak]], 1)[1]!.change;
    expect(upset).toBeGreaterThan(expectedWin);
  });

  it("doubles uses each side's average; provisional players move more", async () => {
    const { ratingChanges } = await import("@courtflex/api");
    const out = ratingChanges(
      [
        [
          { id: "new", rating: 1200, games: 0 },
          { id: "vet", rating: 1200, games: 30 },
        ],
        [
          { id: "x", rating: 1200, games: 30 },
          { id: "y", rating: 1200, games: 30 },
        ],
      ],
      0,
    );
    expect(out.find((p) => p.id === "new")!.change).toBe(16); // K 32 × 0.5
    expect(out.find((p) => p.id === "vet")!.change).toBe(12); // K 24 × 0.5
    expect(out.find((p) => p.id === "x")!.change).toBe(-12);
  });
});
