import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./client";
import type {
  ClubListing,
  ClubMember,
  ClubMemberDetail,
  ClubProfile,
  CommunityInput,
  FeePaymentInput,
  FeeRefundInput,
  JoinClubInput,
  LedgerEntry,
  LedgerKind,
  MembershipPlan,
  MembershipReceiptInput,
  MemberSummary,
  MyClub,
  OpenPlaySession,
  OrganizerType,
  PlanInput,
  QueueState,
  RevenueReport,
  SessionDetail,
  SessionInput,
  SkillLevel,
} from "./open-play-types";
import {
  clubListingSchema,
  clubMemberDetailSchema,
  clubMemberSchema,
  clubProfileSchema,
  ledgerEntrySchema,
  memberSummarySchema,
  planSchema,
  queueSchema,
  revenueSchema,
  sessionDetailSchema,
  sessionSchema,
} from "./open-play-schemas";
import type { UUID } from "./types";

const sessions = z.array(sessionSchema);

/** Everything about clubs and open play lives under one key, so a change refreshes all views of it. */
const OP = ["op"] as const;
const org = (type: OrganizerType, id: UUID) => `/organizers/${type}/${id}`;

function useRefreshAll() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: OP }),
      // Venue calendars and money views change too.
      qc.invalidateQueries({ queryKey: ["clubs"] }),
      qc.invalidateQueries({ queryKey: ["courts"] }),
    ]);
}

function useOpMutation<I, O>(fn: (input: I) => Promise<O>) {
  const refresh = useRefreshAll();
  return useMutation({ mutationFn: fn, onSettled: refresh });
}

// ── Directory and profiles ────────────────────────────────

export interface DirectoryFilters {
  search?: string;
  city?: string;
  type?: OrganizerType | "";
}

export function useClubDirectory(filters: DirectoryFilters) {
  return useQuery({
    queryKey: [...OP, "directory", filters],
    queryFn: () =>
      api<ClubListing[]>("/discovery/clubs", {
        query: { search: filters.search, city: filters.city, type: filters.type || undefined },
        schema: z.array(clubListingSchema),
      }),
  });
}

export function useClubProfile(type: OrganizerType | undefined, slug: string | undefined) {
  return useQuery({
    queryKey: [...OP, "profile", type, slug],
    queryFn: () => api<ClubProfile>(`/discovery/clubs/${type}/${slug}`, { schema: clubProfileSchema }),
    enabled: !!type && !!slug,
  });
}

export function useCreateCommunity() {
  return useOpMutation((input: CommunityInput) =>
    api<ClubProfile>("/communities", { method: "POST", body: input, schema: clubProfileSchema }),
  );
}

export function useUpdateCommunity(id: UUID) {
  return useOpMutation((input: CommunityInput) =>
    api<ClubProfile>(`/communities/${id}`, { method: "PATCH", body: input, schema: clubProfileSchema }),
  );
}

// ── Membership ────────────────────────────────────────────

export function useJoinClub(type: OrganizerType, id: UUID) {
  return useOpMutation((input: JoinClubInput) =>
    api<MemberSummary>(`${org(type, id)}/join`, { method: "POST", body: input, schema: memberSummarySchema }),
  );
}

/** Sends a GCash or Maya receipt for a paid plan. A club admin checks it before the membership counts. */
export function useSendMembershipReceipt(id: UUID) {
  return useOpMutation((input: MembershipReceiptInput) =>
    api<MemberSummary>(`/organizers/community/${id}/membership/receipt`, {
      method: "POST",
      body: input,
      schema: memberSummarySchema,
    }),
  );
}

export function useLeaveClub(type: OrganizerType, id: UUID) {
  return useOpMutation(() => api<void>(`${org(type, id)}/leave`, { method: "POST" }));
}

export function useMembers(type: OrganizerType, id: UUID, filters: { status?: string; search?: string }) {
  return useQuery({
    queryKey: [...OP, "members", type, id, filters],
    queryFn: () =>
      api<ClubMember[]>(`${org(type, id)}/members`, {
        query: { status: filters.status || undefined, search: filters.search || undefined },
        schema: z.array(clubMemberSchema),
      }),
  });
}

export function useMember(type: OrganizerType, id: UUID, memberId: UUID | null) {
  return useQuery({
    queryKey: [...OP, "member", type, id, memberId],
    queryFn: () =>
      api<ClubMemberDetail>(`${org(type, id)}/members/${memberId}`, { schema: clubMemberDetailSchema }),
    enabled: !!memberId,
  });
}

export type MemberAction =
  | "approve"
  | "reject"
  | "suspend"
  | "reactivate"
  | "renew"
  | "make-admin"
  | "remove-admin"
  | "confirm-payment"
  | "reject-payment";

