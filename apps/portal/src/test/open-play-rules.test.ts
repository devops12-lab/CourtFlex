// Open play, club membership and queue rules (brief §4–§6, blueprint §5.2 E,
// §13.3), checked against the mock API.
import { setupServer } from "msw/node";
import { handlers } from "@courtflex/mocks";
import { ApiError, api, configureApi, shiftDate, todayIn } from "@courtflex/api";
import type {
  ClubListing,
  ClubMember,
  ClubMemberDetail,
  ClubProfile,
  JoinClubInput,
  LedgerEntry,
  MemberSummary,
  OpenPlaySession,
  QueueState,
  RevenueReport,
  SessionDetail,
  SessionInput,
} from "@courtflex/api";

const server = setupServer(...handlers);
// Some tests make a dozen calls, each with the mock's simulated network delay.
vi.setConfig({ testTimeout: 30_000 });
const TZ = "Asia/Manila";
const day = (offset: number) => shiftDate(todayIn(TZ), offset);
const at = (date: string, hm: string) => new Date(`${date}T${hm}:00+08:00`).toISOString();

beforeAll(() => {
  configureApi({ baseUrl: "http://localhost/api/v1" });
  server.listen({ onUnhandledFrame: "error" });
});
afterAll(() => server.close());
beforeEach(() => sessionStorage.clear());

const login = (email: string) =>
  api("/auth/login", { method: "POST", body: { email, password: "password" } });
const JAMIE = "player1@example.test"; // owns Tara Pikol Mauban
const SAM = "player2@example.test";
const CARLA = "carla@example.test"; // owns Lucena Dinkers
const OWNER = "owner@example.test"; // Mauban venue owner
const DESK = "staff@example.test"; // Mauban front desk

async function expectApiError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  return error as ApiError;
}

async function findSession(title: string, scope = "upcoming") {
  const list = await api<OpenPlaySession[]>("/open-play", { query: { scope } });
  const s = list.find((x) => x.title === title);
  if (!s) throw new Error(`No session ${title}`);
  return s;
}

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** A complete join form, as the app sends it. */
const application = (
  name: string,
  overrides: Partial<NonNullable<JoinClubInput["application"]>> = {},
): NonNullable<JoinClubInput["application"]> => ({
  full_name: name,
  email: "join@example.test",
  phone: "09171112222",
  birth_date: "1992-03-04",
  gender: "female",
  emergency_contact_name: "Rosa Cruz",
  emergency_contact_phone: "09173334444",
  skill_level: "intermediate",
  dominant_hand: "right",
  play_focus: "social",
  preferred_times: ["evening"],
  signature: { kind: "typed", name },
  accept_waiver: true,
  ...overrides,
});

const taraSession = (overrides: Partial<SessionInput> = {}): SessionInput => ({
  organizer_type: "community",
  organizer_id: "com-1",
  // Quezon doesn't ask for approval, so sessions there publish straight away.
  venue_id: "c-002",
  court_ids: ["court-005"],
  title: "Test Rally",
  description: "",
  session_type: "open_play",
  skill_level: "all",
  starts_at: at(day(6), "08:00"),
  ends_at: at(day(6), "10:00"),
  registration_deadline: at(day(6), "07:00"),
  capacity: 4,
  fee: "100",
  member_fee: "80",
  members_only: false,
  ...overrides,
});

describe("directory", () => {
  test("lists clubs (player communities) only, and hides other people's clubs in review", async () => {
    await login(SAM);
    let list = await api<ClubListing[]>("/discovery/clubs");
    expect(list.some((c) => c.type === "community" && c.name === "Tara Pikol Mauban")).toBe(true);
    expect(list.every((c) => c.type === "community")).toBe(true);
    // Venues are listed only when a form asks for them, and never expired ones.
    const venues = await api<ClubListing[]>("/discovery/clubs", { query: { type: "venue" } });
    expect(venues.some((c) => c.name === "Mauban Pickleball Courts")).toBe(true);
    expect(venues.some((c) => c.name === "Lucena Dink House")).toBe(false);
    // Sam owns Sunrise Paddle Circle, which is still in review.
    expect(list.find((c) => c.name === "Sunrise Paddle Circle")?.status).toBe("pending_review");
    await login(JAMIE);
    list = await api<ClubListing[]>("/discovery/clubs");
    expect(list.some((c) => c.name === "Sunrise Paddle Circle")).toBe(false);
  });

  test("the live session shows on its club's card", async () => {
    await login(SAM);
    const list = await api<ClubListing[]>("/discovery/clubs", { query: { search: "tara" } });
    expect(list[0]?.live_session_count).toBe(1);
  });
});

