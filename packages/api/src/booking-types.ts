// Player court booking (Phase 2, blueprint §8.4, §9.4). Payment always happens at the venue.

import type {
  BookingPayMethod,
  BookingPayments,
  BookingReceipt,
  BookingSource,
  BookingStatus,
  Currency,
  ISODateTime,
  Money,
  PaymentStatus,
  UUID,
  WalletAccount,
} from "./types";

export type BookingMinutes = 60 | 90 | 120 | 180;

/** The price the server will charge, worked out before the player confirms. */
export interface BookingQuote {
  court_id: UUID;
  court_name: string;
  venue_id: UUID;
  venue_slug: string;
  venue_name: string;
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  duration_minutes: number;
  /** One line per rate band the booking crosses, for example 16:30 to 17:00 at the day rate. */
  lines: Array<{ starts_at: ISODateTime; ends_at: ISODateTime; hourly_rate: Money; amount: Money }>;
  total: Money;
  currency: Currency;
  /** Last moment the player can cancel in the app. */
  cancel_until: ISODateTime;
  cancellation_policy: string;
  payment_instructions: string;
}

export interface PlayerBookingInput {
  court_id: UUID;
  starts_at: ISODateTime;
  duration_minutes: BookingMinutes;
  /** The total the player saw. If the server's price differs, the booking is refused so they can review it. */
  expected_total: Money;
  /** One of the ways the venue takes payment. GCash and Maya hold the court for 30 minutes. */
  payment_method: BookingPayMethod;
  notes?: string;
}

/** Asks for a code to be sent to a guest's email before they book. */
export interface GuestCodeRequest {
  name: string;
  email: string;
}

export interface GuestCodeSent {
  verification_id: string;
  email: string;
  /** When the code stops working. */
  expires_at: ISODateTime;
  /** When another code can be asked for. */
  resend_after: ISODateTime;
}

/** A booking without an account: the details, and the code from the email. */
export interface GuestBookingInput extends PlayerBookingInput {
  verification_id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
}

/** What opens a guest booking: its code and the email it was made with. */
export interface GuestAccess {
  booking_code: string;
  email: string;
}

/** A receipt for a GCash or Maya booking. */
export interface BookingReceiptInput {
  receipt: string;
  reference_number: string;
}

/** One hour on one court, for the booking grid. */
export interface DayCell {
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  state: "available" | "booked" | "closed" | "past";
  /** The server's price for this hour. */
  price: Money;
  /** A different rate from the court's base rate (for example, evenings). */
  special_rate: boolean;
}

/** Everything the venue booking page needs for one date, in one call. Open to visitors. */
export interface VenueBookingDay {
  venue: {
    id: UUID;
    slug: string;
    name: string;
    address: string;
    city: string;
    province: string;
    latitude: number;
    longitude: number;
    cover_url: string | null;
    contact_phone: string;
    bookable: boolean;
    booking_window_days: number;
    price_from: Money;
    cancellation_policy: string;
    payments: BookingPayments;
    /** People can book here without an account. */
    guest_booking: boolean;
  };
  date: string;
  /** The hours shown as rows, earliest opening to latest closing, as "HH:MM". */
  rows: string[];
  courts: Array<{
    id: UUID;
    name: string;
    indoor_outdoor: "indoor" | "outdoor";
    surface_type: string;
    base_price: Money;
    /** One per row; null where the court is closed at that hour. */
    cells: Array<DayCell | null>;
  }>;
}

/** Another time or court that's free, offered when the chosen slot was just taken. */
export interface BookingAlternative {
  court_id: UUID;
  court_name: string;
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  total: Money;
}

/** details on a 409 with code "slot_taken". */
export interface SlotTakenDetails {
  alternatives: BookingAlternative[];
}

/** details on a 409 with code "price_changed". */
export interface PriceChangedDetails {
  total: Money;
}

export type PlayerBookingTab = "upcoming" | "past" | "cancelled";

/** A booking as its player sees it: no staff names, no other players' details. */
export interface PlayerBooking {
  id: UUID;
  booking_code: string;
  source: BookingSource;
  status: BookingStatus;
  payment_status: PaymentStatus;
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  duration_minutes: number;
  total: Money;
  amount_paid: Money;
  balance_due: Money;
  currency: Currency;
  notes: string | null;
  court: { id: UUID; name: string; indoor_outdoor: "indoor" | "outdoor"; surface_type: string };
  venue: {
    id: UUID;
    slug: string;
    name: string;
    address: string;
    city: string;
    province: string;
    contact_phone: string;
  };
  cancellation_policy: string;
  payment_instructions: string;
  payment_method: BookingPayMethod | null;
  /** GCash or Maya: when the hold ends if no receipt arrives. */
  hold_expires_at: ISODateTime | null;
  /** The account to pay, for GCash or Maya bookings. */
  pay_to: WalletAccount | null;
  receipt: (Omit<BookingReceipt, "reviewed_by" | "image_url"> & { image_url: string }) | null;
  cancel_until: ISODateTime;
  /** True while the player can still cancel in the app. */
  can_cancel: boolean;
  /** Why the app can't cancel it, when it's still upcoming. */
  cancel_blocked_reason: string | null;
  cancellation: { cancelled_at: ISODateTime; by_player: boolean; reason: string | null } | null;
  created_at: ISODateTime;
}
