import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./client";
import type { Me } from "./types";
import { meSchema } from "./schemas";
import type {
  CourtPublic,
  CourtSearch,
  GeoOption,
  OwnerSignupInput,
  OwnerSignupResult,
  PlayerHome,
  PlayerProfile,
  ProfileInput,
  RegisterInput,
  VenueResult,
} from "./player-types";
import type { AvailabilitySlot } from "./types";
import type { GuestCodeSent } from "./booking-types";
import { availabilitySchema } from "./schemas";

// ── Schemas ───────────────────────────────────────────────

const money = z.string().regex(/^-?\d+\.\d{2}$/);
const iso = z.iso.datetime({ offset: true });
const geoOption = z.object({ id: z.string(), code: z.string(), name: z.string() });
const skill = z.enum(["all", "beginner", "novice", "intermediate", "advanced", "pro"]);
const clock = z.string().regex(/^\d{2}:\d{2}$/);
const weekday = z.number().int().min(0).max(6) as unknown as z.ZodType<0 | 1 | 2 | 3 | 4 | 5 | 6>;

export const profileSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  skill_level: skill,
  bio: z.string(),
  play_formats: z.array(z.enum(["singles", "doubles"])),
  preferred_times: z.array(z.enum(["morning", "afternoon", "evening"])),
  visibility: z.enum(["public", "members", "private"]),
  home: z
    .object({
      country: geoOption,
      region: geoOption,
      province: geoOption,
      city: geoOption,
      barangay: geoOption,
    })
    .nullable(),
  location_verified: z.boolean(),
}) as z.ZodType<PlayerProfile>;

const courtSummary = {
  id: z.string(),
  name: z.string(),
  indoor_outdoor: z.enum(["indoor", "outdoor"]),
  surface_type: z.string(),
  base_price: money,
};

export const venueResultSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  tagline: z.string(),
  address: z.string(),
  city: z.string(),
  province: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  distance_km: z.number().nullable(),
  logo_url: z.string().nullable(),
  cover_url: z.string().nullable(),
  amenities: z.array(z.string()),
  courts: z.array(z.object(courtSummary)),
  price_from: money,
  currency: z.literal("PHP"),
  open_now: z.boolean(),
  today: z.object({ opens_at: clock, closes_at: clock }).nullable(),
  upcoming_session_count: z.number().int(),
  bookable: z.boolean(),
  guest_booking: z.boolean(),
  next_free_at: z.string().nullable(),
  free_slots_today: z.number().int().nonnegative(),
}) as z.ZodType<VenueResult>;

export const courtPublicSchema = z.object({
  ...courtSummary,
  court_code: z.string(),
  currency: z.literal("PHP"),
  status: z.enum(["active", "inactive", "maintenance"]),
  venue: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    address: z.string(),
    city: z.string(),
    province: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    contact_phone: z.string(),
    amenities: z.array(z.string()),
    cancellation_policy: z.string(),
    booking_window_days: z.number().int(),
    bookable: z.boolean(),
  }),
  hours: z.array(
    z.object({ weekday, is_closed: z.boolean(), opens_at: clock.nullable(), closes_at: clock.nullable() }),
  ),
  price_rules: z.array(
    z.object({
      id: z.string(),
      court_id: z.string(),
      day_of_week: weekday.nullable(),
      starts_at: clock,
      ends_at: clock,
      price: money,
      currency: z.literal("PHP"),
    }),
  ),
  closures: z.array(z.object({ starts_at: iso, ends_at: iso, reason: z.string() })),
}) as z.ZodType<CourtPublic>;

export const playerHomeSchema = z.object({
  greeting_name: z.string(),
  next_game: z
    .discriminatedUnion("kind", [
      z.object({
        kind: z.literal("open_play"),
        session_id: z.string(),
        title: z.string(),
        venue_name: z.string(),
        starts_at: iso,
        ends_at: iso,
        status: z.enum(["registered", "waitlisted", "checked_in"]),
        waitlist_position: z.number().int().nullable(),
      }),
      z.object({
        kind: z.literal("booking"),
        booking_id: z.string(),
        title: z.string(),
        venue_name: z.string(),
        starts_at: iso,
        ends_at: iso,
        booking_code: z.string(),
        payment_status: z.enum(["unpaid", "partially_paid", "paid", "refunded", "voided"]),
      }),
    ])
    .nullable(),
  near: z.object({ city: z.string(), province: z.string() }).nullable(),
}) as z.ZodType<PlayerHome>;

// ── Account ───────────────────────────────────────────────

/** Registering signs the player in, unverified. Verification and onboarding follow. */
export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      api<Me>("/auth/register", { method: "POST", body: input, schema: meSchema }),
    onSuccess: (me) => qc.setQueryData(["me"], me),
  });
}

export function useVerifyEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { code: string }) =>
      api<Me>("/auth/verify", { method: "POST", body: input, schema: meSchema }),
    onSuccess: (me) => qc.setQueryData(["me"], me),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: () => api<{ resend_after_seconds: number }>("/auth/verify/resend", { method: "POST" }),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: { email: string }) =>
      api<{ sent: true }>("/auth/forgot-password", { method: "POST", body: input }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: { token: string; password: string; password_confirmation: string }) =>
      api<{ reset: true }>("/auth/reset-password", { method: "POST", body: input }),
  });
}