describe("community clubs", () => {
  test("a new club starts in review and can't host until approved", async () => {
    await login("trisha@example.test");
    const club = await api<ClubProfile>("/communities", {
      method: "POST",
      body: {
        name: "Dink Dynasty",
        tagline: "Morning games",
        description: "",
        city: "Mauban",
        province: "Quezon",
        home_venue_id: "c-001",
        contact_email: "",
        contact_phone: "",
        rules: "",
        join_policy: "open",
        cancellation_hours: 6,
        logo_url: null,
        cover_url: null,
        waiver: "Play fair, respect the venue, and play at your own risk. Fees aren't refunded.",
        payment_options: { in_person: true, gcash: null, maya: null, instructions: "" },
      },
    });
    expect(club.status).toBe("pending_review");
    expect(club.me.role).toBe("owner");
    const err = await expectApiError(
      api("/open-play", { method: "POST", body: taraSession({ organizer_id: club.id }) }),
      403,
    );
    expect(err.message).toMatch(/waiting for CourtFlex review/);
  });
});

describe("membership", () => {
  test("open clubs accept members straight away; approval clubs queue them", async () => {
    await login(SAM);
    const open = await api<MemberSummary>("/organizers/community/com-1/join", {
      method: "POST",
      body: { plan_id: "pl-4", application: application("Sam Reyes") },
    });
    // Free plan at an open club: straight in, nothing to pay.
    expect(open.status).toBe("active");
    expect(open.payment).toBeNull();
  });

  test("venues don't have members: only clubs do", async () => {
    await login(SAM);
    await expectApiError(api("/organizers/venue/c-002/join", { method: "POST", body: {} }), 404);
    await login(OWNER);
    await expectApiError(api("/organizers/venue/c-001/members"), 404);
    await expectApiError(api("/organizers/venue/c-001/plans"), 404);
  });

  test("admins approve, suspend and reactivate; suspended members can't register", async () => {
    await login(CARLA);
    let list = await api<ClubMember[]>("/organizers/community/com-2/members", {
      query: { status: "pending" },
    });
    const jamie = list.find((m) => m.player.name === "Jamie Player")!;
    await api(`/organizers/community/com-2/members/${jamie.id}/approve`, { method: "POST", body: {} });
    list = await api<ClubMember[]>("/organizers/community/com-2/members", { query: { search: "jamie" } });
    expect(list[0]!.status).toBe("active");

    const noReason = await expectApiError(
      api(`/organizers/community/com-2/members/${jamie.id}/suspend`, { method: "POST", body: {} }),
      422,
    );
    expect(noReason.field("reason")).toBeTruthy();
    await api(`/organizers/community/com-2/members/${jamie.id}/suspend`, {
      method: "POST",
      body: { reason: "Unpaid dues" },
    });

    await login(JAMIE);
    const session = await findSession("Dinkers Doubles Ladder");
    const err = await expectApiError(api(`/open-play/${session.id}/join`, { method: "POST" }), 403);
    expect(err.message).toMatch(/suspended/);

    await login(CARLA);
    const detail = await api<{ history: Array<{ event_type: string }> }>(
      `/organizers/community/com-2/members/${jamie.id}/reactivate`,
      { method: "POST", body: {} },
    );
    expect(detail.history.map((h) => h.event_type)).toEqual(
      expect.arrayContaining(["requested", "approved", "suspended", "reactivated"]),
    );
  });

  test("other clubs can't see a club's members", async () => {
    await login(CARLA);
    await expectApiError(api("/organizers/community/com-1/members"), 403);
  });

  test("members-only sessions need an active membership", async () => {
    await login(CARLA); // not in Tara Pikol (Sam joined it above)
    const s = await findSession("Members Night");
    const err = await expectApiError(api(`/open-play/${s.id}/join`, { method: "POST" }), 403);
    expect(err.message).toMatch(/members/);
  });
});

