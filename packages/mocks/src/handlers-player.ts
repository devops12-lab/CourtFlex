// Player accounts, profiles, geography and court discovery endpoints (Phase 1).
import { http } from "msw";
import type {
  AvailabilitySlot,
  Court,
  CourtPublic,
  CourtSummary,
  PlayerHome,
  OwnerSignupInput,
  OwnerSignupResult,
  ProfileInput,
  RegisterInput,
  VenueResult,
} from "@courtflex/api";
import { shiftDate, todayIn } from "@courtflex/api";
import {
  TZ,
  memberships,
  bookings,
  clockOf,
  clubs,
  courtHours,
  courts,
  exceptions,
  findOverlap,
  hoursOn,
  nextId,
  priceFor,
  priceRules,
  unbookableReason,
  users,
} from "./db";
import { platformSettings, reviewKey, reviews } from "./admin-db";
import { distanceKm, geoById, geoChain, geoChildren } from "./geo";
import { participants, sessionStatus, sessions } from "./open-play-db";
import {
  AMENITIES,
  MOCK_VERIFICATION_CODE,
  passwords,
  places,
  profileView,
  profiles,
  resetTokens,
  skills,
  unverified,
  verifyAttempts,
} from "./player-db";
import { API, SESSION_KEY, fail, invalid, latency, meFor, ok, sessionUser } from "./http-helpers";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Codes sent to new owners' emails, by verification id. In memory: used within one visit. */
const ownerCodes: Record<
  string,
  {
    email: string;
    code: string;
    sentAt: number;
    expiresAt: number;
    attempts: number;
    verified: boolean;
    used: boolean;
  }
> = {};
const PHONE_RE = /^(09\d{9}|\+639\d{9})$/;

function signedIn() {
  const user = sessionUser();
  return user
    ? { user, error: null }
    : { user: null, error: fail(401, "Your session has ended. Sign in again.") };
}

function passwordErrors(password: string, confirmation: string): Record<string, string[]> | null {
  if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { password: ["Use at least 8 characters with a letter and a number."] };
  }
  if (password !== confirmation) return { password_confirmation: ["The passwords don't match."] };
  return null;
}

/** Today's hours across a venue's courts, in club time. */
function venueToday(clubId: string) {
  const date = todayIn(TZ);
  const ranges = courts
    .filter((c) => c.club_id === clubId && c.status === "active")
    .map((c) => hoursOn(c.id, date))
    .filter((r): r is { open: string; close: string } => !!r);
  if (!ranges.length) return null;
  const open = ranges.map((r) => r.open).sort()[0]!;
  const close = ranges
    .map((r) => r.close)
    .sort()
    .at(-1)!;
  return { open, close };
}

const summary = (c: (typeof courts)[number]): CourtSummary => ({
  id: c.id,
  name: c.name,
  indoor_outdoor: c.indoor_outdoor,
  surface_type: c.surface_type,
  base_price: c.base_price,
});

const publicVenues = () => clubs.filter((c) => c.status === "active" && !c.read_only && places[c.id]);