export function useMemberAction(type: OrganizerType, id: UUID) {
  return useOpMutation(
    ({
      memberId,
      action,
      ...body
    }: {
      memberId: UUID;
      action: MemberAction;
      reason?: string;
      plan_id?: UUID | null;
    }) =>
      api<ClubMemberDetail>(`${org(type, id)}/members/${memberId}/${action}`, {
        method: "POST",
        body,
        schema: clubMemberDetailSchema,
      }),
  );
}

export function useRecordDues(type: OrganizerType, id: UUID) {
  return useOpMutation(({ memberId, ...body }: FeePaymentInput & { memberId: UUID }) =>
    api<ClubMemberDetail>(`${org(type, id)}/members/${memberId}/dues`, {
      method: "POST",
      body,
      schema: clubMemberDetailSchema,
    }),
  );
}

export function usePlans(type: OrganizerType, id: UUID) {
  return useQuery({
    queryKey: [...OP, "plans", type, id],
    queryFn: () => api<MembershipPlan[]>(`${org(type, id)}/plans`, { schema: z.array(planSchema) }),
  });
}

export function useSavePlan(type: OrganizerType, id: UUID) {
  return useOpMutation(({ planId, ...input }: PlanInput & { planId?: UUID }) =>
    api<MembershipPlan>(planId ? `${org(type, id)}/plans/${planId}` : `${org(type, id)}/plans`, {
      method: planId ? "PATCH" : "POST",
      body: input,
      schema: planSchema,
    }),
  );
}

// ── Sessions ──────────────────────────────────────────────

export type SessionScope = "upcoming" | "joined" | "hosted" | "past";

export function useSessions(filters: { scope: SessionScope; level?: SkillLevel | ""; search?: string }) {
  return useQuery({
    queryKey: [...OP, "sessions", filters],
    queryFn: () =>
      api<OpenPlaySession[]>("/open-play", {
        query: {
          scope: filters.scope,
          level: filters.level || undefined,
          search: filters.search || undefined,
        },
        schema: sessions,
      }),
    refetchInterval: 30_000,
  });
}

/** Sessions an organizer runs, or (for a venue) every session on its courts. */
export function useOrganizerSessions(type: OrganizerType, id: UUID, when: "upcoming" | "past" | "pending") {
  return useQuery({
    queryKey: [...OP, "org-sessions", type, id, when],
    queryFn: () => api<OpenPlaySession[]>(`${org(type, id)}/sessions`, { query: { when }, schema: sessions }),
    refetchInterval: 30_000,
  });
}

export function useSession(id: UUID | undefined) {
  return useQuery({
    queryKey: [...OP, "session", id],
    queryFn: () => api<SessionDetail>(`/open-play/${id}`, { schema: sessionDetailSchema }),
    enabled: !!id,
    // Capacity is live; never show a stale count as fact.
    staleTime: 0,
    refetchInterval: 15_000,
  });
}

export function useCreateSession() {
  return useOpMutation((input: SessionInput) =>
    api<OpenPlaySession>("/open-play", { method: "POST", body: input, schema: sessionSchema }),
  );
}

export function useUpdateSession(id: UUID) {
  return useOpMutation((input: SessionInput) =>
    api<OpenPlaySession>(`/open-play/${id}`, { method: "PATCH", body: input, schema: sessionSchema }),
  );
}

export function useSessionAction(id: UUID) {
  return useOpMutation(
    ({
      action,
      ...body
    }: {
      action: "join" | "leave" | "waitlist" | "cancel" | "approve" | "reject";
      reason?: string;
    }) =>
      api<SessionDetail>(`/open-play/${id}/${action}`, { method: "POST", body, schema: sessionDetailSchema }),
  );
}

export type ParticipantAction = "check-in" | "undo-check-in" | "no-show" | "remove";

export function useParticipantAction(sessionId: UUID) {
  return useOpMutation(({ participantId, action }: { participantId: UUID; action: ParticipantAction }) =>
    api<SessionDetail>(`/open-play/${sessionId}/participants/${participantId}/${action}`, {
      method: "POST",
      schema: sessionDetailSchema,
    }),
  );
}

export function useAddParticipant(sessionId: UUID) {
  return useOpMutation((input: { player_id: UUID }) =>
    api<SessionDetail>(`/open-play/${sessionId}/participants`, {
      method: "POST",
      body: input,
      schema: sessionDetailSchema,
    }),
  );
}

export function useRecordSessionFee(sessionId: UUID) {
  return useOpMutation(({ participantId, ...body }: FeePaymentInput & { participantId: UUID }) =>
    api<SessionDetail>(`/open-play/${sessionId}/participants/${participantId}/payments`, {
      method: "POST",
      body,
      schema: sessionDetailSchema,
    }),
  );
}

