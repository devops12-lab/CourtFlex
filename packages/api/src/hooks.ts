import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import {
  availabilitySchema,
  courtDetailSchema,
  paymentAdjustmentSchema,
  scheduleExceptionSchema,
  staffMemberSchema,
  bookingDetailSchema,
  bookingSchema,
  calendarDaySchema,
  clubSchema,
  courtSchema,
  dailySummarySchema,
  meSchema,
  paymentRecordSchema,
  playerSearchSchema,
  subscriptionSchema,
} from "./schemas";
import { z } from "zod";

import type {
  AdjustmentInput,
  AvailabilitySlot,
  BookingDetail,
  Booking,
  CalendarDay,
  ClosureInput,
  Club,
  ClubSubscription,
  ClubUpdateInput,
  Court,
  CourtDetail,
  CourtInput,
  DailySummary,
  ISODate,
  Me,
  OperatingHours,
  PaymentAdjustment,
  PaymentRecord,
  PlayerSearchResult,
  PriceRuleInput,
  RecordPaymentInput,
  ScheduleException,
  StaffInviteInput,
  StaffMember,
  UUID,
  WalkInBookingInput,
} from "./types";

const courtListSchema = z.array(courtSchema);
const closureListSchema = z.array(scheduleExceptionSchema);
const staffListSchema = z.array(staffMemberSchema);

export const queryKeys = {
  me: ["me"] as const,
  club: (clubId: UUID) => ["clubs", clubId] as const,
  courts: (clubId: UUID) => ["clubs", clubId, "courts"] as const,
  calendar: (clubId: UUID, date: ISODate) => ["clubs", clubId, "calendar", date] as const,
  bookings: (clubId: UUID) => ["clubs", clubId, "bookings"] as const,
  booking: (clubId: UUID, bookingId: UUID) => ["clubs", clubId, "bookings", bookingId] as const,
  summary: (clubId: UUID, date: ISODate) => ["clubs", clubId, "summary", date] as const,
  availability: (courtId: UUID, date: ISODate, minutes: number) =>
    ["courts", courtId, "availability", date, minutes] as const,
  subscription: (clubId: UUID) => ["clubs", clubId, "subscription"] as const,
  playerSearch: (clubId: UUID, q: string) => ["clubs", clubId, "players", q] as const,
};

/** Availability and money must never look fresher than they are. */
const LIVE = { staleTime: 0, refetchOnWindowFocus: true } as const;

// ── Identity ──────────────────────────────────────────────

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api<Me>("/me", { schema: meSchema }),
    retry: (count, error) => !(error instanceof ApiError && error.isUnauthenticated) && count < 2,
    staleTime: 5 * 60_000,
    // "Not signed in" is an answer, not a failure: don't ask again each time another part of the page
    // reads it. Asking again would put the page back into its loading state and reopen it, in a loop.
    retryOnMount: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api<Me>("/auth/login", { method: "POST", body: input, schema: meSchema }),
    onSuccess: (me) => qc.setQueryData(queryKeys.me, me),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>("/auth/logout", { method: "POST" }),
    onSettled: () => qc.clear(),
  });
}

// ── Club ──────────────────────────────────────────────────

export function useClub(clubId: UUID | undefined) {
  return useQuery({
    queryKey: queryKeys.club(clubId ?? ""),
    queryFn: () => api<Club>(`/clubs/${clubId}`, { schema: clubSchema }),
    enabled: !!clubId,
  });
}

export function useCourts(clubId: UUID) {
  return useQuery({
    queryKey: queryKeys.courts(clubId),
    queryFn: () => api<Court[]>(`/clubs/${clubId}/courts`, { schema: courtListSchema }),
  });
}

export function useSubscription(clubId: UUID, enabled = true) {
  return useQuery({
    queryKey: queryKeys.subscription(clubId),
    queryFn: () => api<ClubSubscription>(`/clubs/${clubId}/subscription`, { schema: subscriptionSchema }),
    enabled,
  });
}

// ── Calendar and bookings ─────────────────────────────────

export function useCalendar(clubId: UUID, date: ISODate) {
  return useQuery({
    queryKey: queryKeys.calendar(clubId, date),
    queryFn: () =>
      api<CalendarDay>(`/clubs/${clubId}/calendar`, { query: { date }, schema: calendarDaySchema }),
    ...LIVE,
    refetchInterval: 60_000,
  });
}

