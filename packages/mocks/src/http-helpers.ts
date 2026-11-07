import { delay, HttpResponse } from "msw";
import type { Me, Permission } from "@courtflex/api";
import { activeMembership, clubs, memberships, rolePermissions, users, viaSuperAdmin } from "./db";
import { audit, supportLine, suspendedUsers } from "./admin-db";
import { needsOnboarding, unverified } from "./player-db";

export const API = "*/api/v1";
export const SESSION_KEY = "courtflex-mock-session";

export const ok = <T>(data: T, status = 200) => HttpResponse.json({ data }, { status });

export const noContent = () => new HttpResponse(null, { status: 204 });

export const fail = (status: number, message: string, errors?: Record<string, string[]>) =>
  HttpResponse.json({ message, errors }, { status });

export const invalid = (errors: Record<string, string[]>) => fail(422, "The given data was invalid.", errors);

export const latency = () => delay(250 + Math.random() * 350);

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):(00|30)$/;

export function sessionUser() {
  const id = sessionStorage.getItem(SESSION_KEY);
  // A suspended account's session ends: it acts as signed out.
  if (id && suspendedUsers[id]) return undefined;
  return users.find((u) => u.id === id);
}

/** Venue owners' and admins' accounts without a player profile don't go through player onboarding. */
function isStaffOnly(userId: string, hasPlayerProfile: boolean) {
  const user = users.find((u) => u.id === userId)!;
  return (
    !hasPlayerProfile &&
    !unverified.has(userId) &&
    (user.super_admin || memberships.some((m) => m.user_id === userId))
  );
}

export function meFor(userId: string): Me {
  const u = users.find((x) => x.id === userId)!;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    global_roles: u.super_admin ? ["super_admin"] : [],
    has_player_profile: u.has_player_profile,
    email_verified: !unverified.has(u.id),
    needs_onboarding: isStaffOnly(u.id, u.has_player_profile) ? false : needsOnboarding(u.id),
    memberships: memberships
      .filter((m) => m.user_id === u.id && m.status === "active")
      .map((m) => {
        const club = clubs.find((c) => c.id === m.club_id)!;
        return {
          club_id: club.id,
          club_slug: club.slug,
          club_name: club.name,
          role_key: m.role_key,
          permissions: rolePermissions[m.role_key],
        };
      }),
  };
}

/**
 * Tenant guard: the club comes from the URL, but access comes from the
 * signed-in user's membership. Never trust the club id alone (§4.2).
 */
export function authorize(clubId: string, permission: Permission) {
  const user = sessionUser();
  if (!user) return { error: fail(401, "Your session has ended. Sign in again.") } as const;
  const club = clubs.find((c) => c.id === clubId);
  const membership = activeMembership(clubId, user.id);
  if (!club || !membership) return { error: fail(404, "Venue not found.") } as const;
  if (!rolePermissions[membership.role_key].includes(permission)) {
    return { error: fail(403, "Your role at this venue doesn't allow this action.") } as const;
  }
  return { user, club, membership, error: null } as const;
}

/** Plain words for the audit log when the Super Admin changes a venue. */
const changeWords: Partial<Record<Permission, string>> = {
  updateClub: "venue details or settings",
  manageCourts: "courts",
  manageCourtSchedules: "court hours, rates or closures",
  createWalkInBooking: "a walk-in booking",
  recordOnsitePayment: "a payment or receipt",
  adjustOnsitePayment: "a refund or correction",
  cancelBooking: "a booking",
  manageClubStaff: "venue staff",
};

/**
 * Like authorize, but also refuses changes while the club is read-only (§13.6),
 * suspended or declined. The Super Admin can still change it; that's audited.
 */
export function authorizeChange(clubId: string, permission: Permission) {
  const auth = authorize(clubId, permission);
  if (auth.error) return auth;
  if (viaSuperAdmin(clubId, auth.user.id)) {
    audit(
      auth.user.id,
      "venue.changed_by_super_admin",
      `Changed ${changeWords[permission] ?? "settings"} at ${auth.club.name}`,
      { type: "venue", id: auth.club.id, name: auth.club.name },
    );
    return auth;
  }
  if (auth.club.status === "suspended" || auth.club.status === "rejected") {
    return {
      error: fail(
        403,
        auth.club.status === "suspended"
          ? `This venue is suspended by CourtFlex, so it can't be changed. ${supportLine()}`
          : `CourtFlex declined this venue, so it can't be changed. ${supportLine()}`,
      ),
    } as const;
  }
  if (auth.club.read_only) {
    return {
      error: fail(
        403,
        "This venue is read-only because its subscription has ended. Renew the plan to make changes.",
      ),
    } as const;
  }
  return auth;
}
