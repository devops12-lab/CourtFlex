// Phase 5, M4: tournament draws.
import { bracketSize, roundRobin, seedOrder, snakePools, standings } from "@courtflex/api";

describe("single elimination", () => {
  it("seeds so the top two can only meet in the final", () => {
    expect(seedOrder(2)).toEqual([1, 2]);
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    const sixteen = seedOrder(16);
    expect(sixteen.indexOf(1)).toBeLessThan(8);
    expect(sixteen.indexOf(2)).toBeGreaterThanOrEqual(8);
  });

  it("rounds up to a full bracket, so the top seeds get byes", () => {
    expect(bracketSize(2)).toBe(2);
    expect(bracketSize(5)).toBe(8);
    expect(bracketSize(8)).toBe(8);
    expect(bracketSize(9)).toBe(16);
    // 6 entries in 8 slots: seeds 7 and 8 don't exist, so 1 and 2 have byes.
    const order = seedOrder(8);
    const firstRound = [0, 2, 4, 6].map((i): [number, number] => [order[i]!, order[i + 1]!]);
    expect(firstRound.filter(([a, b]) => a > 6 || b > 6)).toEqual([
      [1, 8],
      [2, 7],
    ]);
  });
});

describe("round robin", () => {
  it("everyone plays everyone exactly once", () => {
    for (const n of [3, 4, 5, 6, 7]) {
      const rounds = roundRobin(n);
      const pairs = rounds.flat().map(([a, b]) => `${a}-${b}`);
      expect(new Set(pairs).size).toBe(pairs.length);
      expect(pairs.length).toBe((n * (n - 1)) / 2);
      // No one plays twice in a round.
      for (const r of rounds) {
        const seen = r.flat();
        expect(new Set(seen).size).toBe(seen.length);
      }
    }
  });
});

describe("pools", () => {
  it("snake by seed so pools are even", () => {
    expect(snakePools(8, 2)).toEqual([
      [0, 3, 4, 7],
      [1, 2, 5, 6],
    ]);
    expect(snakePools(6, 3)).toEqual([
      [0, 5],
      [1, 4],
      [2, 3],
    ]);
  });
});

describe("standings", () => {
  it("ranks by wins, then point difference, then points, then head to head", () => {
    const rows = standings(
      ["a", "b", "c"],
      [
        { a: "a", b: "b", points: [11, 9], winner: 0 },
        { a: "b", b: "c", points: [11, 2], winner: 0 },
        { a: "c", b: "a", points: [11, 5], winner: 0 },
      ],
    );
    // Everyone 1-1. Differences: a −4, b +7, c −3.
    expect(rows.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(rows[0]).toMatchObject({
      played: 2,
      wins: 1,
      losses: 1,
      points_for: 20,
      points_against: 13,
      diff: 7,
    });
  });
});
