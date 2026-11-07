import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./client";
import { bookingPayMethod, bookingPaymentsSchema } from "./schemas";
import type {
  BookingMinutes,
  BookingQuote,
  BookingReceiptInput,
  GuestAccess,
  GuestBookingInput,
  GuestCodeRequest,
  GuestCodeSent,
  PlayerBooking,
  VenueBookingDay,
  PlayerBookingInput,
  PlayerBookingTab,
} from "./booking-types";

const money = z.string().regex(/^-?\d+\.\d{2}$/);
const iso = z.iso.datetime({ offset: true });

export const bookingQuoteSchema = z.object({
  court_id: z.string(),
  court_name: z.string(),
  venue_id: z.string(),
  venue_slug: z.string(),
  venue_name: z.string(),
  starts_at: iso,
  ends_at: iso,
  duration_minutes: z.number().int().positive(),
  lines: z.array(z.object({ starts_at: iso, ends_at: iso, hourly_rate: money, amount: money })),
  total: money,
  currency: z.literal("PHP"),
  cancel_until: iso,
  cancellation_policy: z.string(),
  payment_instructions: z.string(),
}) as z.ZodType<BookingQuote>;

export const playerBookingSchema = z.object({
  id: z.string(),
  booking_code: z.string(),
  source: z.enum(["player_app", "guest_web", "staff_walk_in", "owner_created"]),
  status: z.enum(["pending", "confirmed", "cancelled", "expired", "completed", "no_show"]),
  payment_status: z.enum(["unpaid", "partially_paid", "paid", "refunded", "voided"]),
  starts_at: iso,
  ends_at: iso,
  duration_minutes: z.number().int().positive(),
  total: money,
  amount_paid: money,
  balance_due: money,
  currency: z.literal("PHP"),
  notes: z.string().nullable(),
  court: z.object({
    id: z.string(),
    name: z.string(),
    indoor_outdoor: z.enum(["indoor", "outdoor"]),
    surface_type: z.string(),
  }),
  venue: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    address: z.string(),
    city: z.string(),
    province: z.string(),
    contact_phone: z.string(),
  }),
  cancellation_policy: z.string(),
  payment_instructions: z.string(),
  payment_method: bookingPayMethod.nullable(),
  hold_expires_at: iso.nullable(),
  pay_to: z
    .object({ account_name: z.string(), account_number: z.string(), qr_url: z.string().nullable() })
    .nullable(),
  receipt: z
    .object({
      image_url: z.string(),
      reference_number: z.string(),
      submitted_at: iso,
      status: z.enum(["in_review", "approved", "rejected"]),
      rejection_reason: z.string().nullable(),
      reviewed_at: iso.nullable(),
    })
    .nullable(),
  cancel_until: iso,
  can_cancel: z.boolean(),
  cancel_blocked_reason: z.string().nullable(),
  cancellation: z
    .object({ cancelled_at: iso, by_player: z.boolean(), reason: z.string().nullable() })
    .nullable(),
  created_at: iso,
}) as z.ZodType<PlayerBooking>;

const cell = z.object({
  starts_at: iso,
  ends_at: iso,
  state: z.enum(["available", "booked", "closed", "past"]),
  price: money,
  special_rate: z.boolean(),
});

export const venueBookingDaySchema = z.object({
  venue: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    address: z.string(),
    city: z.string(),
    province: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    cover_url: z.string().nullable(),
    contact_phone: z.string(),
    bookable: z.boolean(),
    booking_window_days: z.number().int(),
    price_from: money,
    cancellation_policy: z.string(),
    payments: bookingPaymentsSchema,
    guest_booking: z.boolean(),
  }),
  date: z.string(),
  rows: z.array(z.string()),
  courts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      indoor_outdoor: z.enum(["indoor", "outdoor"]),
      surface_type: z.string(),
      base_price: money,
      cells: z.array(cell.nullable()),
    }),
  ),
}) as z.ZodType<VenueBookingDay>;

/** Anything that shows free courts or the player's games needs a fresh look after a booking changes. */
function invalidateAfterBooking(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["player", "bookings"] }),
    qc.invalidateQueries({ queryKey: ["player", "home"] }),
    qc.invalidateQueries({ queryKey: ["discovery", "availability"] }),
  ]);
}

/** The server's price for a slot. Never worked out in the browser. */
export function useBookingQuote(
  courtId: string | undefined,
  startsAt: string | null,
  minutes: BookingMinutes,
) {
  return useQuery({
    queryKey: ["player", "booking-quote", courtId, startsAt, minutes],
    queryFn: () =>
      api<BookingQuote>("/bookings/quote", {
        query: { court_id: courtId, starts_at: startsAt ?? undefined, duration_minutes: String(minutes) },
        schema: bookingQuoteSchema,
      }),
    enabled: !!courtId && !!startsAt,
    staleTime: 0,
    retry: false,
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlayerBookingInput) =>
      api<PlayerBooking>("/bookings", { method: "POST", body: input, schema: playerBookingSchema }),
    onSuccess: (b) => {
      qc.setQueryData(["player", "booking", b.id], b);
      return invalidateAfterBooking(qc);
    },
    // A refused booking means what the player saw is out of date.
    onError: () => qc.invalidateQueries({ queryKey: ["discovery", "availability"] }),
  });
}

