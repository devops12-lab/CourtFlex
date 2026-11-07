import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { NotificationPage, NotificationPreferences } from "./notification-types";

const N = ["notifications"] as const;

/** The signed-in player's notifications, newest first. Checks for new ones every 30 seconds. */
export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: N,
    queryFn: () => api<NotificationPage>("/notifications"),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: N }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: N }),
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: [...N, "preferences"],
    queryFn: () => api<NotificationPreferences>("/notification-preferences"),
  });
}

export function useSaveNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: NotificationPreferences) =>
      api<NotificationPreferences>("/notification-preferences", { method: "PUT", body: p }),
    onSuccess: (p) => qc.setQueryData([...N, "preferences"], p),
  });
}
