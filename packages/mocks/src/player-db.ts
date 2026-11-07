// Player accounts, profiles and court discovery data (Phase 1).

import type { Club, Court, PlayerProfile, Weekday } from "@courtflex/api";
import { TZ, clubs, courtHours, courts, memberships, priceRules, users } from "./db";
import { cityByName, geoById, geoChain, geoChildren } from "./geo";
import { skillOf, skills } from "./open-play-db";

// ── Account state ─────────────────────────────────────────

/** Mock-only: the verification code every new account receives. */
export const MOCK_VERIFICATION_CODE = "246810";

export const passwords: Record<string, string> = {};
export const unverified = new Set<string>();
export const verifyAttempts: Record<string, { count: number; lastSent: number }> = {};
export const resetTokens: Record<string, { userId: string; expires: number }> = {};

export const passwordOf = (userId: string) => passwords[userId] ?? "password";

// ── Profiles ──────────────────────────────────────────────

export interface MockProfile {
  user_id: string;
  display_name: string;
  bio: string;
  play_formats: PlayerProfile["play_formats"];
  preferred_times: PlayerProfile["preferred_times"];
  visibility: PlayerProfile["visibility"];
  barangay_id: string | null;
  location_verified: boolean;
}

export const profiles: Record<string, MockProfile> = {};

/** Seed every existing player with a home barangay in their city. */
for (const u of users) {
  if (!u.has_player_profile) continue;
  const city = u.home_city ? cityByName(u.home_city) : undefined;
  const barangays = city ? geoChildren(city.id) : [];
  const pick = barangays[Number(u.id.replace(/\D/g, "")) % Math.max(barangays.length, 1)];
  profiles[u.id] = {
    user_id: u.id,
    display_name: u.name,
    bio: "",
    play_formats: ["doubles"],
    preferred_times: ["evening"],
    visibility: "public",
    barangay_id: pick?.id ?? null,
    location_verified: !!pick,
  };
}

export function needsOnboarding(userId: string) {
  const p = profiles[userId];
  return !p || !p.barangay_id;
}

export function profileView(userId: string): PlayerProfile {
  const p = profiles[userId]!;
  const chain = p.barangay_id ? geoChain(p.barangay_id) : null;
  const opt = (n: { id: string; code: string; name: string }) => ({ id: n.id, code: n.code, name: n.name });
  return {
    user_id: userId,
    display_name: p.display_name,
    skill_level: skillOf(userId),
    bio: p.bio,
    play_formats: p.play_formats,
    preferred_times: p.preferred_times,
    visibility: p.visibility,
    home: chain
      ? {
          country: opt(chain.country),
          region: opt(chain.region),
          province: opt(chain.province),
          city: opt(chain.city),
          barangay: opt(chain.barangay),
        }
      : null,
    location_verified: p.location_verified,
  };
}

export { skills };

// ── Venue locations and amenities ─────────────────────────

export interface VenuePlace {
  lat: number;
  lng: number;
  barangay_id: string;
  amenities: string[];
}

export const AMENITIES = [
  "Parking",
  "Lights",
  "Restrooms",
  "Covered court",
  "Air-conditioned",
  "Paddle rental",
  "Showers",
  "Lockers",
  "Food nearby",
  "Pro shop",
];

const barangayIn = (city: string, name: string) =>
  geoChildren(cityByName(city)!.id).find((b) => b.name === name)!.id;

export const places: Record<string, VenuePlace> = {
  "c-001": {
    lat: 14.1919,
    lng: 121.7302,
    barangay_id: barangayIn("Mauban", "Daungan"),
    amenities: ["Parking", "Lights", "Restrooms", "Covered court", "Paddle rental"],
  },
  "c-002": {
    lat: 13.9417,
    lng: 121.6235,
    barangay_id: barangayIn("Lucena", "Ibabang Dupay"),
    amenities: ["Parking", "Lights", "Restrooms"],
  },
  "c-003": {
    lat: 13.9351,
    lng: 121.6155,
    barangay_id: barangayIn("Lucena", "Barangay 4"),
    amenities: ["Air-conditioned", "Restrooms"],
  },
};

