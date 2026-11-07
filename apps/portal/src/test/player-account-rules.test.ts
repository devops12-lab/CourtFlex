// Player accounts, onboarding, location and court discovery (Phase 1), checked
// against the mock API so the Laravel API has an exact spec.
import { setupServer } from "msw/node";
import { handlers } from "@courtflex/mocks";
import { ApiError, api, configureApi, shiftDate, todayIn } from "@courtflex/api";
import type {
  AvailabilitySlot,
  CourtPublic,
  GeoOption,
  Me,
  PlayerHome,
  PlayerProfile,
  VenueResult,
} from "@courtflex/api";

const server = setupServer(...handlers);
vi.setConfig({ testTimeout: 30_000 });

beforeAll(() => {
  configureApi({ baseUrl: "http://localhost/api/v1" });
  server.listen({ onUnhandledFrame: "error" });
});
afterAll(() => server.close());
beforeEach(() => sessionStorage.clear());

const login = (email: string, password = "password") =>
  api<Me>("/auth/login", { method: "POST", body: { email, password } });

async function expectApiError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  return error as ApiError;
}

const newAccount = (overrides: Record<string, unknown> = {}) => ({
  name: "Lea Ramos",
  email: `lea.${Math.random().toString(36).slice(2, 8)}@example.test`,
  // Phones are unique per account, so each test account gets its own.
  phone: `0917${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
  password: "dinkdink9",
  password_confirmation: "dinkdink9",
  accept_terms: true,
  ...overrides,
});

describe("registration and verification", () => {
  test("bad input is refused field by field", async () => {
    const err = await expectApiError(
      api("/auth/register", {
        method: "POST",
        body: newAccount({
          email: "player1@example.test",
          phone: "12345",
          password: "short",
          accept_terms: false,
        }),
      }),
      422,
    );
    expect(err.field("email")).toMatch(/already uses this email/);
    expect(err.field("phone")).toMatch(/mobile number/);
    expect(err.field("password")).toMatch(/at least 8/);
    expect(err.field("accept_terms")).toBeTruthy();
  });

  test("a new account is signed in, unverified, and needs onboarding", async () => {
    const me = await api<Me>("/auth/register", { method: "POST", body: newAccount() });
    expect(me.email_verified).toBe(false);
    expect(me.needs_onboarding).toBe(true);

    const wrong = await expectApiError(
      api("/auth/verify", { method: "POST", body: { code: "000000" } }),
      422,
    );
    expect(wrong.field("code")).toMatch(/4 tries left/);
    await expectApiError(api("/auth/verify/resend", { method: "POST" }), 429); // just sent one
    const verified = await api<Me>("/auth/verify", { method: "POST", body: { code: "246810" } });
    expect(verified.email_verified).toBe(true);
  });

  test("five wrong codes lock verification until a new code is sent", async () => {
    await api("/auth/register", { method: "POST", body: newAccount() });
    for (let i = 0; i < 5; i++)
      await api("/auth/verify", { method: "POST", body: { code: "111111" } }).catch(() => null);
    await expectApiError(api("/auth/verify", { method: "POST", body: { code: "246810" } }), 429);
  });
});

describe("onboarding", () => {
  test("profile plus home barangay completes onboarding", async () => {
    await api("/auth/register", { method: "POST", body: newAccount() });
    await api("/auth/verify", { method: "POST", body: { code: "246810" } });
    await expectApiError(api("/player/location", { method: "PATCH", body: { barangay_id: "x" } }), 409);

    const bad = await expectApiError(
      api("/player/profile", {
        method: "PATCH",
        body: {
          display_name: "L",
          skill_level: "all",
          bio: "",
          play_formats: [],
          preferred_times: [],
          visibility: "public",
        },
      }),
      422,
    );
    expect(bad.field("display_name")).toBeTruthy();
    expect(bad.field("skill_level")).toBeTruthy();
    expect(bad.field("play_formats")).toBeTruthy();

    await api("/player/profile", {
      method: "PATCH",
      body: {
        display_name: "Lea R.",
        skill_level: "novice",
        bio: "",
        play_formats: ["doubles"],
        preferred_times: ["evening"],
        visibility: "public",
      },
    });
    let me = await api<Me>("/me");
    expect(me.needs_onboarding).toBe(true); // no home yet

    const regions = await api<GeoOption[]>("/geo/regions");
    const calabarzon = regions.find((r) => r.name.startsWith("CALABARZON"))!;
    const provinces = await api<GeoOption[]>("/geo/provinces", { query: { parent_id: calabarzon.id } });
    const quezon = provinces.find((p) => p.name === "Quezon")!;
    const cities = await api<GeoOption[]>("/geo/cities", { query: { parent_id: quezon.id } });
    const mauban = cities.find((c) => c.name === "Mauban")!;
    const barangays = await api<GeoOption[]>("/geo/barangays", { query: { parent_id: mauban.id } });
    await expectApiError(api("/geo/barangays", { query: { parent_id: quezon.id } }), 422); // wrong level

    const profile = await api<PlayerProfile>("/player/location", {
      method: "PATCH",
      body: { barangay_id: barangays[0]!.id },
    });
    expect(profile.home?.city.name).toBe("Mauban");
    expect(profile.home?.province.name).toBe("Quezon");
    expect(profile.location_verified).toBe(false);
    me = await api<Me>("/me");
    expect(me.needs_onboarding).toBe(false);
  });

  test("existing players are onboarded; staff-only accounts aren't asked", async () => {
    expect((await login("player1@example.test")).needs_onboarding).toBe(false);
    expect((await login("admin@example.test")).needs_onboarding).toBe(false);
  });

  test("changing home barangay needs verifying again", async () => {
    await login("andrea@example.test");
    const before = await api<PlayerProfile>("/player/profile");
    expect(before.location_verified).toBe(true);
    const cities = await api<GeoOption[]>("/geo/barangays", { query: { parent_id: "c-045624000" } });
    const after = await api<PlayerProfile>("/player/location", {
      method: "PATCH",
      body: { barangay_id: cities[0]!.id },
    });
    expect(after.location_verified).toBe(false);
    expect(after.home?.city.name).toBe("Lucena City");
  });
});

describe("password reset", () => {
  test("reset link works once, then the new password signs in", async () => {
    const unknown = await api<{ sent: boolean; mock_reset_url?: string }>("/auth/forgot-password", {
      method: "POST",
      body: { email: "nobody@example.test" },
    });
    expect(unknown.sent).toBe(true); // same answer, no account lookup leak
    const sent = await api<{ sent: boolean; mock_reset_url?: string }>("/auth/forgot-password", {
      method: "POST",
      body: { email: "joy@example.test" },
    });
    const token = new URL(sent.mock_reset_url!, "http://x").searchParams.get("token")!;
    const weak = await expectApiError(
      api("/auth/reset-password", {
        method: "POST",
        body: { token, password: "abc", password_confirmation: "abc" },
      }),
      422,
    );
    expect(weak.field("password")).toBeTruthy();
    await api("/auth/reset-password", {
      method: "POST",
      body: { token, password: "newpass99", password_confirmation: "newpass99" },
    });
    await expectApiError(
      api("/auth/reset-password", {
        method: "POST",
        body: { token, password: "again999", password_confirmation: "again999" },
      }),
      410,
    );
    await expectApiError(login("joy@example.test"), 422);
    expect((await login("joy@example.test", "newpass99")).email).toBe("joy@example.test");
  });
});

describe("court discovery", () => {
  beforeEach(() => login("player1@example.test"));

  test("text search covers club, city, province and barangay", async () => {
    const byCity = await api<VenueResult[]>("/discovery/courts", { query: { q: "pasig" } });
    expect(byCity.map((v) => v.name)).toEqual(["Kapitolyo Dink Dome"]);
    const byBarangay = await api<VenueResult[]>("/discovery/courts", { query: { q: "teachers village" } });
    expect(byBarangay[0]?.name).toBe("QC Paddle Yard");
    const all = await api<VenueResult[]>("/discovery/courts");
    expect(all.some((v) => v.name === "Lucena Dink House")).toBe(false); // read-only venue hidden
  });

  test("filters are applied by the server and only matching courts are listed", async () => {
    const indoor = await api<VenueResult[]>("/discovery/courts", {
      query: { indoor_outdoor: "indoor", q: "kapitolyo" },
    });
    expect(indoor[0]!.courts.map((c) => c.name)).toEqual(["Court 1", "Court 2"]);
    const cheap = await api<VenueResult[]>("/discovery/courts", { query: { max_price: "250" } });
    expect(cheap.every((v) => v.courts.every((c) => Number(c.base_price) <= 250))).toBe(true);
    expect(cheap.some((v) => v.name === "QC Paddle Yard")).toBe(false);
    const showers = await api<VenueResult[]>("/discovery/courts", {
      query: { amenities: "Showers,Lockers" },
    });
    expect(showers.some((v) => v.name === "QC Paddle Yard")).toBe(true);
    expect(showers.every((v) => ["Showers", "Lockers"].every((x) => v.amenities.includes(x)))).toBe(true);
  });

  test("visitors can explore without an account; booking still needs one", async () => {
    sessionStorage.clear();
    const all = await api<VenueResult[]>("/discovery/courts");
    expect(all.length).toBeGreaterThan(10);
    const court = all.find((v) => v.bookable)!.courts[0]!;
    await api(`/courts/${court.id}`);
    await api(`/courts/${court.id}/availability`);
    // Booking itself needs an account, or a guest booking confirmed by an email code.
    await expectApiError(api("/bookings", { method: "POST", body: { court_id: court.id } }), 401);
  });

  test("sorts: price both ways, soonest free, and recommended puts bookable venues first", async () => {
    const price = (list: VenueResult[]) => list.map((v) => Number(v.price_from));
    const up = await api<VenueResult[]>("/discovery/courts", { query: { sort: "price_asc" } });
    expect(price(up)).toEqual([...price(up)].sort((a, b) => a - b));
    const down = await api<VenueResult[]>("/discovery/courts", { query: { sort: "price_desc" } });
    expect(price(down)).toEqual([...price(down)].sort((a, b) => b - a));
    const soon = await api<VenueResult[]>("/discovery/courts", { query: { sort: "availability" } });
    const times = soon.map((v) => v.next_free_at).filter(Boolean) as string[];
    expect(times).toEqual([...times].sort());
    const rec = await api<VenueResult[]>("/discovery/courts");
    const firstNot = rec.findIndex((v) => !v.bookable);
    expect(firstNot).toBeGreaterThan(0);
    expect(rec.slice(firstNot).every((v) => !v.bookable)).toBe(true);
    await expectApiError(api("/discovery/courts", { query: { sort: "cheapest" } }), 422);
  });

  test("available today only lists venues with a free hour left; not-bookable venues never do", async () => {
    const all = await api<VenueResult[]>("/discovery/courts");
    for (const v of all.filter((x) => !x.bookable)) {
      expect(v.next_free_at).toBeNull();
      expect(v.free_slots_today).toBe(0);
    }
    const free = await api<VenueResult[]>("/discovery/courts", { query: { available_today: "1" } });
    expect(
      free.every((v) => v.bookable && v.free_slots_today > 0 && v.next_free_at! > new Date().toISOString()),
    ).toBe(true);
  });

  test("a venue that doesn't take bookings in the app refuses a booking", async () => {
    const all = await api<VenueResult[]>("/discovery/courts", { query: { q: "BGC" } });
    const court = all[0]!.courts[0]!;
    expect(all[0]!.bookable).toBe(false);
    const err = await expectApiError(
      api("/bookings/quote", {
        query: {
          court_id: court.id,
          starts_at: new Date(Date.now() + 86_400_000).toISOString(),
          duration_minutes: "60",
        },
      }),
      422,
    );
    expect(err.field("court_id")).toMatch(/doesn't take bookings in the app/);
  });

  test("with a location, results are nearest first and the radius applies", async () => {
    // Standing in Lucena.
    const near = await api<VenueResult[]>("/discovery/courts", {
      query: { lat: "13.9373", lng: "121.6170", radius_km: "25" },
    });
    expect(near[0]!.name).toBe("Quezon Sports Courts");
    expect(near.every((v) => v.distance_km! <= 25)).toBe(true);
    expect(near.some((v) => v.city === "Cebu City")).toBe(false);
    const sorted = near.map((v) => v.distance_km!);
    expect(sorted).toEqual([...sorted].sort((a, b) => a - b));
  });

  test("a court page shows rates, hours and the venue", async () => {
    const court = await api<CourtPublic>("/courts/court-001");
    expect(court.venue.name).toBe("Mauban Pickleball Courts");
    expect(court.price_rules[0]?.price).toBe("350.00");
    expect(court.hours).toHaveLength(7);
    await expectApiError(api("/courts/court-006"), 404); // read-only venue
  });

  test("players see availability only within the booking window", async () => {
    const today = todayIn("Asia/Manila");
    const slots = await api<AvailabilitySlot[]>("/courts/court-001/availability", {
      query: { date: shiftDate(today, 1) },
    });
    expect(slots.some((s) => !s.available)).toBe(true); // Joy's 7 AM booking
    const far = await expectApiError(
      api("/courts/court-001/availability", { query: { date: shiftDate(today, 30) } }),
      422,
    );
    expect(far.field("date")).toMatch(/14 days ahead/);
  });

  test("home shows the next game and where the player lives", async () => {
    const home = await api<PlayerHome>("/player/home");
    expect(home.greeting_name).toBe("Jamie");
    expect(home.next_game?.title).toBe("Tara Pikol Night Rally");
    expect(home.near?.city).toBe("Mauban");
  });
});
