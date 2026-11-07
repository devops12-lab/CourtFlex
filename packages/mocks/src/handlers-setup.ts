// Club setup endpoints: profile and settings, courts, hours, prices,
// closures and staff (blueprint §9.3, §5.2 C, §11).
import { http } from "msw";
import type {
  BookingPayments,
  WalletAccount,
  ClosureInput,
  ClubRole,
  ClubUpdateInput,
  Court,
  CourtDetail,
  CourtInput,
  OperatingHours,
  PriceRuleInput,
  ScheduleException,
  StaffInviteInput,
  StaffMember,
  Weekday,
} from "@courtflex/api";
import {
  TZ,
  clockOf,
  courtCount,
  courtHours,
  courts,
  describeBooking,
  exceptions,
  memberships,
  nextId,
  person,
  planLimit,
  priceRules,
  staffCount,
  upcomingBookingsOn,
  users,
  weekdayOf,
} from "./db";
import { todayIn } from "@courtflex/api";
import {
  API,
  TIME_RE,
  authorize,
  authorizeChange,
  fail,
  invalid,
  latency,
  noContent,
  ok,
} from "./http-helpers";

const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** 409 with the bookings that would be stranded, so the UI can list them. */
const conflict = (message: string, lines: string[]) => fail(409, message, { conflicts: lines });

function courtDetail(c: Court): CourtDetail {
  return {
    ...c,
    hours: courtHours[c.id] ?? [],
    price_rules: priceRules
      .filter((r) => r.court_id === c.id)
      .sort(
        (a, b) => (a.day_of_week ?? -1) - (b.day_of_week ?? -1) || a.starts_at.localeCompare(b.starts_at),
      ),
  };
}

function validateCourt(input: CourtInput, clubId: string, exceptId?: string) {
  const errors: Record<string, string[]> = {};
  const others = courts.filter((c) => c.club_id === clubId && c.id !== exceptId);
  const name = input.name?.trim() ?? "";
  const code = input.court_code?.trim().toUpperCase() ?? "";
  if (!name) errors.name = ["Give the court a name players will recognise, like Court 4."];
  else if (others.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    errors.name = ["Another court at this venue already has that name."];
  }
  if (!/^[A-Z0-9-]{1,6}$/.test(code)) errors.court_code = ["Use up to 6 letters or numbers, like C4."];
  else if (others.some((c) => c.court_code === code))
    errors.court_code = ["Another court already uses this code."];
  if (!["indoor", "outdoor"].includes(input.indoor_outdoor))
    errors.indoor_outdoor = ["Choose indoor or outdoor."];
  if (!input.surface_type?.trim()) errors.surface_type = ["Choose the surface."];
  if (!MONEY_RE.test(String(input.base_price)) || Number(input.base_price) <= 0) {
    errors.base_price = ["Enter the hourly rate in pesos, like 300."];
  }
  if (!["active", "inactive", "maintenance"].includes(input.status)) errors.status = ["Choose a status."];
  return { errors, name, code };
}

function staffMember(m: (typeof memberships)[number], viewerId: string): StaffMember {
  const u = users.find((x) => x.id === m.user_id)!;
  return {
    membership_id: m.id,
    user: { id: u.id, name: u.name, email: u.email },
    role_key: m.role_key,
    status: m.status === "invited" ? "invited" : "active",
    invited_by: m.invited_by ? person(m.invited_by) : null,
    joined_at: m.joined_at,
    is_you: u.id === viewerId,
  };
}

const roleOrder: ClubRole[] = ["owner", "manager", "front_desk", "court_attendant", "scorer"];
const assignable: ClubRole[] = ["manager", "front_desk", "court_attendant", "scorer"];