export function useRefundSessionFee(sessionId: UUID) {
  return useOpMutation(({ participantId, ...body }: FeeRefundInput & { participantId: UUID }) =>
    api<SessionDetail>(`/open-play/${sessionId}/participants/${participantId}/refund`, {
      method: "POST",
      body,
      schema: sessionDetailSchema,
    }),
  );
}

export function useRecordCourtFee(sessionId: UUID) {
  return useOpMutation((body: FeePaymentInput) =>
    api<SessionDetail>(`/open-play/${sessionId}/court-fee`, {
      method: "POST",
      body,
      schema: sessionDetailSchema,
    }),
  );
}

// ── Live queue ────────────────────────────────────────────

export function useQueue(sessionId: UUID | undefined, live: boolean) {
  return useQuery({
    queryKey: [...OP, "queue", sessionId],
    queryFn: () => api<QueueState>(`/open-play/${sessionId}/queue`, { schema: queueSchema }),
    enabled: !!sessionId,
    staleTime: 0,
    // Stands in for WebSockets until the backend exists; see PHASE4_CLUBS_OPEN_PLAY.md.
    refetchInterval: live ? 4_000 : false,
  });
}

export type QueueCommand =
  | { command: "fill"; court_id: UUID; participant_ids?: UUID[] }
  | { command: "finish"; game_id: UUID; winner: "a" | "b" | null }
  | { command: "move"; participant_id: UUID; position: number }
  | { command: "rest"; participant_id: UUID; resting: boolean };

export function useQueueCommand(sessionId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ command, ...body }: QueueCommand) =>
      api<QueueState>(`/open-play/${sessionId}/queue/${command}`, {
        method: "POST",
        body,
        schema: queueSchema,
      }),
    onSuccess: (q) => qc.setQueryData([...OP, "queue", sessionId], q),
    onSettled: () => qc.invalidateQueries({ queryKey: [...OP, "session", sessionId] }),
  });
}

// ── Venues for hosting ────────────────────────────────────

export interface CourtOption {
  id: UUID;
  name: string;
  indoor_outdoor: "indoor" | "outdoor";
  available: boolean;
  reason: string | null;
  price: string;
}

const courtOptions = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    indoor_outdoor: z.enum(["indoor", "outdoor"]),
    available: z.boolean(),
    reason: z.string().nullable(),
    price: z.string(),
  }),
) as z.ZodType<CourtOption[]>;

/** Courts at a venue for a time range, with whether each is free. Server-checked again on save. */
export function useCourtOptions(
  venueId: UUID | undefined,
  startsAt: string | undefined,
  endsAt: string | undefined,
  excludeSession?: UUID,
) {
  return useQuery({
    queryKey: [...OP, "court-options", venueId, startsAt, endsAt, excludeSession],
    queryFn: () =>
      api<CourtOption[]>(`/venues/${venueId}/court-options`, {
        query: { starts_at: startsAt, ends_at: endsAt, exclude_session: excludeSession },
        schema: courtOptions,
      }),
    enabled: !!venueId && !!startsAt && !!endsAt && startsAt < endsAt,
    staleTime: 0,
  });
}

// ── Money ─────────────────────────────────────────────────

export function useLedger(
  type: OrganizerType,
  id: UUID,
  filters: { from: string; to: string; kind?: LedgerKind | "" },
) {
  return useQuery({
    queryKey: [...OP, "ledger", type, id, filters],
    queryFn: () =>
      api<LedgerEntry[]>(`${org(type, id)}/payments`, {
        query: { from: filters.from, to: filters.to, kind: filters.kind || undefined },
        schema: z.array(ledgerEntrySchema),
      }),
  });
}

export function useRevenue(type: OrganizerType, id: UUID, range: { from: string; to: string }) {
  return useQuery({
    queryKey: [...OP, "revenue", type, id, range],
    queryFn: () =>
      api<RevenueReport>(`${org(type, id)}/reports/revenue`, { query: range, schema: revenueSchema }),
  });
}

// ── Players ───────────────────────────────────────────────

const playerResults = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    home_city: z.string().nullable(),
    phone_last4: z.string().nullable(),
  }),
);

/** Find a player by name, to add them to a session. */
export function usePlayerDirectory(search: string) {
  return useQuery({
    queryKey: [...OP, "players", search],
    queryFn: () =>
      api<z.infer<typeof playerResults>>("/players", { query: { search }, schema: playerResults }),
    enabled: search.trim().length >= 2,
    staleTime: 30_000,
  });
}

/** Clubs the signed-in player belongs to, with their membership and whether they can host. */
export function useMyClubs() {
  return useQuery({
    queryKey: [...OP, "my-clubs"],
    queryFn: () =>
      api<MyClub[]>("/player/clubs", {
        schema: z.array(
          z.object({ club: clubListingSchema, membership: memberSummarySchema, can_host: z.boolean() }),
        ) as z.ZodType<MyClub[]>,
      }),
  });
}
