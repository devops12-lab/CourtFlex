import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  TournamentDetail,
  TournamentHostOption,
  TournamentInput,
  TournamentStatus,
  TournamentSummary,
} from "./tournament-types";

const T = ["tournaments"] as const;

export function useTournaments(status?: TournamentStatus) {
  return useQuery({
    queryKey: [...T, "list", status ?? "all"],
    queryFn: () => api<TournamentSummary[]>("/tournaments", { query: { status } }),
  });
}

/** A tournament. While it's being played, it refreshes every 10 seconds. */
export function useTournament(idOrSlug: string | undefined) {
  return useQuery({
    queryKey: [...T, "one", idOrSlug],
    queryFn: () => api<TournamentDetail>(`/tournaments/${idOrSlug}`),
    enabled: !!idOrSlug,
    refetchInterval: (q) => (q.state.data?.status === "in_progress" ? 10_000 : false),
  });
}

export function useVenueTournaments(clubId: string) {
  return useQuery({
    queryKey: [...T, "venue", clubId],
    queryFn: () => api<TournamentSummary[]>(`/clubs/${clubId}/tournaments`),
  });
}

/** Venues and clubs the viewer can host a tournament for. */
export function useTournamentHosts(enabled = true) {
  return useQuery({
    queryKey: [...T, "hosts"],
    queryFn: () => api<TournamentHostOption[]>("/tournaments/hosting-options"),
    enabled,
  });
}

export function useCreateTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TournamentInput) =>
      api<TournamentDetail>("/tournaments", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: T }),
  });
}

function useTournamentAction<B>(id: string, path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: B) => api<TournamentDetail>(`/tournaments/${id}/${path}`, { method: "POST", body }),
    onSuccess: (t) => {
      qc.setQueryData([...T, "one", t.slug], t);
      qc.setQueryData([...T, "one", t.id], t);
      void qc.invalidateQueries({ queryKey: [...T, "list"] });
      void qc.invalidateQueries({ queryKey: ["matches"] });
    },
  });
}

/** Doubles: `partner_id` is required. */
export const useRegisterTournament = (id: string) =>
  useTournamentAction<{ partner_id?: string }>(id, "register");
export const useWithdrawTournament = (id: string) =>
  useTournamentAction<Record<string, never>>(id, "withdraw");
/** Makes the draw (seeded by rating) and the first matches. */
export const useStartTournament = (id: string) => useTournamentAction<Record<string, never>>(id, "start");
export const useCancelTournament = (id: string) => useTournamentAction<{ reason: string }>(id, "cancel");