export const playerHandlers = [
  // ── Accounts (§8.2) ─────────────────────────────────────
  http.post(`${API}/auth/register`, async ({ request }) => {
    await latency();
    const body = (await request.json()) as RegisterInput;
    const email = body.email?.trim().toLowerCase() ?? "";
    const phone = body.phone?.replace(/[\s-]/g, "") ?? "";
    const errors: Record<string, string[]> = {};
    if (!body.name?.trim() || body.name.trim().length < 2)
      errors.name = ["Enter your name as other players should see it."];
    if (!EMAIL_RE.test(email)) errors.email = ["Enter a valid email address."];
    else if (users.some((u) => u.email === email))
      errors.email = ["An account already uses this email. Sign in instead."];
    if (phone && !PHONE_RE.test(phone)) errors.phone = ["Use a mobile number like 0917 123 4567."];
    else if (phone && users.some((u) => u.phone === phone.replace(/^\+63/, "0")))
      errors.phone = ["An account already uses this number."];
    Object.assign(errors, passwordErrors(body.password, body.password_confirmation) ?? {});
    if (!body.accept_terms) errors.accept_terms = ["Accept the terms to create an account."];
    if (Object.keys(errors).length) return invalid(errors);

    const id = nextId("u");
    users.push({
      id,
      name: body.name.trim(),
      email,
      super_admin: false,
      has_player_profile: false,
      home_city: null,
      phone: phone ? phone.replace(/^\+63/, "0") : null,
    });
    passwords[id] = body.password;
    unverified.add(id);
    verifyAttempts[id] = { count: 0, lastSent: Date.now() };
    sessionStorage.setItem(SESSION_KEY, id);
    return ok(meFor(id), 201);
  }),

  http.post(`${API}/auth/verify`, async ({ request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    if (!unverified.has(auth.user.id)) return ok(meFor(auth.user.id));
    const a = (verifyAttempts[auth.user.id] ??= { count: 0, lastSent: Date.now() });
    if (a.count >= 5) return fail(429, "Too many wrong codes. Send a new code and try again.");
    const { code } = (await request.json()) as { code?: string };
    if ((code ?? "").replace(/\s/g, "") !== MOCK_VERIFICATION_CODE) {
      a.count++;
      return invalid({
        code: [`That code isn't right. ${5 - a.count} ${5 - a.count === 1 ? "try" : "tries"} left.`],
      });
    }
    unverified.delete(auth.user.id);
    return ok(meFor(auth.user.id));
  }),

  http.post(`${API}/auth/verify/resend`, async () => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const a = (verifyAttempts[auth.user.id] ??= { count: 0, lastSent: 0 });
    const wait = Math.ceil((a.lastSent + 60_000 - Date.now()) / 1000);
    if (wait > 0) return fail(429, `You can ask for a new code in ${wait} seconds.`);
    a.lastSent = Date.now();
    a.count = 0;
    return ok({ resend_after_seconds: 60 });
  }),

  // Same answer whether or not the email exists, so the form can't be used to find accounts.
  http.post(`${API}/auth/forgot-password`, async ({ request }) => {
    await latency();
    const { email } = (await request.json()) as { email?: string };
    if (!EMAIL_RE.test(email?.trim() ?? ""))
      return invalid({ email: ["Enter the email you signed up with."] });
    const user = users.find((u) => u.email === email!.trim().toLowerCase());
    let mock_reset_url: string | undefined;
    if (user) {
      const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      resetTokens[token] = { userId: user.id, expires: Date.now() + 30 * 60_000 };
      // Mock-only: stands in for the email until the backend sends real ones.
      mock_reset_url = `/reset-password?token=${token}`;
    }
    return ok({ sent: true, mock_reset_url });
  }),

  http.post(`${API}/auth/reset-password`, async ({ request }) => {
    await latency();
    const body = (await request.json()) as {
      token?: string;
      password: string;
      password_confirmation: string;
    };
    const t = body.token ? resetTokens[body.token] : undefined;
    if (!t || t.expires < Date.now()) {
      return fail(410, "This reset link has expired or was already used. Ask for a new one.");
    }
    const errors = passwordErrors(body.password, body.password_confirmation);
    if (errors) return invalid(errors);
    passwords[t.userId] = body.password;
    delete resetTokens[body.token!];
    return ok({ reset: true });
  }),

  // ── Profile and location (§9.1) ─────────────────────────
  http.get(`${API}/player/profile`, async () => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    if (!profiles[auth.user.id]) return fail(404, "You haven't set up your player profile yet.");
    return ok(profileView(auth.user.id));
  }),

  http.patch(`${API}/player/profile`, async ({ request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const body = (await request.json()) as ProfileInput;
    const errors: Record<string, string[]> = {};
    if (!body.display_name?.trim() || body.display_name.trim().length < 2) {
      errors.display_name = ["Enter the name other players will see."];
    }
    if (!["beginner", "novice", "intermediate", "advanced", "pro"].includes(body.skill_level)) {
      errors.skill_level = ["Choose the level that fits you best."];
    }
    if (!Array.isArray(body.play_formats) || body.play_formats.length === 0)
      errors.play_formats = ["Choose singles, doubles or both."];
    if (!["public", "members", "private"].includes(body.visibility))
      errors.visibility = ["Choose who can see your profile."];
    if ((body.bio ?? "").length > 280) errors.bio = ["Keep it under 280 characters."];
    if (Object.keys(errors).length) return invalid(errors);
    const p = (profiles[auth.user.id] ??= {
      user_id: auth.user.id,
      display_name: "",
      bio: "",
      play_formats: ["doubles"],
      preferred_times: [],
      visibility: "public",
      barangay_id: null,
      location_verified: false,
    });
    Object.assign(p, {
      display_name: body.display_name.trim(),
      bio: body.bio?.trim() ?? "",
      play_formats: body.play_formats,
      preferred_times: body.preferred_times ?? [],
      visibility: body.visibility,
    });
    skills[auth.user.id] = body.skill_level;
    auth.user.has_player_profile = true;
    return ok(profileView(auth.user.id));
  }),

  http.patch(`${API}/player/location`, async ({ request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    if (!profiles[auth.user.id]) return fail(409, "Set up your profile first.");
    const { barangay_id } = (await request.json()) as { barangay_id?: string };
    const chain = barangay_id ? geoChain(barangay_id) : null;
    if (!chain) return invalid({ barangay_id: ["Choose your barangay."] });
    const p = profiles[auth.user.id]!;
    if (p.barangay_id !== barangay_id) {
      // A new home location needs checking again before it counts for local rankings (§4.4).
      p.location_verified = false;
    }
    p.barangay_id = barangay_id!;
    auth.user.home_city = chain.city.name;
    return ok(profileView(auth.user.id));
  }),

  http.get(`${API}/geo/:level`, async ({ params, request }) => {
    const level = String(params.level);
    const parent = new URL(request.url).searchParams.get("parent_id");
    const expect: Record<string, string> = {
      regions: "country",
      provinces: "region",
      cities: "province",
      barangays: "city",
    };
    if (!expect[level]) return fail(404, "Unknown level.");
    const parentId = level === "regions" ? "ph" : parent;
    if (!parentId || geoById(parentId)?.level !== expect[level])
      return invalid({ parent_id: ["Choose the level above first."] });
    return ok(geoChildren(parentId).map((n) => ({ id: n.id, code: n.code, name: n.name })));
  }),

  // ── Home ────────────────────────────────────────────────
  http.get(`${API}/player/home`, async () => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const mine = participants
      .filter(
        (p) => p.player_id === auth.user.id && ["registered", "waitlisted", "checked_in"].includes(p.status),
      )
      .map((p) => ({ p, s: sessions.find((s) => s.id === p.session_id)! }))
      .filter(({ s }) => ["published", "live"].includes(sessionStatus(s)))
      .sort((a, b) => a.s.starts_at.localeCompare(b.s.starts_at));
    const next = mine[0];
    const booking = bookings
      .filter(
        (b) =>
          b.player?.id === auth.user.id &&
          ["pending", "confirmed"].includes(b.status) &&
          new Date(b.ends_at).getTime() > Date.now(),
      )
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
    const chain = profiles[auth.user.id]?.barangay_id ? geoChain(profiles[auth.user.id]!.barangay_id!) : null;
    const home: PlayerHome = {
      greeting_name: (profiles[auth.user.id]?.display_name ?? auth.user.name).split(" ")[0]!,
      next_game:
        booking && (!next || booking.starts_at < next.s.starts_at)
          ? {
              kind: "booking",
              booking_id: booking.id,
              title: courts.find((c) => c.id === booking.court_id)!.name,
              venue_name: clubs.find((c) => c.id === booking.club_id)!.name,
              starts_at: booking.starts_at,
              ends_at: booking.ends_at,
              booking_code: booking.booking_code,
              payment_status: booking.payment_status,
            }
          : next
            ? {
                kind: "open_play",
                session_id: next.s.id,
                title: next.s.title,
                venue_name: clubs.find((c) => c.id === next.s.venue_id)!.name,
                starts_at: next.s.starts_at,
                ends_at: next.s.ends_at,
                status: next.p.status as "registered" | "waitlisted" | "checked_in",
                waitlist_position: next.p.waitlist_position,
              }
            : null,
      near: chain ? { city: chain.city.name, province: chain.province.name } : null,
    };
    return ok(home);
  }),

  // ── Court discovery (§9.4, Phase 6 acceptance: filters applied by the server) ──
  // Open to visitors: anyone can explore courts and see what's free. Booking needs an account.
  http.get(`${API}/discovery/courts`, async ({ request }) => {
    await latency();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const hasPoint =
      url.searchParams.has("lat") &&
      url.searchParams.has("lng") &&
      Number.isFinite(lat) &&
      Number.isFinite(lng);
    const radius = Number(url.searchParams.get("radius_km") ?? 0);
    const io = url.searchParams.get("indoor_outdoor");
    const surface = url.searchParams.get("surface");
    const maxPrice = Number(url.searchParams.get("max_price") ?? 0);
    const wanted = (url.searchParams.get("amenities") ?? "").split(",").filter(Boolean);
    const availableToday = url.searchParams.get("available_today") === "1";
    const sort = url.searchParams.get("sort") ?? "recommended";
    if (!["recommended", "availability", "price_asc", "price_desc"].includes(sort))
      return invalid({ sort: ["Sort by recommended, availability or price."] });

    const results: VenueResult[] = [];
    for (const club of publicVenues()) {
      const place = places[club.id]!;
      if (wanted.some((a) => !place.amenities.includes(a))) continue;
      if (q) {
        const chain = geoChain(place.barangay_id);
        const haystack = [
          club.name,
          club.city,
          club.province,
          club.address,
          chain?.barangay.name,
          chain?.region.name,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) continue;
      }
      const distance = hasPoint ? distanceKm({ lat, lng }, { lat: place.lat, lng: place.lng }) : null;
      if (distance !== null && radius > 0 && distance > radius) continue;
      const matching = courts.filter(
        (c) =>
          c.club_id === club.id &&
          c.status === "active" &&
          (!io || c.indoor_outdoor === io) &&
          (!surface || c.surface_type === surface) &&
          (!maxPrice || Number(c.base_price) <= maxPrice),
      );
      if (!matching.length) continue;
      const today = venueToday(club.id);
      const now = new Date().toISOString();
      const bookable = club.settings.allow_online_booking;
      const free = bookable ? freeToday(matching) : { next: null, count: 0 };
      if (availableToday && !free.count) continue;
      results.push({
        id: club.id,
        slug: club.slug,
        name: club.name,
        tagline: club.tagline,
        address: club.address,
        city: club.city,
        province: club.province,
        latitude: place.lat,
        longitude: place.lng,
        distance_km: distance === null ? null : Math.round(distance * 10) / 10,
        logo_url: club.logo_url,
        cover_url: club.cover_url,
        amenities: place.amenities,
        courts: matching.map(summary),
        price_from: Math.min(...matching.map((c) => Number(c.base_price))).toFixed(2),
        currency: "PHP",
        open_now: !!today && today.open <= now && now < today.close,
        today: today ? { opens_at: clockOf(today.open), closes_at: clockOf(today.close) } : null,
        upcoming_session_count: sessions.filter(
          (s) => s.venue_id === club.id && ["published", "live"].includes(sessionStatus(s)),
        ).length,
        bookable,
        guest_booking: bookable && club.settings.allow_guest_booking,
        next_free_at: free.next,
        free_slots_today: free.count,
      });
    }
    const near = (a: VenueResult, b: VenueResult) =>
      a.distance_km !== null && b.distance_km !== null ? a.distance_km - b.distance_km : 0;
    const soonest = (a: VenueResult, b: VenueResult) =>
      (a.next_free_at ?? "9999").localeCompare(b.next_free_at ?? "9999");
    const price = (v: VenueResult) => Number(v.price_from);
    results.sort((a, b) => {
      if (sort === "price_asc") return price(a) - price(b) || a.name.localeCompare(b.name);
      if (sort === "price_desc") return price(b) - price(a) || a.name.localeCompare(b.name);
      if (sort === "availability") return soonest(a, b) || near(a, b) || a.name.localeCompare(b.name);
      // Recommended: bookable first. With a location, nearest next; otherwise free today next.
      const free = Number(b.free_slots_today > 0) - Number(a.free_slots_today > 0);
      return (
        Number(b.bookable) - Number(a.bookable) ||
        (hasPoint ? near(a, b) || free : free || near(a, b)) ||
        a.name.localeCompare(b.name)
      );
    });
    return ok(results);
  }),

  // ── Owner sign-up (R6) ──────────────────────────────────
  http.post(`${API}/owner-signup/code`, async ({ request }) => {
    await latency();
    if (!platformSettings.venue_signups_open)
      return fail(403, "CourtFlex isn't taking new venues right now. Please try again later.");
    const body = (await request.json()) as { name?: string; email?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    const errors: Record<string, string[]> = {};
    if (!body.name?.trim() || body.name.trim().length < 2) errors.name = ["Enter your full name."];
    if (!EMAIL_RE.test(email)) errors.email = ["Enter a valid email. The code goes there."];
    else if (users.some((u) => u.email === email))
      errors.email = ["This email already has a CourtFlex account. Sign in first, then add your venue."];
    if (Object.keys(errors).length) return invalid(errors);
    if (Object.values(ownerCodes).some((c) => c.email === email && !c.used && Date.now() - c.sentAt < 60_000))
      return fail(429, "A code was just sent. Wait a minute before asking for another.");
    const id = nextId("ov");
    const now = Date.now();
    // The real API emails a random code. The mock always uses 246810 (shown on screen as a mock hint).
    ownerCodes[id] = {
      email,
      code: "246810",
      sentAt: now,
      expiresAt: now + 10 * 60_000,
      attempts: 0,
      verified: false,
      used: false,
    };
    return ok(
      {
        verification_id: id,
        email,
        expires_at: new Date(now + 10 * 60_000).toISOString(),
        resend_after: new Date(now + 60_000).toISOString(),
      },
      201,
    );
  }),

  http.post(`${API}/owner-signup/verify`, async ({ request }) => {
    await latency();
    const body = (await request.json()) as { verification_id?: string; code?: string };
    const c = ownerCodes[body.verification_id ?? ""];
    if (!c || c.used) return invalid({ code: ["Ask for a new code."] });
    if (Date.now() > c.expiresAt) return invalid({ code: ["That code has expired. Ask for a new one."] });
    if (c.attempts >= 5) return invalid({ code: ["Too many wrong codes. Ask for a new one."] });
    if ((body.code ?? "").trim() !== c.code) {
      c.attempts++;
      return invalid({ code: [`That code doesn't match. ${5 - c.attempts} tries left.`] });
    }
    c.verified = true;
    return ok({ verified: true });
  }),

  http.post(`${API}/owner-signup`, async ({ request }) => {
    await latency();
    if (!platformSettings.venue_signups_open)
      return fail(403, "CourtFlex isn't taking new venues right now. Please try again later.");
    const body = (await request.json()) as Partial<OwnerSignupInput>;
    const v = body.venue;
    const ct = body.courts;
    const errors: Record<string, string[]> = {};

    // Step 1: the venue.
    const name = v?.name?.trim() ?? "";
    if (name.length < 3) errors["venue.name"] = ["Enter the venue's name, as players will see it."];
    else if (clubs.some((c) => c.name.toLowerCase() === name.toLowerCase()))
      errors["venue.name"] = [
        "A venue with this name is already on CourtFlex. Add the branch or area to it.",
      ];
    const lat = Number(v?.latitude);
    const lng = Number(v?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 4.5 || lat > 21.5 || lng < 116 || lng > 127)
      errors["venue.pin"] = ["Put the pin on your venue in the Philippines."];
    const chain = v?.barangay_id ? geoChain(v.barangay_id) : null;
    if (!chain) errors["venue.barangay_id"] = ["Choose the venue's barangay."];
    if (!v?.address?.trim()) errors["venue.address"] = ["Enter the street, building or landmark."];
    const count = Number(v?.court_count);
    if (!Number.isInteger(count) || count < 1 || count > 10)
      errors["venue.court_count"] = ["Choose 1 to 10 courts. You can add more on a paid plan."];
    const phone = v?.contact_phone?.replace(/[\s-]/g, "") ?? "";
    if (!PHONE_RE.test(phone))
      errors["venue.contact_phone"] = ["Enter the venue's mobile number, like 09171234567."];
    const contactEmail = v?.contact_email?.trim().toLowerCase() ?? "";
    if (contactEmail && !EMAIL_RE.test(contactEmail))
      errors["venue.contact_email"] = ["Enter a valid email, or leave it empty."];

    // Step 3: the courts.
    const hm = /^([01]\d|2[0-3]):(00|30)$/;
    if (!ct || !["indoor", "outdoor"].includes(ct.indoor_outdoor))
      errors["courts.indoor_outdoor"] = ["Choose indoor or outdoor."];
    if (!hm.test(ct?.opens_at ?? "")) errors["courts.opens_at"] = ["Choose an opening time."];
    if (!hm.test(ct?.closes_at ?? "")) errors["courts.closes_at"] = ["Choose a closing time."];
    else if (ct && hm.test(ct.opens_at) && ct.closes_at <= ct.opens_at)
      errors["courts.closes_at"] = ["Close after you open."];
    const rate = Number(ct?.hourly_rate);
    if (!Number.isFinite(rate) || rate < 50 || rate > 5000)
      errors["courts.hourly_rate"] = ["Enter an hourly rate from ₱50 to ₱5,000."];

    // Step 2: the owner. Signed in: the venue joins that account. Otherwise a new account, email confirmed.
    let ownerId = sessionUser()?.id ?? null;
    const o = body.owner;
    if (!ownerId) {
      const email = o?.email?.trim().toLowerCase() ?? "";
      if (!o?.name?.trim() || o.name.trim().length < 2) errors["owner.name"] = ["Enter your full name."];
      if (!EMAIL_RE.test(email)) errors["owner.email"] = ["Enter a valid email."];
      else if (users.some((u) => u.email === email))
        errors["owner.email"] = [
          "This email already has a CourtFlex account. Sign in first, then add your venue.",
        ];
      for (const [k, m] of Object.entries(
        passwordErrors(o?.password ?? "", o?.password_confirmation ?? "") ?? {},
      ))
        errors[`owner.${k}`] = m;
      const code = ownerCodes[o?.verification_id ?? ""];
      if (!code || !code.verified || code.used || code.email !== email)
        errors["owner.code"] = ["Confirm your email with the code we sent."];
    }
    if (Object.keys(errors).length) return invalid(errors);

    if (!ownerId) {
      ownerId = nextId("u");
      users.push({
        id: ownerId,
        name: o!.name.trim(),
        email: o!.email.trim().toLowerCase(),
        super_admin: false,
        has_player_profile: false,
        home_city: chain!.city.name,
        phone: null,
      });
      passwords[ownerId] = o!.password;
      ownerCodes[o!.verification_id]!.used = true;
      sessionStorage.setItem(SESSION_KEY, ownerId);
    }

    const base = clubs.find((c) => c.id === "c-002")!;
    let slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    while (clubs.some((c) => c.slug === slug)) slug += "-2";
    const clubId = nextId("c");
    clubs.push({
      ...base,
      id: clubId,
      slug,
      name,
      tagline: `Pickleball courts in ${chain!.city.name}.`,
      description: "",
      rules: "",
      logo_url: null,
      cover_url: null,
      contact_phone: phone.replace(/^\+63/, "0"),
      contact_email: contactEmail,
      address: v!.address.trim(),
      city: chain!.city.name,
      province: chain!.province.name,
      status: "pending_review",
      subscription_status: "trialing",
      read_only: false,
      settings: {
        ...base.settings,
        allow_online_booking: true,
        booking_payments: { pay_at_court: true, gcash: null, maya: null, require_prepayment: false },
        allow_guest_booking: true,
        allow_partial_payments: true,
        cancellation_policy: "Free cancellation up to 24 hours before your booking. After that, call us.",
        player_cancellation_hours: 24,
        payment_instructions: "Pay at the front desk when you arrive, before you go on court.",
      },
    });
    places[clubId] = { lat, lng, barangay_id: v!.barangay_id, amenities: [] };
    for (let n = 1; n <= count; n++) {
      const id = nextId("court");
      courts.push({
        id,
        club_id: clubId,
        name: `Court ${n}`,
        court_code: `C${n}`,
        indoor_outdoor: ct!.indoor_outdoor,
        surface_type: ct!.indoor_outdoor === "indoor" ? "Sport tile" : "Acrylic",
        base_price: rate.toFixed(2),
        currency: "PHP",
        status: "active",
      });
      courtHours[id] = ([0, 1, 2, 3, 4, 5, 6] as const).map((weekday) => ({
        weekday,
        is_closed: false,
        opens_at: ct!.opens_at,
        closes_at: ct!.closes_at,
      }));
    }
    memberships.push({
      id: nextId("cm"),
      club_id: clubId,
      user_id: ownerId,
      role_key: "owner",
      status: "active",
      invited_by: null,
      joined_at: new Date().toISOString(),
    });
    reviews[reviewKey("venue", clubId)] = { submitted_at: new Date().toISOString() };
    const result: OwnerSignupResult = {
      club_id: clubId,
      club_slug: slug,
      club_name: name,
      status: "pending_review",
    };
    return ok(result, 201);
  }),

  http.get(`${API}/discovery/amenities`, () => ok(AMENITIES)),

  http.get(`${API}/courts/:court`, async ({ params }) => {
    await latency();
    const c = courts.find((x) => x.id === params.court);
    const club = c && clubs.find((x) => x.id === c.club_id);
    if (!c || !club || club.read_only || club.status !== "active" || !places[club.id])
      return fail(404, "Court not found.");
    const now = new Date().toISOString();
    const court: CourtPublic = {
      ...summary(c),
      court_code: c.court_code,
      currency: "PHP",
      status: c.status,
      venue: {
        id: club.id,
        slug: club.slug,
        name: club.name,
        address: club.address,
        city: club.city,
        province: club.province,
        latitude: places[club.id]!.lat,
        longitude: places[club.id]!.lng,
        contact_phone: club.contact_phone,
        amenities: places[club.id]!.amenities,
        cancellation_policy: club.settings.cancellation_policy,
        booking_window_days: club.settings.booking_window_days,
        bookable: club.settings.allow_online_booking,
      },
      hours: courtHours[c.id] ?? [],
      price_rules: priceRules.filter((r) => r.court_id === c.id),
      closures: exceptions
        .filter((e) => e.court_id === c.id && e.ends_at > now)
        .map((e) => ({ starts_at: e.starts_at, ends_at: e.ends_at, reason: e.reason })),
    };
    return ok(court);
  }),

  // Players see availability up to the club's booking window. Prices come from the server.
  http.get(`${API}/courts/:court/availability`, async ({ params, request }) => {
    await latency();
    const c = courts.find((x) => x.id === params.court);
    const club = c && clubs.find((x) => x.id === c.club_id);
    if (!c || !club || club.read_only || club.status !== "active") return fail(404, "Court not found.");
    const url = new URL(request.url);
    const today = todayIn(TZ);
    const date = url.searchParams.get("date") ?? today;
    const length = Number(url.searchParams.get("duration_minutes") ?? 60);
    if (date < today) return invalid({ date: ["That date has passed."] });
    if (date > shiftDate(today, club.settings.booking_window_days)) {
      return invalid({
        date: [`${club.name} takes bookings up to ${club.settings.booking_window_days} days ahead.`],
      });
    }
    const hours = hoursOn(c.id, date);
    if (!hours) return ok([] as AvailabilitySlot[]);
    const slots: AvailabilitySlot[] = [];
    for (
      let t = new Date(hours.open).getTime();
      t + length * 60_000 <= new Date(hours.close).getTime();
      t += 30 * 60_000
    ) {
      const s = new Date(t).toISOString();
      const e = new Date(t + length * 60_000).toISOString();
      slots.push({
        starts_at: s,
        ends_at: e,
        available: t > Date.now() && !unbookableReason(c, s, e) && !findOverlap(c.id, s, e),
        price: priceFor(c, s, e).toFixed(2),
        currency: "PHP",
      });
    }
    return ok(slots);
  }),
];

/** Free one-hour starts left today on these courts, and the earliest one. */
function freeToday(list: Court[]): { next: string | null; count: number } {
  const day = todayIn(TZ);
  let next: string | null = null;
  let count = 0;
  for (const c of list) {
    const hours = hoursOn(c.id, day);
    if (!hours) continue;
    for (
      let t = new Date(hours.open).getTime();
      t + 3_600_000 <= new Date(hours.close).getTime();
      t += 3_600_000
    ) {
      if (t <= Date.now()) continue;
      const s = new Date(t).toISOString();
      const e = new Date(t + 3_600_000).toISOString();
      if (unbookableReason(c, s, e) || findOverlap(c.id, s, e)) continue;
      count++;
      if (!next || s < next) next = s;
    }
  }
  return { next, count };
}
