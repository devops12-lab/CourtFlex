import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  AdminClubDetail,
  AdminClubRow,
  AdminDashboard,
  AdminDispute,
  AdminRatingRow,
  AdminInvoiceRow,
  AdminPlan,
  AdminRevenue,
  AdminSubscriptionRow,
  AdminVenueDetail,
  AdminVenueRow,
  Announcement,
  AnnouncementInput,
  AuditPage,
  OrgDecisionInput,
  OrgKind,
  InvoicePaymentMethod,
  OrgStatus,
  PlatformSettings,
  RatingAdjustment,
  RatingRulesInput,
  SubscriptionPlanInput,
} from "./admin-types";

export const adminKeys = {
  all: ["admin"] as const,
  dashboard: ["admin", "dashboard"] as const,
};

/** Platform numbers, the review queue and recent admin activity. */
export function useAdminDashboard() {
  return useQuery({
    queryKey: adminKeys.dashboard,
    queryFn: () => api<AdminDashboard>("/admin/dashboard"),
  });
}

// ── Venues and clubs (A2) ─────────────────────────────────

export interface OrgSearch {
  q?: string;
  status?: OrgStatus | "";
}

export function useAdminVenues(search: OrgSearch) {
  return useQuery({
    queryKey: [...adminKeys.all, "venues", search],
    queryFn: () =>
      api<AdminVenueRow[]>("/admin/venues", {
        query: { q: search.q || undefined, status: search.status || undefined },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useAdminVenue(id: string | undefined) {
  return useQuery({
    queryKey: [...adminKeys.all, "venue", id],
    queryFn: () => api<AdminVenueDetail>(`/admin/venues/${id}`),
    enabled: !!id,
  });
}

export function useAdminClubs(search: OrgSearch) {
  return useQuery({
    queryKey: [...adminKeys.all, "clubs", search],
    queryFn: () =>
      api<AdminClubRow[]>("/admin/clubs", {
        query: { q: search.q || undefined, status: search.status || undefined },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useAdminClub(id: string | undefined) {
  return useQuery({
    queryKey: [...adminKeys.all, "club", id],
    queryFn: () => api<AdminClubDetail>(`/admin/clubs/${id}`),
    enabled: !!id,
  });
}

/** Approve, decline, suspend or reactivate. Refreshes every admin view afterwards. */
export function useOrgDecision(kind: OrgKind, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OrgDecisionInput) =>
      api(`/admin/${kind === "venue" ? "venues" : "clubs"}/${id}/decision`, { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

// ── Plans, subscriptions, invoices, revenue (A4) ──────────

export function useAdminPlans() {
  return useQuery({
    queryKey: [...adminKeys.all, "plans"],
    queryFn: () => api<AdminPlan[]>("/admin/plans"),
  });
}

/** Creates a plan, or edits the one with `code`. */
export function useSaveSubscriptionPlan(code?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubscriptionPlanInput) =>
      api<AdminPlan>(code ? `/admin/plans/${code}` : "/admin/plans", {
        method: code ? "PATCH" : "POST",
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

export function useAdminSubscriptions(search: { q?: string; status?: string }) {
  return useQuery({
    queryKey: [...adminKeys.all, "subscriptions", search],
    queryFn: () =>
      api<AdminSubscriptionRow[]>("/admin/subscriptions", {
        query: { q: search.q || undefined, status: search.status || undefined },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useExtendTrial(subscriptionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { days: number; reason: string }) =>
      api<AdminSubscriptionRow>(`/admin/subscriptions/${subscriptionId}/extend-trial`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

export function useChangePlan(subscriptionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { plan_code: string; reason?: string }) =>
      api<AdminSubscriptionRow>(`/admin/subscriptions/${subscriptionId}/change-plan`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

export function useAdminInvoices(search: { q?: string; status?: string }) {
  return useQuery({
    queryKey: [...adminKeys.all, "invoices", search],
    queryFn: () =>
      api<AdminInvoiceRow[]>("/admin/invoices", {
        query: { q: search.q || undefined, status: search.status || undefined },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useMarkInvoicePaid(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { method: InvoicePaymentMethod; reference?: string }) =>
      api<AdminInvoiceRow>(`/admin/invoices/${invoiceId}/mark-paid`, { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

export function useVoidInvoice(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { reason: string }) =>
      api<AdminInvoiceRow>(`/admin/invoices/${invoiceId}/void`, { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

export function useAdminRevenue() {
  return useQuery({
    queryKey: [...adminKeys.all, "revenue"],
    queryFn: () => api<AdminRevenue>("/admin/revenue"),
  });
}

// ── Audit log, announcements, settings (A5) ───────────────

export function useAuditLog(search: { q?: string; type?: string; page?: number }) {
  return useQuery({
    queryKey: [...adminKeys.all, "audit", search],
    queryFn: () =>
      api<AuditPage>("/admin/audit-logs", {
        query: { q: search.q || undefined, type: search.type || undefined, page: String(search.page ?? 1) },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useAdminAnnouncements() {
  return useQuery({
    queryKey: [...adminKeys.all, "announcements"],
    queryFn: () => api<Announcement[]>("/admin/announcements"),
  });
}

/** Posts an announcement, or edits the one with `id`. Refreshes the banners too. */
export function useSaveAnnouncement(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AnnouncementInput) =>
      api<Announcement>(id ? `/admin/announcements/${id}` : "/admin/announcements", {
        method: id ? "PATCH" : "POST",
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      void qc.invalidateQueries({ queryKey: ["platform"] });
    },
  });
}

export function useEndAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Announcement>(`/admin/announcements/${id}/end`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      void qc.invalidateQueries({ queryKey: ["platform"] });
    },
  });
}

export function useSavePlatformSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlatformSettings) =>
      api<PlatformSettings>("/admin/settings", { method: "PUT", body: input }),
    onSuccess: (s) => {
      qc.setQueryData(["platform", "settings"], s);
      void qc.invalidateQueries({ queryKey: adminKeys.all });
    },
  });
}

// ── Competition (Phase 5, M5) ─────────────────────────────

export function useAdminDisputes(status: "open" | "resolved") {
  return useQuery({
    queryKey: [...adminKeys.all, "disputes", status],
    queryFn: () => api<AdminDispute[]>("/admin/disputes", { query: { status } }),
  });
}

/** Keep the disputed result (official, rated) or void the match. The note is shown to the players. */
export function useResolveDispute(matchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { decision: "keep" | "void"; note: string }) =>
      api<AdminDispute>(`/admin/matches/${matchId}/resolve`, { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

/** Void an official result and undo its rating changes with correcting entries. */
export function useReverseMatch(matchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { reason: string }) =>
      api<{ reversed: string; rating_changes_undone: number }>(`/admin/matches/${matchId}/reverse`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

export function useAdminRatings(q: string) {
  return useQuery({
    queryKey: [...adminKeys.all, "ratings", q],
    queryFn: () => api<AdminRatingRow[]>("/admin/ratings", { query: { q: q || undefined } }),
    placeholderData: keepPreviousData,
  });
}

export function useRatingAdjustments() {
  return useQuery({
    queryKey: [...adminKeys.all, "rating-adjustments"],
    queryFn: () => api<RatingAdjustment[]>("/admin/ratings/adjustments"),
  });
}

export function useAdjustRating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { player_id: string; type: "singles" | "doubles"; rating: number; reason: string }) =>
      api("/admin/ratings/adjust", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

export function useRatingRules() {
  return useQuery({
    queryKey: [...adminKeys.all, "rating-rules"],
    queryFn: () => api<RatingRulesInput>("/admin/rating-rules"),
  });
}

export function useSaveRatingRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RatingRulesInput) =>
      api<RatingRulesInput>("/admin/rating-rules", { method: "PUT", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
}
