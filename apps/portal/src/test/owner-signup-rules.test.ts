// R6: a court owner lists their venue. The venue, an account confirmed by an
// email code, and the first courts; then it waits for CourtFlex approval, and
// the 14-day trial starts when approved. Checked against the mock API.
import { setupServer } from "msw/node";
import { handlers } from "@courtflex/mocks";
import { ApiError, api, configureApi } from "@courtflex/api";
import type {
  ClubSubscription,
  GeoOption,
  GuestCodeSent,
  Me,
  OwnerSignupInput,
  OwnerSignupResult,
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

const CODE = "246810"; // the mock always sends this code

async function expectApiError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  return error as ApiError;
}

let barangay = "";
async function maubanBarangay() {
  if (barangay) return barangay;
  const regions = await api<GeoOption[]>("/geo/regions");
  const r = regions.find((x) => x.name.startsWith("CALABARZON"))!;
  const p = (await api<GeoOption[]>("/geo/provinces", { query: { parent_id: r.id } })).find(
    (x) => x.name === "Quezon",
  )!;
  const c = (await api<GeoOption[]>("/geo/cities", { query: { parent_id: p.id } })).find(
    (x) => x.name === "Mauban",
  )!;
  barangay = (await api<GeoOption[]>("/geo/barangays", { query: { parent_id: c.id } }))[0]!.id;
  return barangay;
}

async function venue(name: string): Promise<OwnerSignupInput["venue"]> {
  return {
    name,
    latitude: 14.19,
    longitude: 121.73,
    barangay_id: await maubanBarangay(),
    address: "Rizal St., beside the market",
    court_count: 3,
    contact_phone: "09171112222",
    contact_email: "",
  };
}
const courts: OwnerSignupInput["courts"] = {
  indoor_outdoor: "outdoor",
  opens_at: "06:00",
  closes_at: "22:00",
  hourly_rate: "350",
};

const sendCode = (email: string) =>
  api<GuestCodeSent>("/owner-signup/code", { method: "POST", body: { name: "Rosa Dela Cruz", email } });

async function confirmedOwner(email: string) {
  const sent = await sendCode(email);
  await api("/owner-signup/verify", {
    method: "POST",
    body: { verification_id: sent.verification_id, code: CODE },
  });
  return {
    name: "Rosa Dela Cruz",
    email,
    password: "courtflex1",
    password_confirmation: "courtflex1",
    verification_id: sent.verification_id,
  };
}

const signup = (body: unknown) => api<OwnerSignupResult>("/owner-signup", { method: "POST", body });

