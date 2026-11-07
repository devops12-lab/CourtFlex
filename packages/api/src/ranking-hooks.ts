import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { MatchType } from "./match-types";
import type { Leaderboard, RankingArea, RankingScope } from "./ranking-types";

/** A leaderboard. Without `area`, signed-in players get their own area; visitors the country. */
export function useLeaderboard(search: { type: MatchType; scope: RankingScope; area?: string }) {
  return useQuery({
    queryKey: ["rankings", search],
    queryFn: () =>
      api<Leaderboard>("/rankings", {
        query: { type: search.type, scope: search.scope, area: search.area || undefined },
      }),
    enabled: search.scope !== "global",
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** Areas at a level that have rated players. */
export function useRankingAreas(scope: RankingScope) {
  return useQuery({
    queryKey: ["rankings", "areas", scope],
    queryFn: () => api<RankingArea[]>("/rankings/areas", { query: { scope } }),
    enabled: scope !== "global" && scope !== "country",
    staleTime: 5 * 60_000,
  });
}
