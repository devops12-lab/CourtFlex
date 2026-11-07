// Super Admin: every user account (A3). Search, look at an account across the
// system, suspend or reactivate it with a reason, and send a password reset.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { adminKeys } from "./admin-hooks";
import type { AuditEntry } from "./admin-types";
import type { ClubRole, ISODateTime, PersonRef, UUID } from "./types";

/** What someone is on CourtFlex. One account can be several. */
export type UserRole = "super_admin" | "venue_staff" | "club_admin" | "player";

export type UserStatus = "active" | "suspended" | "unverified";

export interface AdminUserRow {
  id: UUID;
  name: string;
  email: string;
  phone: string | null;
  roles: UserRole[];
  status: UserStatus;
  /** Venues they own or work at, e.g. "Owner at Mauban Pickleball Courts". */
  venue_roles: Array<{ club_id: UUID; club_name: string; role_key: ClubRole }>;
}

export interface AdminUserDetail extends AdminUserRow {
  home_city: string | null;
  player: { skill: string; location: string | null } | null;
  clubs: Array<{ id: UUID; name: string; role: string; status: string }>;
  bookings: { upcoming: number; total: number };
  suspension: { at: ISODateTime; by: PersonRef; reason: string } | null;
  history: AuditEntry[];
}

export interface UserSearch {
  q?: string;
  role?: UserRole | "";
  status?: UserStatus | "";
}

export function useAdminUsers(search: UserSearch) {
  return useQuery({
    queryKey: [...adminKeys.all, "users", search],
    queryFn: () =>
      api<AdminUserRow[]>("/admin/users", {
        query: {
          q: search.q || undefined,
          role: search.role || undefined,
          status: search.status || undefined,
        },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useAdminUser(id: string | undefined) {
  return useQuery({
    queryKey: [...adminKeys.all, "user", id],
    queryFn: () => api<AdminUserDetail>(`/admin/users/${id}`),
    enabled: !!id,
  });
}

/** Suspend (reason required, the person sees it when they try to sign in) or reactivate. */
export function useUserStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { status: "suspended" | "active"; reason?: string }) =>
      api(`/admin/users/${id}/status`, { method: "PATCH", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

/** Emails the person a link to choose a new password. The mock API returns the link instead. */
export function useSendPasswordReset(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ sent: true; mock_reset_url?: string }>(`/admin/users/${id}/password-reset`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
}