describe("owner sign-up", () => {
  it("creates the account, the venue waiting for approval, its courts and the owner role", async () => {
    const owner = await confirmedOwner("rosa@daungan.test");
    const r = await signup({ venue: await venue("Daungan Pickleball"), courts, owner });
    expect(r).toMatchObject({
      club_name: "Daungan Pickleball",
      club_slug: "daungan-pickleball",
      status: "pending_review",
    });

    // Signed in as the new owner, who can run the venue.
    const me = await api<Me>("/me");
    expect(me.email).toBe("rosa@daungan.test");
    expect(me.memberships).toEqual([
      expect.objectContaining({ club_slug: "daungan-pickleball", role_key: "owner" }),
    ]);

    // Three courts with the chosen rate.
    const list = await api<{ name: string; base_price: string; indoor_outdoor: string }[]>(
      `/clubs/${r.club_id}/courts`,
    );
    expect(list.map((c) => c.name)).toEqual(["Court 1", "Court 2", "Court 3"]);
    expect(list.every((c) => Number(c.base_price) === 350 && c.indoor_outdoor === "outdoor")).toBe(true);

    // The trial waits for approval.
    const sub = await api<ClubSubscription>(`/clubs/${r.club_id}/subscription`);
    expect(sub).toMatchObject({ status: "trialing", trial_starts_at: null });
  });

  it("keeps a new venue out of court search until CourtFlex approves it, then starts the 14-day trial", async () => {
    const owner = await confirmedOwner("ben@lamon.test");
    const r = await signup({ venue: await venue("Lamon Bay Courts"), courts, owner });
    const search = () => api<VenueResult[]>("/discovery/courts", { query: { q: "Lamon Bay" } });
    expect(await search()).toEqual([]);

    await api("/__mock/approve-communities", { method: "POST" });
    expect((await search()).map((v) => v.name)).toEqual(["Lamon Bay Courts"]);
    const sub = await api<ClubSubscription>(`/clubs/${r.club_id}/subscription`);
    expect(sub.trial_starts_at).not.toBeNull();
    expect(sub.trial_days_left).toBe(14);
  });

  it("needs the email confirmed with the code", async () => {
    const sent = await sendCode("nocode@x.test");
    const e = await expectApiError(
      signup({
        venue: await venue("Unconfirmed Courts"),
        courts,
        owner: {
          name: "No Code",
          email: "nocode@x.test",
          password: "courtflex1",
          password_confirmation: "courtflex1",
          verification_id: sent.verification_id,
        },
      }),
      422,
    );
    expect(e.field("owner.code")).toMatch(/Confirm your email/);
    // Wrong codes count down, then lock.
    for (let i = 4; i >= 0; i--) {
      const w = await expectApiError(
        api("/owner-signup/verify", {
          method: "POST",
          body: { verification_id: sent.verification_id, code: "000000" },
        }),
        422,
      );
      expect(w.field("code")).toMatch(`${i} tries left`);
    }
    const locked = await expectApiError(
      api("/owner-signup/verify", {
        method: "POST",
        body: { verification_id: sent.verification_id, code: CODE },
      }),
      422,
    );
    expect(locked.field("code")).toMatch(/Too many/);
  });

  it("won't use an email that already has an account, and limits code requests", async () => {
    const e = await expectApiError(sendCode("owner@example.test"), 422);
    expect(e.field("email")).toMatch(/Sign in first/);
    await sendCode("twice@x.test");
    await expectApiError(sendCode("twice@x.test"), 429);
  });

  it("checks the venue and the courts", async () => {
    const owner = await confirmedOwner("checks@x.test");
    const e = await expectApiError(
      signup({
        venue: {
          ...(await venue("Mauban Pickleball Courts")), // already on CourtFlex
          latitude: 40,
          longitude: -74, // not the Philippines
          court_count: 11,
          contact_phone: "12345",
          address: " ",
        },
        courts: { indoor_outdoor: "outdoor", opens_at: "22:00", closes_at: "06:00", hourly_rate: "10" },
        owner,
      }),
      422,
    );
    expect(e.field("venue.name")).toMatch(/already on CourtFlex/);
    expect(e.field("venue.pin")).toBeTruthy();
    expect(e.field("venue.court_count")).toBeTruthy();
    expect(e.field("venue.contact_phone")).toBeTruthy();
    expect(e.field("venue.address")).toBeTruthy();
    expect(e.field("courts.closes_at")).toMatch(/Close after you open/);
    expect(e.field("courts.hourly_rate")).toBeTruthy();
    // Nothing was created, and the code can still be used.
    const ok = await signup({ venue: await venue("Checked Courts"), courts, owner });
    expect(ok.status).toBe("pending_review");
  });

  it("adds the venue to the signed-in account, with no new account", async () => {
    await api<Me>("/auth/login", {
      method: "POST",
      body: { email: "owner@example.test", password: "password" },
    });
    const before = (await api<Me>("/me")).memberships.length;
    const r = await signup({ venue: await venue("Alex Second Venue"), courts });
    const me = await api<Me>("/me");
    expect(me.email).toBe("owner@example.test");
    expect(me.memberships).toHaveLength(before + 1);
    expect(me.memberships).toContainEqual(expect.objectContaining({ club_id: r.club_id, role_key: "owner" }));
  });
});
