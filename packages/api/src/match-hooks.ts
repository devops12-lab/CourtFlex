import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { MatchDetail, MatchInput, MatchSummary, PlayerStats, ScoreEventView } from "./match-types";
import type { Side } from "./scoring";

export const matchKeys = {
  all: ["matches"] as const,
  mine: ["matches", "mine"] as const,
  venue: (clubId: string) => ["matches", "venue", clubId] as const,
  one: (id: string) => ["matches", "one", id] as const,
  events: (id: string) => ["matches", "events", id] as const,
};

/** The signed-in player's matches: live, upcoming and recent. */
export function useMyMatches() {
  return useQuery({ queryKey: matchKeys.mine, queryFn: () => api<MatchSummary[]>("/player/matches") });
}

/** Matches on a venue's courts, for its staff. */
export function useVenueMatches(clubId: string) {
  return useQuery({
    queryKey: matchKeys.venue(clubId),
    queryFn: () => api<MatchSummary[]>(`/clubs/${clubId}/matches`),
    refetchInterval: 10_000,
  });
}

/**
 * One match. While it's being played, it checks for new points every second:
 * the server's score is the official one (the real backend pushes instead).
 */
export function useMatch(id: string | undefined) {
  return useQuery({
    queryKey: matchKeys.one(id ?? ""),
    queryFn: () => api<MatchDetail>(`/matches/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === "in_progress" ? 1_000 : 10_000),
    refetchIntervalInBackground: false,
  });
}

export function useMatchEvents(id: string, enabled: boolean) {
  return useQuery({
    queryKey: matchKeys.events(id),
    queryFn: () => api<ScoreEventView[]>(`/matches/${id}/events`),
    enabled,
  });
}

export function useCreateMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MatchInput) => api<MatchDetail>("/matches", { method: "POST", body: input }),
    onSuccess: (m) => {
      qc.setQueryData(matchKeys.one(m.id), m);
      void qc.invalidateQueries({ queryKey: matchKeys.all });
    },
  });
}

/** A fresh id per tap, so a retry after a dropped connection never adds the point twice. */
export const newEventId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function useMatchAction<T>(id: string, path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: T) => api<MatchDetail>(`/matches/${id}/${path}`, { method: "POST", body }),
    onSuccess: (m) => {
      qc.setQueryData(matchKeys.one(id), m);
      void qc.invalidateQueries({ queryKey: matchKeys.events(id) });
      void qc.invalidateQueries({ queryKey: matchKeys.mine });
      void qc.invalidateQueries({ queryKey: [...matchKeys.all, "stats"] });
    },
  });
}

export const useStartMatch = (id: string) => useMatchAction<Record<string, never>>(id, "start");
/** One rally won by `winner`. `event_uuid` makes it safe to retry. */
export const useScorePoint = (id: string) =>
  useMatchAction<{ event_uuid: string; winner: Side }>(id, "score-events");
export const useUndoPoint = (id: string) => useMatchAction<{ event_uuid: string }>(id, "undo");
export const useSubmitResult = (id: string) => useMatchAction<Record<string, never>>(id, "submit-result");
export const useVoidMatch = (id: string) => useMatchAction<{ reason: string }>(id, "void");
export const useChangeScorer = (id: string) => useMatchAction<{ scorer_id: string }>(id, "scorer");

// ── Results and statistics (M2) ───────────────────────────

/** The other side agrees with the result: it's official and rated. */
export const useConfirmResult = (id: string) => useMatchAction<Record<string, never>>(id, "confirm-result");
/** A player says the result is wrong: it doesn't count until an organizer decides. */
export const useDisputeResult = (id: string) => useMatchAction<{ reason: string }>(id, "dispute");
/** An organizer who isn't playing (or the Super Admin) makes the result official. */
export const useVerifyResult = (id: string) => useMatchAction<Record<string, never>>(id, "verify");

/** A player's ratings, record and recent matches. `"me"` for the signed-in player. */
export function usePlayerStats(playerId: string | undefined) {
  return useQuery({
    queryKey: [...matchKeys.all, "stats", playerId],
    queryFn: () => api<PlayerStats>(`/players/${playerId}/stats`),
    enabled: !!playerId,
  });
}