// ── Profile and location ──────────────────────────────────

export function useProfile(enabled = true) {
  return useQuery({
    queryKey: ["player", "profile"],
    queryFn: () => api<PlayerProfile>("/player/profile", { schema: profileSchema }),
    enabled,
  });
}

function useProfileMutation<I>(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: I) =>
      api<PlayerProfile>(path, { method: "PATCH", body: input, schema: profileSchema }),
    onSuccess: (p) => qc.setQueryData(["player", "profile"], p),
    // The profile decides whether onboarding is done, so refresh the account too.
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["me"] }),
        qc.invalidateQueries({ queryKey: ["op"] }),
        qc.invalidateQueries({ queryKey: ["player"] }),
      ]),
  });
}

export const useSaveProfile = () => useProfileMutation<ProfileInput>("/player/profile");
export const useSaveLocation = () => useProfileMutation<{ barangay_id: string }>("/player/location");

export type GeoLevel = "regions" | "provinces" | "cities" | "barangays";

/** One level of the region → province → city → barangay picker. */
export function useGeo(level: GeoLevel, parentId: string | null) {
  return useQuery({
    queryKey: ["geo", level, parentId],
    queryFn: () =>
      api<GeoOption[]>(`/geo/${level}`, {
        query: { parent_id: parentId ?? undefined },
        schema: z.array(geoOption),
      }),
    enabled: level === "regions" || !!parentId,
    staleTime: Infinity,
  });
}

// ── Home and discovery ────────────────────────────────────

export function usePlayerHome() {
  return useQuery({
    queryKey: ["player", "home"],
    queryFn: () => api<PlayerHome>("/player/home", { schema: playerHomeSchema }),
  });
}

/** Venues with courts that match. Filters are applied by the server (blueprint Phase 6 acceptance). */
export function useCourtSearch(search: CourtSearch) {
  return useQuery({
    queryKey: ["discovery", "courts", search],
    queryFn: () =>
      api<VenueResult[]>("/discovery/courts", {
        query: {
          q: search.q || undefined,
          lat: search.lat?.toFixed(5),
          lng: search.lng?.toFixed(5),
          radius_km: search.radius_km ? String(search.radius_km) : undefined,
          indoor_outdoor: search.indoor_outdoor || undefined,
          surface: search.surface || undefined,
          max_price: search.max_price ? String(search.max_price) : undefined,
          amenities: search.amenities?.length ? search.amenities.join(",") : undefined,
          available_today: search.available_today ? "1" : undefined,
          sort: search.sort && search.sort !== "recommended" ? search.sort : undefined,
        },
        schema: z.array(venueResultSchema),
      }),
    placeholderData: (prev) => prev,
  });
}

export function useCourtPublic(courtId: string | undefined) {
  return useQuery({
    queryKey: ["discovery", "court", courtId],
    queryFn: () => api<CourtPublic>(`/courts/${courtId}`, { schema: courtPublicSchema }),
    enabled: !!courtId,
  });
}

/** Live availability for a player. Always fetched fresh: a cached slot is not a reservation. */
export function usePublicAvailability(courtId: string | undefined, date: string, minutes: number) {
  return useQuery({
    queryKey: ["discovery", "availability", courtId, date, minutes],
    queryFn: () =>
      api<AvailabilitySlot[]>(`/courts/${courtId}/availability`, {
        query: { date, duration_minutes: String(minutes) },
        schema: availabilitySchema,
      }),
    enabled: !!courtId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

// ── Owner sign-up (R6) ────────────────────────────────────

const codeSentSchema = z.object({
  verification_id: z.string(),
  email: z.string(),
  expires_at: z.string(),
  resend_after: z.string(),
}) as z.ZodType<GuestCodeSent>;

/** Sends a 6-digit code to the new owner's email. */
export function useOwnerSignupCode() {
  return useMutation({
    mutationFn: (input: { name: string; email: string }) =>
      api<GuestCodeSent>("/owner-signup/code", { method: "POST", body: input, schema: codeSentSchema }),
  });
}

/** Checks the code. The sign-up itself checks again that this code was confirmed. */
export function useVerifyOwnerCode() {
  return useMutation({
    mutationFn: (input: { verification_id: string; code: string }) =>
      api<{ verified: true }>("/owner-signup/verify", { method: "POST", body: input }),
  });
}

/**
 * Creates the venue (waiting for approval), its courts and, if needed, the owner's account.
 * It doesn't refresh "me" itself: signing in swaps the site's layout, which would
 * remount the sign-up page and lose its confirmation. The page refreshes it on leaving.
 */
export function useOwnerSignup() {
  return useMutation({
    mutationFn: (input: OwnerSignupInput) =>
      api<OwnerSignupResult>("/owner-signup", { method: "POST", body: input }),
  });
}
