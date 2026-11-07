// Player accounts, profiles, locations and court discovery (Phase 1).

import type { SkillLevel } from "./open-play-types";
import type { Currency, ISODateTime, Money, OperatingHours, PaymentStatus, PriceRule, UUID } from "./types";

export interface GeoOption {
  id: string;
  code: string;
  name: string;
}

export interface HomeLocation {
  country: GeoOption;
  region: GeoOption;
  province: GeoOption;
  city: GeoOption;
  barangay: GeoOption;
}

export type PlayFormat = "singles" | "doubles";
export type PlayTime = "morning" | "afternoon" | "evening";

/** The global player profile (blueprint §5.2 A player_profiles). */
export interface PlayerProfile {
  user_id: UUID;
  display_name: string;
  skill_level: SkillLevel;
  bio: string;
  play_formats: PlayFormat[];
  preferred_times: PlayTime[];
  /** Who can see the profile and match history. */
  visibility: "public" | "members" | "private";
  home: HomeLocation | null;
  /** Rankings use the verified home location only (blueprint §4.4). */
  location_verified: boolean;
}

export interface ProfileInput {
  display_name: string;
  skill_level: SkillLevel;
  bio: string;
  play_formats: PlayFormat[];
  preferred_times: PlayTime[];
  visibility: PlayerProfile["visibility"];
}

export interface RegisterInput {
  name: string;
  email: string;
  phone: string;
  password: string;
  password_confirmation: string;
  accept_terms: boolean;
}

// ── Discovery ─────────────────────────────────────────────

export interface CourtSummary {
  id: UUID;
  name: string;
  indoor_outdoor: "indoor" | "outdoor";
  surface_type: string;
  base_price: Money;
}

/** A venue in court search, with the courts that match the filters. */
export interface VenueResult {
  id: UUID;
  slug: string;
  name: string;
  tagline: string;
  address: string;
  city: string;
  province: string;
  latitude: number;
  longitude: number;
  /** Straight-line distance from the search point, when there is one. */
  distance_km: number | null;
  logo_url: string | null;
  cover_url: string | null;
  amenities: string[];
  courts: CourtSummary[];
  price_from: Money;
  currency: Currency;
  open_now: boolean;
  /** Today's hours in club time, e.g. "06:00"–"22:00", or null when closed today. */
  today: { opens_at: string; closes_at: string } | null;
  upcoming_session_count: number;
  /** Takes bookings in the app. false: listed, "not bookable yet". */
  bookable: boolean;
  /** People can book here without an account. */
  guest_booking: boolean;
  /** Earliest free hour today on any matching court, or null if none is left (or not bookable). */
  next_free_at: ISODateTime | null;
  /** Free one-hour starts left today, across matching courts. */
  free_slots_today: number;
}

export type CourtSort = "recommended" | "availability" | "price_asc" | "price_desc";

export interface CourtSearch {
  /** Text: club, city, province or barangay. */
  q?: string;
  lat?: number;
  lng?: number;
  radius_km?: number;
  indoor_outdoor?: "indoor" | "outdoor" | "";
  surface?: string;
  max_price?: number;
  amenities?: string[];
  /** Only venues with a free hour left today. */
  available_today?: boolean;
  sort?: CourtSort;
}

/** A court as players see it (blueprint §9.4 GET /courts/{court}). */
export interface CourtPublic extends CourtSummary {
  court_code: string;
  currency: Currency;
  status: "active" | "inactive" | "maintenance";
  venue: {
    id: UUID;
    slug: string;
    name: string;
    address: string;
    city: string;
    province: string;
    latitude: number;
    longitude: number;
    contact_phone: string;
    amenities: string[];
    cancellation_policy: string;
    booking_window_days: number;
    /** Takes bookings in the app. */
    bookable: boolean;
  };
  hours: OperatingHours[];
  price_rules: PriceRule[];
  /** Upcoming closures players should know about. */
  closures: Array<{ starts_at: ISODateTime; ends_at: ISODateTime; reason: string }>;
}

/** The player home screen in one call. */
export interface PlayerHome {
  greeting_name: string;
  /** Whichever comes first: an open play session or a court booking. */
  next_game:
    | {
        kind: "open_play";
        session_id: UUID;
        title: string;
        venue_name: string;
        starts_at: ISODateTime;
        ends_at: ISODateTime;
        status: "registered" | "waitlisted" | "checked_in";
        waitlist_position: number | null;
      }
    | {
        kind: "booking";
        booking_id: UUID;
        title: string;
        venue_name: string;
        starts_at: ISODateTime;
        ends_at: ISODateTime;
        booking_code: string;
        payment_status: PaymentStatus;
      }
    | null;
  /** Where "near you" is measured from: GPS isn't used here, only the home city. */
  near: { city: string; province: string } | null;
}

// ── Owner sign-up (R6) ────────────────────────────────────

/** Step 1: the venue. The pin and barangay place it on the map and in search. */
export interface OwnerSignupVenue {
  name: string;
  latitude: number;
  longitude: number;
  barangay_id: string;
  /** Street, building or landmark; the barangay, city and province come from barangay_id. */
  address: string;
  /** 1 to 10, the trial plan's limit. */
  court_count: number;
  contact_phone: string;
  contact_email: string;
}

/** Step 3: one setting for every court to start with. Each court can be changed later. */
export interface OwnerSignupCourts {
  indoor_outdoor: "indoor" | "outdoor";
  /** "HH:MM", every day of the week. */
  opens_at: string;
  closes_at: string;
  hourly_rate: Money;
}

export interface OwnerSignupInput {
  venue: OwnerSignupVenue;
  courts: OwnerSignupCourts;
  /** Step 2, when nobody is signed in: the new owner account, its email confirmed by a code. */
  owner?: {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
    verification_id: string;
  };
}

export interface OwnerSignupResult {
  club_id: UUID;
  club_slug: string;
  club_name: string;
  /** New venues wait for CourtFlex approval before players can find them. */
  status: "pending_review";
}