// More venues so search and the map have something to show. Each has an owner
// account and its own active subscription, like any other club.

interface ExtraVenue {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  address: string;
  city: string;
  province: string;
  barangay: string;
  lat: number;
  lng: number;
  amenities: string[];
  courts: Array<[string, Court["indoor_outdoor"], string, string]>;
  hours: [string, string];
  evening?: string;
  /** false: listed, but not taking bookings in the app yet. */
  online?: boolean;
  /** Signed up in the app and waiting for CourtFlex approval (Super Admin review queue). */
  pending?: boolean;
}

const extra: ExtraVenue[] = [
  {
    id: "c-004",
    slug: "tayabas-pickle-park",
    name: "Tayabas Pickle Park",
    tagline: "Three courts under the acacias, near the basilica.",
    address: "Gen. Luna St., Brgy. Poblacion",
    city: "Tayabas",
    province: "Quezon",
    barangay: "Poblacion",
    lat: 14.0275,
    lng: 121.5915,
    amenities: ["Parking", "Lights", "Restrooms", "Food nearby"],
    courts: [
      ["Court 1", "outdoor", "Concrete", "250.00"],
      ["Court 2", "outdoor", "Concrete", "250.00"],
      ["Court 3", "outdoor", "Acrylic", "280.00"],
    ],
    hours: ["06:00", "21:00"],
    evening: "300.00",
  },
  {
    id: "c-005",
    slug: "lucban-courtside",
    name: "Lucban Courtside",
    tagline: "Two courts and the best pancit habhab after.",
    address: "Rizal Ave., Brgy. Ayuti",
    city: "Lucban",
    province: "Quezon",
    barangay: "Ayuti",
    lat: 14.114,
    lng: 121.557,
    amenities: ["Parking", "Food nearby", "Restrooms"],
    courts: [
      ["Court A", "outdoor", "Asphalt", "200.00"],
      ["Court B", "outdoor", "Asphalt", "200.00"],
    ],
    hours: ["06:00", "20:00"],
  },
  {
    id: "c-006",
    slug: "qc-paddle-yard",
    name: "QC Paddle Yard",
    tagline: "Four air-conditioned courts in Teachers Village.",
    address: "Maginhawa St., Brgy. Teachers Village East",
    city: "Quezon City",
    province: "Metro Manila",
    barangay: "Teachers Village East",
    lat: 14.6505,
    lng: 121.049,
    amenities: ["Air-conditioned", "Covered court", "Showers", "Lockers", "Pro shop", "Paddle rental"],
    courts: [
      ["Court 1", "indoor", "Sport tile", "550.00"],
      ["Court 2", "indoor", "Sport tile", "550.00"],
      ["Court 3", "indoor", "Sport tile", "550.00"],
      ["Court 4", "indoor", "Wood", "650.00"],
    ],
    hours: ["07:00", "23:00"],
    evening: "700.00",
  },
  {
    id: "c-007",
    slug: "kapitolyo-dink-dome",
    name: "Kapitolyo Dink Dome",
    tagline: "Covered courts a short walk from the food strip.",
    address: "East Capitol Dr., Brgy. Kapitolyo",
    city: "Pasig City",
    province: "Metro Manila",
    barangay: "Kapitolyo",
    lat: 14.5705,
    lng: 121.0615,
    amenities: ["Covered court", "Lights", "Restrooms", "Food nearby", "Paddle rental"],
    courts: [
      ["Court 1", "indoor", "Acrylic", "600.00"],
      ["Court 2", "indoor", "Acrylic", "600.00"],
      ["Court 3", "outdoor", "Acrylic", "450.00"],
    ],
    hours: ["06:00", "22:00"],
  },
  {
    id: "c-008",
    slug: "lahug-pickle-hub",
    name: "Lahug Pickle Hub",
    tagline: "Hillside courts with a view of the city.",
    address: "Salinas Dr., Brgy. Lahug",
    city: "Cebu City",
    province: "Cebu",
    barangay: "Lahug",
    lat: 10.3315,
    lng: 123.8985,
    amenities: ["Parking", "Lights", "Restrooms"],
    courts: [
      ["Court 1", "outdoor", "Acrylic", "300.00"],
      ["Court 2", "outdoor", "Acrylic", "300.00"],
    ],
    hours: ["06:00", "22:00"],
    evening: "350.00",
  },
  {
    id: "c-009",
    slug: "calamba-hot-springs-courts",
    name: "Calamba Hot Springs Courts",
    tagline: "Four covered courts near the resorts on the national highway.",
    address: "National Hwy., Brgy. Real",
    city: "Calamba City",
    province: "Laguna",
    barangay: "Real",
    lat: 14.2117,
    lng: 121.1653,
    amenities: ["Parking", "Lights", "Covered court", "Restrooms", "Paddle rental"],
    courts: [
      ["Court A", "indoor", "Sport tile", "350.00"],
      ["Court B", "indoor", "Sport tile", "350.00"],
      ["Court C", "outdoor", "Acrylic", "220.00"],
      ["Court D", "outdoor", "Acrylic", "220.00"],
    ],
    hours: ["06:00", "22:00"],
    evening: "420.00",
  },
  {
    id: "c-010",
    slug: "balibago-paddle-center",
    name: "Balibago Paddle Center",
    tagline: "Air-conditioned courts a minute from the SLEX exit.",
    address: "Balibago Complex, Brgy. Balibago",
    city: "Santa Rosa City",
    province: "Laguna",
    barangay: "Balibago",
    lat: 14.3122,
    lng: 121.1114,
    amenities: ["Parking", "Air-conditioned", "Restrooms", "Showers", "Lockers", "Pro shop"],
    courts: [
      ["Court 1", "indoor", "Wood", "600.00"],
      ["Court 2", "indoor", "Wood", "600.00"],
    ],
    hours: ["07:00", "23:00"],
    evening: "750.00",
  },
  {
    id: "c-011",
    slug: "bel-air-rooftop-pickleball",
    name: "Bel-Air Rooftop Pickleball",
    tagline: "Two courts on a rooftop in Makati, lit until late.",
    address: "Jupiter St., Brgy. Bel-Air",
    city: "Makati City",
    province: "Metro Manila",
    barangay: "Bel-Air",
    lat: 14.5615,
    lng: 121.0296,
    amenities: ["Lights", "Restrooms", "Paddle rental", "Food nearby"],
    courts: [
      ["Rooftop 1", "outdoor", "Acrylic", "800.00"],
      ["Rooftop 2", "outdoor", "Acrylic", "800.00"],
    ],
    hours: ["06:00", "23:00"],
    evening: "950.00",
  },
  {
    id: "c-012",
    slug: "bgc-dink-district",
    name: "BGC Dink District",
    tagline: "Six courts in the middle of Bonifacio Global City.",
    address: "26th St., Brgy. Fort Bonifacio",
    city: "Taguig City",
    province: "Metro Manila",
    barangay: "Fort Bonifacio",
    lat: 14.5502,
    lng: 121.0503,
    amenities: ["Parking", "Lights", "Air-conditioned", "Restrooms", "Showers", "Lockers", "Pro shop"],
    courts: [
      ["Court 1", "indoor", "Sport tile", "900.00"],
      ["Court 2", "indoor", "Sport tile", "900.00"],
      ["Court 3", "indoor", "Sport tile", "900.00"],
      ["Court 4", "outdoor", "Acrylic", "650.00"],
      ["Court 5", "outdoor", "Acrylic", "650.00"],
      ["Court 6", "outdoor", "Acrylic", "650.00"],
    ],
    hours: ["06:00", "23:00"],
    evening: "1100.00",
    online: false,
  },
  {
    id: "c-013",
    slug: "tabunok-barangay-courts",
    name: "Tabunok Barangay Courts",
    tagline: "Community courts by the covered gym. Cheapest games in Talisay.",
    address: "Tabunok Sports Complex, Brgy. Tabunok",
    city: "Talisay City",
    province: "Cebu",
    barangay: "Tabunok",
    lat: 10.2612,
    lng: 123.8411,
    amenities: ["Lights", "Restrooms"],
    courts: [
      ["Court 1", "outdoor", "Concrete", "150.00"],
      ["Court 2", "outdoor", "Concrete", "150.00"],
    ],
    hours: ["05:00", "21:00"],
    evening: "180.00",
  },
  {
    id: "c-014",
    slug: "sampaloc-lakeside-court",
    name: "Sampaloc Lakeside Court",
    tagline: "One court by the lake. Bring your own paddle.",
    address: "Lakeside Rd., Brgy. Poblacion",
    city: "Sampaloc",
    province: "Quezon",
    barangay: "Poblacion",
    lat: 14.1631,
    lng: 121.6395,
    amenities: ["Parking"],
    courts: [["Court 1", "outdoor", "Concrete", "180.00"]],
    hours: ["06:00", "18:00"],
    online: false,
  },
  {
    id: "c-015",
    slug: "mateuna-courts",
    name: "Mateuna Courts",
    tagline: "Pickleball courts in Tayabas City.",
    address: "Gen. Luna St., near the basilica",
    city: "Tayabas City",
    province: "Quezon",
    barangay: "Mateuna",
    lat: 14.0268,
    lng: 121.5921,
    amenities: [],
    courts: [
      ["Court 1", "outdoor", "Acrylic", "250.00"],
      ["Court 2", "outdoor", "Acrylic", "250.00"],
    ],
    hours: ["06:00", "21:00"],
    pending: true,
  },
];