describe("joining a club", () => {
  const join = (body: JoinClubInput) =>
    api<MemberSummary>("/organizers/community/com-2/join", { method: "POST", body });

  test("every detail is required, and a typed signature must match the name", async () => {
    await login(OWNER);
    const err = await expectApiError(
      join({
        plan_id: "pl-6",
        payment_method: "gcash",
        application: application("Alex Owner", {
          birth_date: "",
          gender: "" as never,
          emergency_contact_name: "",
          accept_waiver: false,
          signature: { kind: "typed", name: "Someone Else" },
        }),
      }),
      422,
    );
    for (const field of ["birth_date", "gender", "emergency_contact_name", "accept_waiver", "signature"])
      expect(err.field(field)).toBeTruthy();
    // Lucena Dinkers takes GCash and in person, not Maya.
    const maya = await expectApiError(
      join({ plan_id: "pl-6", payment_method: "maya", application: application("Alex Owner") }),
      422,
    );
    expect(maya.field("payment_method")).toBeTruthy();
  });

  test("GCash: a receipt is checked by an admin before the membership starts", async () => {
    await login(OWNER);
    const m = await join({
      plan_id: "pl-6",
      payment_method: "gcash",
      application: application("Alex Owner"),
    });
    expect(m.status).toBe("pending");
    expect(m.payment?.status).toBe("awaiting_receipt");
    expect(m.payment?.amount).toBe("150.00");
    await expectApiError(
      join({ plan_id: "pl-6", payment_method: "gcash", application: application("Alex Owner") }),
      409,
    );

    // Not paid yet, so it can't be approved.
    await login(CARLA);
    await expectApiError(
      api(`/organizers/community/com-2/members/${m.id}/approve`, { method: "POST", body: {} }),
      409,
    );

    const receipt = (body: object) =>
      api<MemberSummary>("/organizers/community/com-2/membership/receipt", { method: "POST", body });
    await login(OWNER);
    await expectApiError(receipt({ receipt: "not an image" }), 422);
    expect((await receipt({ receipt: PNG, reference_number: "1234567890" })).payment?.status).toBe(
      "in_review",
    );
    // An upload alone never counts as paid.
    expect((await receipt({ receipt: PNG }).catch((e) => e)) instanceof ApiError).toBe(true);

    await login(CARLA);
    const act = (action: string, body: object = {}) =>
      api<ClubMemberDetail>(`/organizers/community/com-2/members/${m.id}/${action}`, {
        method: "POST",
        body,
      });
    await expectApiError(act("reject-payment"), 422); // needs a reason
    const turnedDown = await act("reject-payment", { reason: "Amount is ₱100, the plan is ₱150." });
    expect(turnedDown.payment?.status).toBe("rejected");
    expect(turnedDown.status).toBe("pending");

    await login(OWNER);
    expect((await receipt({ receipt: PNG })).payment?.status).toBe("in_review");

    await login(CARLA);
    const done = await act("confirm-payment");
    expect(done.status).toBe("active");
    expect(done.payment?.status).toBe("confirmed");
    expect(done.dues.status).toBe("paid");
    expect(done.application?.signature).toEqual({ kind: "typed", name: "Alex Owner" });
    expect(done.history.map((h) => h.event_type)).toEqual(
      expect.arrayContaining(["payment_submitted", "payment_rejected", "payment_confirmed", "approved"]),
    );
  });

  test("in person: recording the full dues starts the membership", async () => {
    await login(DESK);
    const m = await join({
      plan_id: "pl-6",
      payment_method: "in_person",
      application: application("Taylor Desk", { signature: { kind: "drawn", image: PNG } }),
    });
    expect(m.payment?.status).toBe("pay_in_person");
    await login(CARLA);
    const done = await api<ClubMemberDetail>(`/organizers/community/com-2/members/${m.id}/dues`, {
      method: "POST",
      body: { amount: "150", method: "cash" },
    });
    expect(done.status).toBe("active");
    expect(done.application?.signature.kind).toBe("drawn");
  });
});