export function useDailySummary(clubId: UUID, date: ISODate) {
  return useQuery({
    queryKey: queryKeys.summary(clubId, date),
    queryFn: () =>
      api<DailySummary>(`/clubs/${clubId}/reports/daily`, { query: { date }, schema: dailySummarySchema }),
    ...LIVE,
  });
}

export function useBooking(clubId: UUID, bookingId: UUID | null) {
  return useQuery({
    queryKey: queryKeys.booking(clubId, bookingId ?? ""),
    queryFn: () =>
      api<BookingDetail>(`/clubs/${clubId}/bookings/${bookingId}`, { schema: bookingDetailSchema }),
    enabled: !!bookingId,
    ...LIVE,
  });
}

export function useAvailability(clubId: UUID, courtId: UUID | undefined, date: ISODate, minutes: number) {
  return useQuery({
    queryKey: queryKeys.availability(courtId ?? "", date, minutes),
    queryFn: () =>
      api<AvailabilitySlot[]>(`/clubs/${clubId}/courts/${courtId}/availability`, {
        query: { date, duration_minutes: String(minutes) },
        schema: availabilitySchema,
      }),
    enabled: !!courtId,
    ...LIVE,
  });
}

export function usePlayerSearch(clubId: UUID, q: string) {
  return useQuery({
    queryKey: queryKeys.playerSearch(clubId, q),
    queryFn: () =>
      api<PlayerSearchResult[]>(`/clubs/${clubId}/players`, {
        query: { search: q },
        schema: playerSearchSchema,
      }),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });
}

function invalidateClubDay(qc: ReturnType<typeof useQueryClient>, clubId: UUID) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["clubs", clubId] }),
    qc.invalidateQueries({ queryKey: ["courts"] }),
  ]);
}

export function useCreateWalkIn(clubId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WalkInBookingInput) =>
      api<Booking>(`/clubs/${clubId}/bookings/walk-in`, {
        method: "POST",
        body: input,
        schema: bookingSchema,
      }),
    // Refresh even on failure: a conflict means our view of the day is stale.
    onSettled: () => invalidateClubDay(qc, clubId),
  });
}

export function useRecordPayment(clubId: UUID, bookingId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordPaymentInput) =>
      api<PaymentRecord>(`/clubs/${clubId}/bookings/${bookingId}/payments`, {
        method: "POST",
        body: input,
        schema: paymentRecordSchema,
      }),
    onSettled: () => invalidateClubDay(qc, clubId),
  });
}

/** GCash and Maya bookings whose receipt is waiting for staff to check. */
export function useReceiptsToCheck(clubId: UUID | undefined) {
  return useQuery({
    queryKey: ["clubs", clubId, "receipts"],
    queryFn: () => api<Booking[]>(`/clubs/${clubId}/receipts`, { schema: z.array(bookingSchema) }),
    enabled: !!clubId,
    refetchInterval: 30_000,
  });
}

export type ReceiptAction =
  { action: "approve" } | { action: "reject"; reason: string } | { action: "pay-at-court" };

/** Approve a receipt (records the payment), turn it down with a reason, or switch to paying at the court. */
export function useReviewReceipt(clubId: UUID, bookingId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, ...body }: ReceiptAction) =>
      api<Booking>(
        `/clubs/${clubId}/bookings/${bookingId}/${action === "pay-at-court" ? "pay-at-court" : `receipt/${action}`}`,
        {
          method: "POST",
          body,
          schema: bookingSchema,
        },
      ),
    onSettled: () =>
      Promise.all([
        invalidateClubDay(qc, clubId),
        qc.invalidateQueries({ queryKey: ["clubs", clubId, "receipts"] }),
      ]),
  });
}

export function useCancelBooking(clubId: UUID, bookingId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { reason: string }) =>
      api<Booking>(`/clubs/${clubId}/bookings/${bookingId}/cancel`, {
        method: "POST",
        body: input,
        schema: bookingSchema,
      }),
    onSettled: () => invalidateClubDay(qc, clubId),
  });
}

// ── Courts, hours, prices, closures (§9.3) ────────────────

export function useCourt(clubId: UUID, courtId: UUID | undefined) {
  return useQuery({
    queryKey: ["clubs", clubId, "courts", courtId ?? ""],
    queryFn: () => api<CourtDetail>(`/clubs/${clubId}/courts/${courtId}`, { schema: courtDetailSchema }),
    enabled: !!courtId,
  });
}