const base = clubs.find((c) => c.id === "c-002")!;
extra.forEach((v, i) => {
  const ownerId = `u-${60 + i}`;
  users.push({
    id: ownerId,
    name: `${v.name.split(" ")[0]} Owner`,
    email: `owner.${v.slug}@example.test`,
    super_admin: false,
    has_player_profile: false,
    home_city: v.city,
    phone: null,
  });
  memberships.push({
    id: `cm-${60 + i}`,
    club_id: v.id,
    user_id: ownerId,
    role_key: "owner",
    status: "active",
    invited_by: null,
    joined_at: "2026-07-01T00:00:00.000Z",
  });
  const club: Club = {
    ...base,
    id: v.id,
    slug: v.slug,
    name: v.name,
    tagline: v.tagline,
    description: v.tagline,
    rules: "",
    address: v.address,
    city: v.city,
    province: v.province,
    contact_phone: `0917 555 0${400 + i}`,
    contact_email: `hello@${v.slug}.test`,
    timezone: TZ,
    subscription_status: v.pending ? "trialing" : "active",
    status: v.pending ? "pending_review" : "active",
    read_only: false,
    settings: {
      ...base.settings,
      member_join_policy: "open",
      require_open_play_approval: true,
      allow_online_booking: v.online !== false,
      booking_payments: {
        pay_at_court: v.id !== "c-010",
        gcash: { account_name: v.name, account_number: `0917555${String(1000 + i).slice(-4)}`, qr_url: null },
        maya: null,
        // Balibago wants payment before play: no pay at court in the app.
        require_prepayment: v.id === "c-010",
      },
      allow_guest_booking: true,
    },
  };
  clubs.push(club);
  places[v.id] = {
    lat: v.lat,
    lng: v.lng,
    barangay_id: barangayIn(v.city, v.barangay),
    amenities: v.amenities,
  };
  v.courts.forEach(([name, io, surface, price], j) => {
    const id = `court-${10 * (i + 1) + 100 + j}`;
    courts.push({
      id,
      club_id: v.id,
      name,
      court_code: name.replace("Court ", "").slice(0, 3),
      indoor_outdoor: io,
      surface_type: surface,
      base_price: price,
      currency: "PHP",
      status: "active",
    });
    courtHours[id] = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((weekday) => ({
      weekday,
      is_closed: false,
      opens_at: v.hours[0],
      closes_at: v.hours[1],
    }));
    if (v.evening) {
      priceRules.push({
        id: `pr-${id}`,
        court_id: id,
        day_of_week: null,
        starts_at: "17:00",
        ends_at: v.hours[1],
        price: v.evening,
        currency: "PHP",
      });
    }
  });
});

export const barangayName = (id: string) => geoById(id)?.name ?? "";
