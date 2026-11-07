// Platform-wide settings and announcements every app reads (Phase 6, A5).
import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { Announcement, PlatformSettings } from "./admin-types";

/** Shown until the settings load, and if they can't. Matches the platform's defaults. */
export const defaultPlatformSettings: PlatformSettings = {
  trial_days: 14,
  venue_signups_open: true,
  support_email: "support@courtflex.test",
  support_phone: "0917 555 0100",
};

/** Trial length, sign-ups open, support contact. Public, cached for a few minutes. */
export function usePlatformSettings() {
  const q = useQuery({
    queryKey: ["platform", "settings"],
    queryFn: () => api<PlatformSettings>("/platform/settings"),
    staleTime: 5 * 60_000,
  });
  return { ...q, settings: q.data ?? defaultPlatformSettings };
}

/** Live announcements for the player app or the owner portal. */
export function useAnnouncements(audience: "players" | "owners") {
  return useQuery({
    queryKey: ["platform", "announcements", audience],
    queryFn: () => api<Announcement[]>("/announcements", { query: { for: audience } }),
    staleTime: 60_000,
  });
}