export function useCreateCourt(clubId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CourtInput) =>
      api<CourtDetail>(`/clubs/${clubId}/courts`, { method: "POST", body: input, schema: courtDetailSchema }),
    onSettled: () => invalidateClubDay(qc, clubId),
  });
}

export function useUpdateCourt(clubId: UUID, courtId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CourtInput) =>
      api<CourtDetail>(`/clubs/${clubId}/courts/${courtId}`, {
        method: "PATCH",
        body: input,
        schema: courtDetailSchema,
      }),
    onSettled: () => invalidateClubDay(qc, clubId),
  });
}

export function useSaveCourtHours(clubId: UUID, courtId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hours: OperatingHours[]) =>
      api<CourtDetail>(`/clubs/${clubId}/courts/${courtId}/hours`, {
        method: "PUT",
        body: { hours },
        schema: courtDetailSchema,
      }),
    onSettled: () => invalidateClubDay(qc, clubId),
  });
}

export function useSavePriceRules(clubId: UUID, courtId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules: PriceRuleInput[]) =>
      api<CourtDetail>(`/clubs/${clubId}/courts/${courtId}/price-rules`, {
        method: "PUT",
        body: { rules },
        schema: courtDetailSchema,
      }),
    onSettled: () => invalidateClubDay(qc, clubId),
  });
}

export function useClosures(clubId: UUID) {
  return useQuery({
    queryKey: ["clubs", clubId, "closures"],
    queryFn: () =>
      api<ScheduleException[]>(`/clubs/${clubId}/court-exceptions`, { schema: closureListSchema }),
  });
}

export function useCreateClosure(clubId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClosureInput) =>
      api<ScheduleException>(`/clubs/${clubId}/court-exceptions`, {
        method: "POST",
        body: input,
        schema: scheduleExceptionSchema,
      }),
    onSettled: () => invalidateClubDay(qc, clubId),
  });
}

export function useDeleteClosure(clubId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: UUID) => api<void>(`/clubs/${clubId}/court-exceptions/${id}`, { method: "DELETE" }),
    onSettled: () => invalidateClubDay(qc, clubId),
  });
}

// ── Club profile and settings ─────────────────────────────

export function useUpdateClub(clubId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClubUpdateInput) =>
      api<Club>(`/clubs/${clubId}`, { method: "PATCH", body: input, schema: clubSchema }),
    onSuccess: (club) => qc.setQueryData(queryKeys.club(clubId), club),
    // The club's name also appears in the signed-in user's club list.
    onSettled: () =>
      Promise.all([invalidateClubDay(qc, clubId), qc.invalidateQueries({ queryKey: queryKeys.me })]),
  });
}

// ── Staff ─────────────────────────────────────────────────

export function useStaff(clubId: UUID) {
  return useQuery({
    queryKey: ["clubs", clubId, "staff"],
    queryFn: () => api<StaffMember[]>(`/clubs/${clubId}/staff`, { schema: staffListSchema }),
  });
}

export function useInviteStaff(clubId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StaffInviteInput) =>
      api<StaffMember>(`/clubs/${clubId}/staff`, { method: "POST", body: input, schema: staffMemberSchema }),
    onSettled: () => invalidateClubDay(qc, clubId),
  });
}

export function useUpdateStaffRole(clubId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      membershipId,
      role_key,
    }: {
      membershipId: UUID;
      role_key: StaffInviteInput["role_key"];
    }) =>
      api<StaffMember>(`/clubs/${clubId}/staff/${membershipId}`, {
        method: "PATCH",
        body: { role_key },
        schema: staffMemberSchema,
      }),
    onSettled: () => invalidateClubDay(qc, clubId),
  });
}

export function useRemoveStaff(clubId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: UUID) =>
      api<void>(`/clubs/${clubId}/staff/${membershipId}`, { method: "DELETE" }),
    onSettled: () => invalidateClubDay(qc, clubId),
  });
}

// ── Payment adjustments ───────────────────────────────────

export function useAdjustPayment(clubId: UUID, bookingId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, ...input }: AdjustmentInput & { paymentId: UUID }) =>
      api<PaymentAdjustment>(`/clubs/${clubId}/bookings/${bookingId}/payments/${paymentId}/adjustments`, {
        method: "POST",
        body: input,
        schema: paymentAdjustmentSchema,
      }),
    onSettled: () => invalidateClubDay(qc, clubId),
  });
}