export const setupHandlers = [
  // ── Club profile and settings ───────────────────────────
  http.get(`${API}/clubs/:club`, async ({ params }) => {
    await latency();
    const auth = authorize(String(params.club), "viewClub");
    if (auth.error) return auth.error;
    return ok(auth.club);
  }),

  http.patch(`${API}/clubs/:club`, async ({ params, request }) => {
    await latency();
    const auth = authorizeChange(String(params.club), "updateClub");
    if (auth.error) return auth.error;
    const body = (await request.json()) as ClubUpdateInput;
    const s = body.settings;
    const errors: Record<string, string[]> = {};
    if (!body.name?.trim()) errors.name = ["Enter the venue's name."];
    if (!body.address?.trim()) errors.address = ["Enter the street address players should go to."];
    if (body.contact_email && !EMAIL_RE.test(body.contact_email.trim()))
      errors.contact_email = ["Enter a valid email."];
    if (!body.contact_phone?.trim()) errors.contact_phone = ["Enter a phone number players can call."];
    if (![30, 60, 90].includes(s?.default_slot_minutes))
      errors["settings.default_slot_minutes"] = ["Choose 30, 60 or 90 minutes."];
    if (!(s?.booking_window_days >= 1 && s.booking_window_days <= 90)) {
      errors["settings.booking_window_days"] = ["Choose between 1 and 90 days."];
    }
    if (!s?.cancellation_policy?.trim())
      errors["settings.cancellation_policy"] = ["Players see this before booking. Add a short policy."];
    if (!(
      Number.isInteger(s?.open_play_cancellation_hours) &&
      s.open_play_cancellation_hours >= 0 &&
      s.open_play_cancellation_hours <= 72
    )) {
      errors["settings.open_play_cancellation_hours"] = ["Choose between 0 and 72 hours."];
    }
    if (!(
      Number.isInteger(s?.player_cancellation_hours) &&
      s.player_cancellation_hours >= 0 &&
      s.player_cancellation_hours <= 72
    )) {
      errors["settings.player_cancellation_hours"] = ["Choose between 0 and 72 hours."];
    }
    const bp = s?.booking_payments;
    if (!bp || (!bp.pay_at_court && !bp.gcash && !bp.maya))
      errors["settings.booking_payments"] = ["Choose at least one way players can pay for bookings."];
    else {
      if (bp.require_prepayment && !bp.gcash && !bp.maya)
        errors["settings.booking_payments"] = ["To require payment before play, turn on GCash or Maya."];
      for (const key of ["gcash", "maya"] as const) {
        const w = bp[key];
        if (!w) continue;
        if (!w.account_name?.trim())
          errors[`settings.booking_payments.${key}.account_name`] = [
            "Enter the account name players will see.",
          ];
        if (!/^09\d{9}$/.test(w.account_number?.replace(/\s/g, "") ?? ""))
          errors[`settings.booking_payments.${key}.account_number`] = [
            "Enter the 11-digit number, like 09171234567.",
          ];
        if (w.qr_url && !/^data:image\/(png|jpeg|webp);base64,/.test(w.qr_url))
          errors[`settings.booking_payments.${key}.qr_url`] = [
            "Upload the QR code as a PNG, JPG or WebP image.",
          ];
      }
    }
    if (!s?.payment_instructions?.trim())
      errors["settings.payment_instructions"] = ["Tell players how to pay when they arrive."];
    for (const key of ["logo_url", "cover_url"] as const) {
      const v = body[key];
      if (v && !/^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/.test(v))
        errors[key] = ["Upload a PNG, JPG or WebP image."];
      if (v && v.length > 1_500_000) errors[key] = ["That image is too big. Use one under 1 MB."];
    }
    if (Object.keys(errors).length) return invalid(errors);

    Object.assign(auth.club, {
      name: body.name.trim(),
      tagline: body.tagline?.trim() ?? "",
      description: body.description?.trim() ?? "",
      rules: body.rules?.trim() ?? "",
      logo_url: body.logo_url || null,
      cover_url: body.cover_url || null,
      contact_phone: body.contact_phone.trim(),
      contact_email: body.contact_email?.trim() ?? "",
      address: body.address.trim(),
      settings: {
        allow_online_booking: !!s.allow_online_booking,
        booking_payments: cleanPayments(s.booking_payments),
        allow_guest_booking: !!s.allow_guest_booking,
        allow_walk_ins: !!s.allow_walk_ins,
        allow_partial_payments: !!s.allow_partial_payments,
        default_slot_minutes: s.default_slot_minutes,
        booking_window_days: s.booking_window_days,
        allow_player_open_play: !!s.allow_player_open_play,
        // Approval only means something when players can create sessions.
        require_open_play_approval: !!s.allow_player_open_play && !!s.require_open_play_approval,
        cancellation_policy: s.cancellation_policy.trim(),
        member_join_policy: s.member_join_policy === "approval" ? "approval" : "open",
        open_play_cancellation_hours: s.open_play_cancellation_hours,
        player_cancellation_hours: s.player_cancellation_hours,
        payment_instructions: s.payment_instructions.trim(),
      },
    });
    return ok(auth.club);
  }),

  // ── Courts ──────────────────────────────────────────────
  http.get(`${API}/clubs/:club/courts`, async ({ params }) => {
    await latency();
    const auth = authorize(String(params.club), "viewClub");
    if (auth.error) return auth.error;
    return ok(courts.filter((c) => c.club_id === auth.club.id));
  }),

  http.post(`${API}/clubs/:club/courts`, async ({ params, request }) => {
    await latency();
    const auth = authorizeChange(String(params.club), "manageCourts");
    if (auth.error) return auth.error;
    const limit = planLimit(auth.club.id, "courts");
    if (limit && courtCount(auth.club.id) >= limit.limit) {
      return fail(
        403,
        `The ${limit.plan} plan allows ${limit.limit} courts and this venue has ${courtCount(auth.club.id)}. Change plan to add more.`,
      );
    }
    const body = (await request.json()) as CourtInput;
    const { errors, name, code } = validateCourt(body, auth.club.id);
    if (Object.keys(errors).length) return invalid(errors);
    const c: Court = {
      id: nextId("court"),
      club_id: auth.club.id,
      name,
      court_code: code,
      indoor_outdoor: body.indoor_outdoor,
      surface_type: body.surface_type.trim(),
      base_price: Number(body.base_price).toFixed(2),
      currency: "PHP",
      status: body.status,
    };
    courts.push(c);
    // New courts start with the hours of the club's first court, so they're bookable right away.
    const template = courts.find((x) => x.club_id === auth.club.id && x.id !== c.id);
    courtHours[c.id] =
      (template ? courtHours[template.id] : undefined)?.map((h) => ({ ...h })) ??
      ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((weekday) => ({
        weekday,
        is_closed: false,
        opens_at: "06:00",
        closes_at: "22:00",
      }));
    return ok(courtDetail(c), 201);
  }),

  http.get(`${API}/clubs/:club/courts/:court`, async ({ params }) => {
    await latency();
    const auth = authorize(String(params.club), "viewClub");
    if (auth.error) return auth.error;
    const c = courts.find((x) => x.id === params.court && x.club_id === auth.club.id);
    if (!c) return fail(404, "Court not found.");
    return ok(courtDetail(c));
  }),

  http.patch(`${API}/clubs/:club/courts/:court`, async ({ params, request }) => {
    await latency();
    const auth = authorizeChange(String(params.club), "manageCourts");
    if (auth.error) return auth.error;
    const c = courts.find((x) => x.id === params.court && x.club_id === auth.club.id);
    if (!c) return fail(404, "Court not found.");
    const body = (await request.json()) as CourtInput;
    const { errors, name, code } = validateCourt(body, auth.club.id, c.id);
    if (Object.keys(errors).length) return invalid(errors);
    if (body.status !== "active" && c.status === "active") {
      const stranded = upcomingBookingsOn(c.id, () => true);
      if (stranded.length) {
        return conflict(
          `${c.name} has ${stranded.length} upcoming ${stranded.length === 1 ? "booking" : "bookings"}. Move or cancel ${stranded.length === 1 ? "it" : "them"} before taking the court out of service.`,
          stranded.map(describeBooking),
        );
      }
    }
    Object.assign(c, {
      name,
      court_code: code,
      indoor_outdoor: body.indoor_outdoor,
      surface_type: body.surface_type.trim(),
      base_price: Number(body.base_price).toFixed(2),
      status: body.status,
    });
    return ok(courtDetail(c));
  }),

  http.put(`${API}/clubs/:club/courts/:court/hours`, async ({ params, request }) => {
    await latency();
    const auth = authorizeChange(String(params.club), "manageCourtSchedules");
    if (auth.error) return auth.error;
    const c = courts.find((x) => x.id === params.court && x.club_id === auth.club.id);
    if (!c) return fail(404, "Court not found.");
    const { hours } = (await request.json()) as { hours: OperatingHours[] };
    const errors: Record<string, string[]> = {};
    if (!Array.isArray(hours) || hours.length !== 7 || new Set(hours.map((h) => h.weekday)).size !== 7) {
      return invalid({ hours: ["Send one entry for each day of the week."] });
    }
    for (const h of hours) {
      if (h.is_closed) continue;
      const key = `hours.${h.weekday}`;
      if (!h.opens_at || !h.closes_at || !TIME_RE.test(h.opens_at) || !TIME_RE.test(h.closes_at)) {
        errors[key] = ["Choose opening and closing times on the hour or half hour."];
      } else if (h.closes_at <= h.opens_at) {
        errors[key] = [`${dayNames[h.weekday]} closes before it opens.`];
      }
    }
    if (Object.keys(errors).length) return invalid(errors);

    const next = hours
      .map((h) =>
        h.is_closed ? { weekday: h.weekday, is_closed: true, opens_at: null, closes_at: null } : { ...h },
      )
      .sort((a, b) => a.weekday - b.weekday);
    const stranded = upcomingBookingsOn(c.id, (b) => {
      const h = next.find((x) => x.weekday === weekdayOf(todayIn(TZ, new Date(b.starts_at))));
      if (!h || h.is_closed) return true;
      return (
        clockOf(b.starts_at) < h.opens_at! ||
        clockOf(b.ends_at) > h.closes_at! ||
        clockOf(b.ends_at) === "00:00"
      );
    });
    if (stranded.length) {
      return conflict(
        `${stranded.length} upcoming ${stranded.length === 1 ? "booking falls" : "bookings fall"} outside the new hours. Move or cancel ${stranded.length === 1 ? "it" : "them"} first.`,
        stranded.map(describeBooking),
      );
    }
    courtHours[c.id] = next;
    return ok(courtDetail(c));
  }),

  http.put(`${API}/clubs/:club/courts/:court/price-rules`, async ({ params, request }) => {
    await latency();
    const auth = authorizeChange(String(params.club), "manageCourts");
    if (auth.error) return auth.error;
    const c = courts.find((x) => x.id === params.court && x.club_id === auth.club.id);
    if (!c) return fail(404, "Court not found.");
    const { rules } = (await request.json()) as { rules: PriceRuleInput[] };
    const errors: Record<string, string[]> = {};
    rules.forEach((r, i) => {
      const key = `rules.${i}`;
      if (!TIME_RE.test(r.starts_at) || !TIME_RE.test(r.ends_at) || r.ends_at <= r.starts_at) {
        errors[key] = ["The end time must be after the start time."];
      } else if (!MONEY_RE.test(String(r.price)) || Number(r.price) <= 0) {
        errors[key] = ["Enter the hourly rate in pesos."];
      } else {
        // Same-scope rules can't overlap. A one-day rule may overlap an every-day rule; the one-day rule wins.
        const clash = rules.findIndex(
          (o, j) =>
            j < i && o.day_of_week === r.day_of_week && o.starts_at < r.ends_at && o.ends_at > r.starts_at,
        );
        if (clash >= 0) errors[key] = [`Overlaps rule ${clash + 1}. Rates for the same days can't overlap.`];
      }
    });
    if (Object.keys(errors).length) return invalid(errors);
    for (let i = priceRules.length - 1; i >= 0; i--)
      if (priceRules[i]!.court_id === c.id) priceRules.splice(i, 1);
    for (const r of rules) {
      priceRules.push({
        id: nextId("pr"),
        court_id: c.id,
        day_of_week: r.day_of_week,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        price: Number(r.price).toFixed(2),
        currency: "PHP",
      });
    }
    // Existing bookings keep the price they were made at; only new bookings use the new rates.
    return ok(courtDetail(c));
  }),

  // ── Closures ────────────────────────────────────────────
  http.get(`${API}/clubs/:club/court-exceptions`, async ({ params }) => {
    await latency();
    const auth = authorize(String(params.club), "viewClub");
    if (auth.error) return auth.error;
    const ids = courts.filter((c) => c.club_id === auth.club.id).map((c) => c.id);
    const now = new Date().toISOString();
    return ok(
      exceptions
        .filter((e) => ids.includes(e.court_id) && e.ends_at > now)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    );
  }),

  http.post(`${API}/clubs/:club/court-exceptions`, async ({ params, request }) => {
    await latency();
    const auth = authorizeChange(String(params.club), "manageCourtSchedules");
    if (auth.error) return auth.error;
    const body = (await request.json()) as ClosureInput;
    const c = courts.find((x) => x.id === body.court_id && x.club_id === auth.club.id);
    const errors: Record<string, string[]> = {};
    if (!c) errors.court_id = ["Choose a court."];
    const s = new Date(body.starts_at);
    const e = new Date(body.ends_at);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s)
      errors.ends_at = ["The closure must end after it starts."];
    else if (e.getTime() < Date.now()) errors.ends_at = ["That time has already passed."];
    if (!body.reason?.trim())
      errors.reason = ["Add a reason, like Typhoon or Holiday. Staff see it on the calendar."];
    if (Object.keys(errors).length) return invalid(errors);

    const startsAt = s.toISOString();
    const endsAt = e.toISOString();
    const stranded = upcomingBookingsOn(c!.id, (b) => b.starts_at < endsAt && b.ends_at > startsAt);
    if (stranded.length) {
      return conflict(
        `${stranded.length} ${stranded.length === 1 ? "booking is" : "bookings are"} scheduled during this closure. Move or cancel ${stranded.length === 1 ? "it" : "them"} first.`,
        stranded.map(describeBooking),
      );
    }
    const closure: ScheduleException = {
      id: nextId("ex"),
      court_id: c!.id,
      starts_at: startsAt,
      ends_at: endsAt,
      exception_type: "closure",
      reason: body.reason.trim(),
      created_by: person(auth.user.id),
      created_at: new Date().toISOString(),
    };
    exceptions.push(closure);
    return ok(closure, 201);
  }),

  http.delete(`${API}/clubs/:club/court-exceptions/:id`, async ({ params }) => {
    await latency();
    const auth = authorizeChange(String(params.club), "manageCourtSchedules");
    if (auth.error) return auth.error;
    const ids = courts.filter((c) => c.club_id === auth.club.id).map((c) => c.id);
    const i = exceptions.findIndex((x) => x.id === params.id && ids.includes(x.court_id));
    if (i < 0) return fail(404, "Closure not found.");
    exceptions.splice(i, 1);
    return noContent();
  }),

  // ── Staff ───────────────────────────────────────────────
  http.get(`${API}/clubs/:club/staff`, async ({ params }) => {
    await latency();
    const auth = authorize(String(params.club), "manageClubStaff");
    if (auth.error) return auth.error;
    return ok(
      memberships
        .filter((m) => m.club_id === auth.club.id && m.status !== "removed")
        .sort((a, b) => roleOrder.indexOf(a.role_key) - roleOrder.indexOf(b.role_key))
        .map((m) => staffMember(m, auth.user.id)),
    );
  }),

  http.post(`${API}/clubs/:club/staff`, async ({ params, request }) => {
    await latency();
    const auth = authorizeChange(String(params.club), "manageClubStaff");
    if (auth.error) return auth.error;
    const body = (await request.json()) as StaffInviteInput;
    const email = body.email?.trim().toLowerCase() ?? "";
    const errors: Record<string, string[]> = {};
    if (!EMAIL_RE.test(email)) errors.email = ["Enter the email they'll sign in with."];
    if (!assignable.includes(body.role_key)) errors.role_key = ["Choose a role."];
    const existing = users.find((u) => u.email === email);
    if (!existing && !body.name?.trim())
      errors.name = ["Enter their name. They don't have a CourtFlex account yet."];
    if (
      existing &&
      memberships.some(
        (m) => m.club_id === auth.club.id && m.user_id === existing.id && m.status !== "removed",
      )
    ) {
      errors.email = ["This person is already on this venue's staff."];
    }
    if (Object.keys(errors).length) return invalid(errors);
    const limit = planLimit(auth.club.id, "staff");
    if (limit && staffCount(auth.club.id) >= limit.limit) {
      return fail(
        403,
        `The ${limit.plan} plan allows ${limit.limit} staff accounts, including invites. Change plan or remove someone first.`,
      );
    }

    // One global identity per person (§4.1): invite the existing account, or create a placeholder.
    const user =
      existing ??
      (() => {
        const u = {
          id: nextId("u"),
          name: body.name.trim(),
          email,
          super_admin: false,
          has_player_profile: false,
          home_city: null,
          phone: null,
        };
        users.push(u);
        return u;
      })();
    const removed = memberships.find((m) => m.club_id === auth.club.id && m.user_id === user.id);
    const m = removed ?? {
      id: nextId("cm"),
      club_id: auth.club.id,
      user_id: user.id,
      role_key: body.role_key,
      status: "invited" as const,
      invited_by: auth.user.id,
      joined_at: null,
    };
    Object.assign(m, {
      role_key: body.role_key,
      status: "invited",
      invited_by: auth.user.id,
      joined_at: null,
    });
    if (!removed) memberships.push(m);
    return ok(staffMember(m, auth.user.id), 201);
  }),

  http.patch(`${API}/clubs/:club/staff/:membership`, async ({ params, request }) => {
    await latency();
    const auth = authorizeChange(String(params.club), "manageClubStaff");
    if (auth.error) return auth.error;
    const m = memberships.find(
      (x) => x.id === params.membership && x.club_id === auth.club.id && x.status !== "removed",
    );
    if (!m) return fail(404, "Staff member not found.");
    if (m.role_key === "owner") return fail(403, "The owner's role can't be changed.");
    if (m.user_id === auth.user.id) return fail(403, "You can't change your own role.");
    const { role_key } = (await request.json()) as { role_key: ClubRole };
    if (!assignable.includes(role_key)) return invalid({ role_key: ["Choose a role."] });
    m.role_key = role_key;
    return ok(staffMember(m, auth.user.id));
  }),

  http.delete(`${API}/clubs/:club/staff/:membership`, async ({ params }) => {
    await latency();
    const auth = authorizeChange(String(params.club), "manageClubStaff");
    if (auth.error) return auth.error;
    const m = memberships.find(
      (x) => x.id === params.membership && x.club_id === auth.club.id && x.status !== "removed",
    );
    if (!m) return fail(404, "Staff member not found.");
    if (m.role_key === "owner") return fail(403, "The owner can't be removed from their venue.");
    if (m.user_id === auth.user.id) return fail(403, "You can't remove yourself.");
    // Membership is kept as removed so their past bookings and payments still show who did them.
    m.status = "removed";
    return noContent();
  }),
];

function cleanPayments(bp: BookingPayments): BookingPayments {
  const wallet = (w: WalletAccount | null) =>
    w
      ? {
          account_name: w.account_name.trim(),
          account_number: w.account_number.replace(/\s/g, ""),
          qr_url: w.qr_url || null,
        }
      : null;
  return {
    pay_at_court: !!bp.pay_at_court,
    gcash: wallet(bp.gcash),
    maya: wallet(bp.maya),
    require_prepayment: !!bp.require_prepayment && (!!bp.gcash || !!bp.maya),
  };
}