/** One date at a venue: every court's hours, free or not, with the server's prices. Open to visitors. */
export function useVenueBookingDay(slug: string | undefined, date: string) {
  return useQuery({
    queryKey: ["discovery", "availability", "venue", slug, date],
    queryFn: () =>
      api<VenueBookingDay>(`/venues/${slug}/booking-day`, { query: { date }, schema: venueBookingDaySchema }),
    enabled: !!slug,
    staleTime: 0,
    placeholderData: (prev) => prev,
  });
}

/** Sends the GCash or Maya receipt for a held booking. Staff check it before it counts as paid. */
export function useSendBookingReceipt(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BookingReceiptInput) =>
      api<PlayerBooking>(`/bookings/${id}/receipt`, {
        method: "POST",
        body: input,
        schema: playerBookingSchema,
      }),
    onSuccess: (b) => {
      qc.setQueryData(["player", "booking", b.id], b);
      return qc.invalidateQueries({ queryKey: ["player", "bookings"] });
    },
  });
}

export function usePlayerBookings(tab: PlayerBookingTab) {
  return useQuery({
    queryKey: ["player", "bookings", tab],
    queryFn: () =>
      api<PlayerBooking[]>("/player/bookings", { query: { tab }, schema: z.array(playerBookingSchema) }),
  });
}

export function usePlayerBooking(id: string | undefined) {
  return useQuery({
    queryKey: ["player", "booking", id],
    queryFn: () => api<PlayerBooking>(`/bookings/${id}`, { schema: playerBookingSchema }),
    enabled: !!id,
  });
}

export function useCancelPlayerBooking(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { reason?: string }) =>
      api<PlayerBooking>(`/bookings/${id}/cancel`, {
        method: "POST",
        body: input,
        schema: playerBookingSchema,
      }),
    onSuccess: (b) => {
      qc.setQueryData(["player", "booking", b.id], b);
      return invalidateAfterBooking(qc);
    },
    onError: () => qc.invalidateQueries({ queryKey: ["player", "booking", id] }),
  });
}

// ── Guest booking (R4): no account; a code sent to the email confirms it ─────

const guestCodeSentSchema = z.object({
  verification_id: z.string(),
  email: z.string(),
  expires_at: iso,
  resend_after: iso,
}) as z.ZodType<GuestCodeSent>;

const guestKey = (a: GuestAccess | null) => [
  "guest",
  "booking",
  a?.booking_code.toUpperCase(),
  a?.email.toLowerCase(),
];

/** Sends a 6-digit code to the guest's email. The booking is made only with that code. */
export function useSendGuestCode() {
  return useMutation({
    mutationFn: (input: GuestCodeRequest) =>
      api<GuestCodeSent>("/guest/code", { method: "POST", body: input, schema: guestCodeSentSchema }),
  });
}

export function useCreateGuestBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GuestBookingInput) =>
      api<PlayerBooking>("/guest/bookings", { method: "POST", body: input, schema: playerBookingSchema }),
    onSuccess: (b, input) => {
      // Find my booking opens straight onto it, without looking it up again.
      qc.setQueryData(guestKey({ booking_code: b.booking_code, email: input.email.trim() }), b);
      return qc.invalidateQueries({ queryKey: ["discovery", "availability"] });
    },
    onError: () => qc.invalidateQueries({ queryKey: ["discovery", "availability"] }),
  });
}

/** A guest booking, opened with its code and email. The email goes in the body, not the address. */
export function useGuestBooking(access: GuestAccess | null) {
  return useQuery({
    queryKey: guestKey(access),
    queryFn: () =>
      api<PlayerBooking>("/guest/booking", { method: "POST", body: access!, schema: playerBookingSchema }),
    enabled: !!access,
    retry: false,
  });
}

export function useGuestReceipt(access: GuestAccess | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BookingReceiptInput) =>
      api<PlayerBooking>("/guest/booking/receipt", {
        method: "POST",
        body: { ...access!, ...input },
        schema: playerBookingSchema,
      }),
    onSuccess: (b) => qc.setQueryData(guestKey(access), b),
  });
}

export function useGuestCancel(access: GuestAccess | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { reason?: string }) =>
      api<PlayerBooking>("/guest/booking/cancel", {
        method: "POST",
        body: { ...access!, ...input },
        schema: playerBookingSchema,
      }),
    onSuccess: (b) => {
      qc.setQueryData(guestKey(access), b);
      return qc.invalidateQueries({ queryKey: ["discovery", "availability"] });
    },
  });
}