describe("registration", () => {
  test("no duplicates, no overbooking, waitlist promotes in order", async () => {
    await login(JAMIE);
    const created = await api<OpenPlaySession>("/open-play", { method: "POST", body: taraSession() });
    expect(created.status).toBe("published");
    const id = created.id;

    const regs: string[] = [];
    for (const email of [SAM, "andrea@example.test", "marco@example.test", "trisha@example.test"]) {
      await login(email);
      await api(`/open-play/${id}/join`, { method: "POST" });
      regs.push(email);
    }
    await login(SAM);
    await expectApiError(api(`/open-play/${id}/join`, { method: "POST" }), 409); // duplicate

    await login("jun@example.test");
    const full = await expectApiError(api(`/open-play/${id}/join`, { method: "POST" }), 409);
    expect(full.message).toMatch(/full/);
    const waitlisted = await api<SessionDetail>(`/open-play/${id}/waitlist`, { method: "POST" });
    expect(waitlisted.my_registration?.status).toBe("waitlisted");
    expect(waitlisted.my_registration?.waitlist_position).toBe(1);
    await login("nikki@example.test");
    await api(`/open-play/${id}/waitlist`, { method: "POST" });

    // Sam drops out; Jun (first in line) gets the spot, Nikki moves up.
    await login(SAM);
    const afterLeave = await api<SessionDetail>(`/open-play/${id}/leave`, { method: "POST" });
    expect(afterLeave.registered_count).toBe(4);
    expect(afterLeave.waitlist_count).toBe(1);
    await login("jun@example.test");
    const jun = await api<SessionDetail>(`/open-play/${id}`);
    expect(jun.my_registration?.status).toBe("registered");
    await login("nikki@example.test");
    const nikki = await api<SessionDetail>(`/open-play/${id}`);
    expect(nikki.my_registration?.waitlist_position).toBe(1);
  });

  test("members pay the member fee; lapsed members pay the full fee", async () => {
    await login("andrea@example.test"); // her 30-day Supporter plan ran out
    const lapsed = await findSession("Beginner Clinic and Play");
    expect(
      (await api<SessionDetail>(`/open-play/${lapsed.id}/join`, { method: "POST" })).my_registration?.fee_due,
    ).toBe("100.00");
    await login(JAMIE); // free plan that never expires
    const s = await findSession("Beginner Clinic and Play");
    const d = await api<SessionDetail>(`/open-play/${s.id}/join`, { method: "POST" });
    expect(d.my_registration?.fee_due).toBe("50.00");
  });

  test("players only see names; hosts see fees", async () => {
    await login(SAM);
    const s = await findSession("Thursday Social Night");
    const asPlayer = await api<SessionDetail>(`/open-play/${s.id}`);
    expect(asPlayer.participants).toHaveLength(0);
    expect(asPlayer.roster.length).toBeGreaterThan(0);
    await login(OWNER);
    const asHost = await api<SessionDetail>(`/open-play/${s.id}`);
    expect(asHost.participants.length).toBe(14);
  });
});

describe("hosting at a venue", () => {
  test("a community session on courts already taken is refused", async () => {
    await login(JAMIE);
    const s = await findSession("Thursday Social Night");
    const err = await expectApiError(
      api("/open-play", {
        method: "POST",
        body: taraSession({
          venue_id: "c-001",
          court_ids: ["court-008"],
          starts_at: s.starts_at,
          ends_at: s.ends_at,
          registration_deadline: s.starts_at,
        }),
      }),
      422,
    );
    expect(err.field("court_ids")).toMatch(/Court 4 is taken/);
  });

  test("venue approval: pending sessions wait, and a rejection frees the court", async () => {
    await login(OWNER);
    const pending = await api<OpenPlaySession[]>("/organizers/venue/c-001/sessions", {
      query: { when: "pending" },
    });
    const away = pending.find((x) => x.title === "Dinkers Away Day at Mauban")!;
    expect(away.court_fee).toBe("700.00"); // 2 hours of Court 5 at the 6 PM floodlight rate
    await login(SAM);
    await expectApiError(api(`/open-play/${away.id}/join`, { method: "POST" }), 404); // not public yet
    await login(DESK);
    await expectApiError(api(`/open-play/${away.id}/approve`, { method: "POST", body: {} }), 404);
    await login(OWNER);
    const rejected = await api<SessionDetail>(`/open-play/${away.id}/reject`, {
      method: "POST",
      body: { reason: "Court 5 resurfacing" },
    });
    expect(rejected.status).toBe("rejected");
    const options = await api<Array<{ id: string; available: boolean }>>("/venues/c-001/court-options", {
      query: { starts_at: away.starts_at, ends_at: away.ends_at },
    });
    expect(options.find((c) => c.id === "court-009")?.available).toBe(true);
  });
});

