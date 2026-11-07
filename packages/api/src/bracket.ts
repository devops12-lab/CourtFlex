// Tournament draws (Phase 5, M4): pure functions, shared by the server and
// screens, tested on their own.

/**
 * Standard bracket order for `size` (a power of 2): seed numbers top to bottom,
 * so 1 and 2 can only meet in the final, 1–4 in the semifinals, and so on.
 * 8 → [1, 8, 4, 5, 2, 7, 3, 6].
 */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

/** The bracket size for `entries`: the next power of 2 (at least 2). */
export const bracketSize = (entries: number) => 2 ** Math.max(1, Math.ceil(Math.log2(Math.max(entries, 2))));

/**
 * Round-robin rounds by the circle method: every entry plays every other once.
 * With an odd count, one entry sits out each round. Returns pairs of indexes.
 */
export function roundRobin(count: number): Array<Array<[number, number]>> {
  const ids = Array.from({ length: count }, (_, i) => i);
  if (count % 2 === 1) ids.push(-1); // the bye
  const n = ids.length;
  const rounds: Array<Array<[number, number]>> = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i]!;
      const b = ids[n - 1 - i]!;
      if (a !== -1 && b !== -1) pairs.push(a < b ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    // Keep the first fixed; rotate the rest.
    ids.splice(1, 0, ids.pop()!);
  }
  return rounds;
}

/** Pools by snake order on seed: 1→A, 2→B, 3→B, 4→A… so pools are even. Indexes into `entries`. */
export function snakePools(count: number, pools: number): number[][] {
  const out: number[][] = Array.from({ length: pools }, () => []);
  for (let i = 0; i < count; i++) {
    const lap = Math.floor(i / pools);
    const pos = i % pools;
    out[lap % 2 === 0 ? pos : pools - 1 - pos]!.push(i);
  }
  return out;
}

export interface StandingRow<Id extends string = string> {
  id: Id;
  played: number;
  wins: number;
  losses: number;
  points_for: number;
  points_against: number;
  /** points_for − points_against */
  diff: number;
}

/**
 * Standings: most wins, then point difference, then points scored, then the
 * head-to-head result between the two, then seed.
 */
export function standings<Id extends string>(
  ids: Id[],
  results: Array<{ a: Id; b: Id; points: [number, number]; winner: 0 | 1 }>,
): StandingRow<Id>[] {
  const rows = new Map<Id, StandingRow<Id>>(
    ids.map((id) => [id, { id, played: 0, wins: 0, losses: 0, points_for: 0, points_against: 0, diff: 0 }]),
  );
  for (const r of results) {
    const a = rows.get(r.a);
    const b = rows.get(r.b);
    if (!a || !b) continue;
    a.played++;
    b.played++;
    a.points_for += r.points[0];
    a.points_against += r.points[1];
    b.points_for += r.points[1];
    b.points_against += r.points[0];
    if (r.winner === 0) {
      a.wins++;
      b.losses++;
    } else {
      b.wins++;
      a.losses++;
    }
  }
  for (const row of rows.values()) row.diff = row.points_for - row.points_against;
  const headToHead = (x: Id, y: Id) => {
    const m = results.find((r) => (r.a === x && r.b === y) || (r.a === y && r.b === x));
    if (!m) return 0;
    const xWon = (m.a === x && m.winner === 0) || (m.b === x && m.winner === 1);
    return xWon ? -1 : 1;
  };
  return [...rows.values()].sort(
    (x, y) =>
      y.wins - x.wins ||
      y.diff - x.diff ||
      y.points_for - x.points_for ||
      headToHead(x.id, y.id) ||
      ids.indexOf(x.id) - ids.indexOf(y.id),
  );
}
