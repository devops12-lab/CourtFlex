// Rankings API (Phase 5, M3; blueprint §9.6 /rankings).
import { http } from "msw";
import type { Leaderboard, MatchType, RankingArea, RankingScope } from "@courtflex/api";
import { users } from "./db";
import { geo } from "./geo";
import { areaName, board, homeAreas } from "./ranking-db";
import { ratingRules } from "./rating-db";
import { API, fail, invalid, ok, sessionUser } from "./http-helpers";

const isScope = (s: string | null): s is RankingScope =>
  s === "barangay" || s === "city" || s === "province" || s === "country" || s === "global";

export const rankingHandlers = [
  /** Public: anyone can see the leaderboards. Signed-in players default to their own areas. */
  http.get(`${API}/rankings`, ({ request }) => {
    const url = new URL(request.url);
    const type = (url.searchParams.get("type") ?? "doubles") as MatchType;
    if (type !== "singles" && type !== "doubles") return invalid({ type: ["Choose singles or doubles."] });
    const scope = url.searchParams.get("scope") ?? "country";
    if (!isScope(scope)) return invalid({ scope: ["Choose barangay, city, province or country."] });
    if (scope === "global")
      return fail(409, "Global rankings aren't open yet. They start once CourtFlex covers more countries.");
    const viewer = sessionUser();
    const mine = viewer ? homeAreas(viewer.id) : [];
    const areaId =
      url.searchParams.get("area") ??
      mine.find((a) => a.scope === scope)?.id ??
      (scope === "country" ? "ph" : null);
    if (!areaId) return invalid({ area: ["Choose an area."] });
    const name = areaName(scope, areaId);
    if (!name) return fail(404, "That area doesn't exist.");
    const area: RankingArea = { scope, id: areaId, name };
    const b = board(type, scope, areaId, viewer?.id);
    const me = viewer
      ? ([...b.ranked, ...b.provisional].find((e) => e.player.id === viewer.id) ?? null)
      : null;
    const result: Leaderboard = {
      type,
      area,
      ranked: b.ranked.slice(0, 100),
      provisional: b.provisional,
      me,
      minimum_matches: ratingRules.provisional_matches,
      my_areas: mine,
    };
    return ok(result);
  }),

  /** Areas at a level that have rated players, for choosing another area's board. */
  http.get(`${API}/rankings/areas`, ({ request }) => {
    const scope = new URL(request.url).searchParams.get("scope");
    if (!isScope(scope) || scope === "global")
      return invalid({ scope: ["Choose barangay, city, province or country."] });
    const ids = new Set(
      users
        .filter((u) => u.has_player_profile)
        .flatMap((u) => homeAreas(u.id))
        .filter((a) => a.scope === scope)
        .map((a) => a.id),
    );
    const areas: RankingArea[] = geo
      .filter((n) => n.level === scope && ids.has(n.id))
      .map((n) => ({ scope, id: n.id, name: areaName(scope, n.id)! }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return ok(areas);
  }),
];