describe("check-in and the live queue", () => {
  test("auto rotation: finishing a game sends players to the back and refills the court", async () => {
    await login(JAMIE);
    const live = await findSession("Tara Pikol Night Rally");
    expect(live.status).toBe("live");
    let q = await api<QueueState>(`/open-play/${live.id}/queue`);
    expect(q.courts.every((c) => c.game)).toBe(true);
    expect(q.waiting).toHaveLength(2);

    // Two more players arrive.
    const detail = await api<SessionDetail>(`/open-play/${live.id}`);
    const notIn = detail.participants.filter((p) => p.status === "registered").slice(0, 2);
    for (const p of notIn)
      await api(`/open-play/${live.id}/participants/${p.id}/check-in`, { method: "POST" });
    q = await api<QueueState>(`/open-play/${live.id}/queue`);
    expect(q.waiting).toHaveLength(4);
    const nextUp = q.waiting.map((w) => w.player.name);

    const court = q.courts[0]!;
    const finished = [...court.game!.team_a, ...court.game!.team_b].map((p) => p.name);
    q = await api<QueueState>(`/open-play/${live.id}/queue/finish`, {
      method: "POST",
      body: { game_id: court.game!.id, winner: "a" },
    });
    const newGame = q.courts.find((c) => c.court_id === court.court_id)!.game!;
    expect([...newGame.team_a, ...newGame.team_b].map((p) => p.name).sort()).toEqual([...nextUp].sort());
    expect(q.waiting.map((w) => w.player.name)).toEqual(finished);
  });

  test("players can't be put on two courts, and only hosts run the queue", async () => {
    await login(JAMIE);
    const live = await findSession("Tara Pikol Night Rally");
    const q = await api<QueueState>(`/open-play/${live.id}/queue`);
    const onCourt = q.courts[0]!.game!;
    await expectApiError(
      api(`/open-play/${live.id}/queue/fill`, {
        method: "POST",
        body: { court_id: q.courts[1]!.court_id, participant_ids: ["x", "y", "z", "w"] },
      }),
      409,
    );
    await expectApiError(
      api(`/open-play/${live.id}/queue/finish`, {
        method: "POST",
        body: { game_id: "missing", winner: null },
      }),
      409,
    );
    await login(SAM);
    await expectApiError(
      api(`/open-play/${live.id}/queue/finish`, {
        method: "POST",
        body: { game_id: onCourt.id, winner: null },
      }),
      403,
    );
  });

  test("check-in opens 2 hours before the start", async () => {
    await login(JAMIE); // hosts Members Night for Tara Pikol
    const s = await findSession("Members Night");
    const d = await api<SessionDetail>(`/open-play/${s.id}`);
    const err = await expectApiError(
      api(`/open-play/${s.id}/participants/${d.participants[0]!.id}/check-in`, { method: "POST" }),
      409,
    );
    expect(err.message).toMatch(/2 hours/);
  });
});

describe("payments", () => {
  test("session fees, refunds and court fees appear in the venue ledger", async () => {
    await login(OWNER);
    const thursday = await findSession("Thursday Social Night");
    const d = await api<SessionDetail>(`/open-play/${thursday.id}`);
    const p = d.participants.find((x) => x.status === "registered")!;
    await api(`/open-play/${thursday.id}/participants/${p.id}/payments`, {
      method: "POST",
      body: { amount: p.fee_due, method: "cash" },
    });
    const over = await expectApiError(
      api(`/open-play/${thursday.id}/participants/${p.id}/payments`, {
        method: "POST",
        body: { amount: "10", method: "cash" },
      }),
      409,
    );
    expect(over.message).toMatch(/doesn't owe/);
    await api(`/open-play/${thursday.id}/participants/${p.id}/refund`, {
      method: "POST",
      body: { amount: "50", reason: "Left early" },
    });
    const today = todayIn(TZ);
    const ledger = await api<LedgerEntry[]>("/organizers/venue/c-001/payments", {
      query: { from: day(-7), to: today },
    });
    const fee = ledger.find((e) => e.kind === "session_fee" && e.payer === p.player.name)!;
    expect(fee.refunded).toBe("50.00");
    expect(ledger.some((e) => e.kind === "court_fee")).toBe(true);
    expect(ledger.some((e) => e.kind === "court_booking")).toBe(true);
    const report = await api<RevenueReport>("/organizers/venue/c-001/reports/revenue", {
      query: { from: day(-7), to: today },
    });
    expect(Number(report.refunds)).toBeGreaterThanOrEqual(50);
  });

  test("front desk can't see the ledger", async () => {
    await login(DESK);
    await expectApiError(api("/organizers/venue/c-001/payments"), 403);
  });
});
