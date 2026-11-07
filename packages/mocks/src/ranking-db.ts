// Leaderboards (Phase 5, M3). One rating per player per format (rating-db),
// filtered by the player's verified home location into barangay, city,
// province and country boards. Global exists but is off (blueprint §12.6).
import type { MatchType, RankingArea, RankingEntry, RankingScope } from "@courtflex/api";
import { users } from "./db";
import { cityByName, geoById, geoChain, geoChildren } from "./geo";
import { profiles } from "./player-db";
import { isProvisional, profileOf, ratingEvents, ratingRules } from "./rating-db";

// Every player has a home barangay (players added after the first seeding included).
for (const u of users) {
  if (!u.has_player_profile || profiles[u.id]) continue;
  const city = u.home_city ? cityByName(u.home_city) : undefined;
  const barangays = city ? geoChildren(city.id) : [];
  const pick = barangays[Number(u.id.replace(/\D/g, "")) % Math.max(barangays.length, 1)];
  profiles[u.id] = {
    user_id: u.id,
    display_name: u.name,
    bio: "",
    play_formats: ["doubles"],
    preferred_times: ["evening"],
    visibility: "public",
    barangay_id: pick?.id ?? null,
    location_verified: !!pick,
  };
}

export const SCOPES: Exclude<RankingScope, "global">[] = ["barangay", "city", "province", "country"];

/** The player's home area at each level, from their verified home barangay. */
export function homeAreas(playerId: string): RankingArea[] {
  const p = profiles[playerId];
  if (!p?.barangay_id || !p.location_verified) return [];
  const chain = geoChain(p.barangay_id);
  if (!chain) return [];
  return [
    { scope: "barangay", id: chain.barangay.id, name: `${chain.barangay.name}, ${chain.city.name}` },
    { scope: "city", id: chain.city.id, name: `${chain.city.name}, ${chain.province.name}` },
    { scope: "province", id: chain.province.id, name: chain.province.name },
    { scope: "country", id: chain.country.id, name: chain.country.name },
  ];
}

export function areaName(scope: RankingScope, id: string): string | null {
  const n = geoById(id);
  if (!n || n.level !== scope) return null;
  if (scope === "barangay") return `${n.name}, ${geoById(n.parent_id)!.name}`;
  if (scope === "city") return `${n.name}, ${geoById(n.parent_id)!.name}`;
  return n.name;
}

const inArea = (playerId: string, scope: RankingScope, areaId: string) =>
  homeAreas(playerId).some((a) => a.scope === scope && a.id === areaId);

/** A player's rating and rated-match count as they were at a moment (from the ledger). */
function asOf(playerId: string, type: MatchType, at: string) {
  const before = ratingEvents.filter(
    (e) => e.player_id === playerId && e.type === type && e.created_at <= at,
  );
  if (before.length === 0) return { rating: ratingRules.initial, games: 0 };
  const last = before.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
  return { rating: last.new, games: before.length };
}

const order = <T extends { rating: number; games: number; name: string }>(list: T[]) =>
  [...list].sort((a, b) => b.rating - a.rating || b.games - a.games || a.name.localeCompare(b.name));

/**
 * The leaderboard for one area. Players who keep their profile private are
 * left out, except for themselves (`viewer`).
 */
export function board(type: MatchType, scope: RankingScope, areaId: string, viewer?: string) {
  const members = users.filter(
    (u) =>
      u.has_player_profile &&
      inArea(u.id, scope, areaId) &&
      (profiles[u.id]?.visibility !== "private" || u.id === viewer),
  );
  const rows = members
    .map((u) => {
      const p = profileOf(u.id, type);
      return { u, p, name: u.name, rating: p.rating, games: p.games };
    })
    .filter((r) => r.games > 0);

  // A week ago, for movement.
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const then = order(
    members
      .map((u) => ({ id: u.id, name: u.name, ...asOf(u.id, type, weekAgo) }))
      .filter((r) => r.games >= ratingRules.provisional_matches),
  );
  const rankThen = new Map(then.map((r, i) => [r.id, i + 1]));

  const ranked = order(rows.filter((r) => !isProvisional(r.p)));
  const entry = (r: (typeof rows)[number], rank: number | null): RankingEntry => ({
    rank,
    player: { id: r.u.id, name: r.u.name, city: r.u.home_city },
    rating: r.rating,
    games: r.games,
    wins: r.p.wins,
    losses: r.p.losses,
    provisional: rank === null,
    movement: rank !== null && rankThen.has(r.u.id) ? rankThen.get(r.u.id)! - rank : null,
  });
  return {
    ranked: ranked.map((r, i) => entry(r, i + 1)),
    provisional: order(rows.filter((r) => isProvisional(r.p))).map((r) => entry(r, null)),
  };
}
