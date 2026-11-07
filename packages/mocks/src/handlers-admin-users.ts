// Super Admin: every user account (A3, blueprint §9.2 /admin/users).
import { http } from "msw";
import type { AdminUserDetail, AdminUserRow, UserRole, UserStatus } from "@courtflex/api";
import { bookings, clubs, memberships, users } from "./db";
import { communities, members, skillOf } from "./open-play-db";
import { profiles, resetTokens, unverified } from "./player-db";
import { geoChain } from "./geo";
import { audit, auditLogs, suspendedUsers } from "./admin-db";
import { authorizeAdmin } from "./handlers-admin";
import { API, fail, invalid, latency, ok } from "./http-helpers";

function rolesOf(userId: string): UserRole[] {
  const u = users.find((x) => x.id === userId)!;
  const roles: UserRole[] = [];
  if (u.super_admin) roles.push("super_admin");
  if (memberships.some((m) => m.user_id === userId && m.status === "active")) roles.push("venue_staff");
  if (
    members.some(
      (m) =>
        m.organizer_type === "community" &&
        m.player_id === userId &&
        m.status === "active" &&
        (m.role === "owner" || m.role === "admin"),
    )
  )
    roles.push("club_admin");
  if (u.has_player_profile) roles.push("player");
  return roles;
}

const statusOf = (userId: string): UserStatus =>
  suspendedUsers[userId] ? "suspended" : unverified.has(userId) ? "unverified" : "active";

function userRow(userId: string): AdminUserRow {
  const u = users.find((x) => x.id === userId)!;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    roles: rolesOf(u.id),
    status: statusOf(u.id),
    venue_roles: memberships
      .filter((m) => m.user_id === u.id && m.status === "active")
      .map((m) => ({
        club_id: m.club_id,
        club_name: clubs.find((c) => c.id === m.club_id)?.name ?? "Unknown venue",
        role_key: m.role_key,
      })),
  };
}

function userDetail(userId: string): AdminUserDetail {
  const u = users.find((x) => x.id === userId)!;
  const p = profiles[userId];
  const chain = p?.barangay_id ? geoChain(p.barangay_id) : null;
  const mine = bookings.filter((b) => b.player?.id === userId);
  const now = new Date().toISOString();
  const s = suspendedUsers[userId];
  const by = s && users.find((x) => x.id === s.by);
  return {
    ...userRow(userId),
    home_city: u.home_city,
    player: u.has_player_profile
      ? { skill: skillOf(userId), location: chain ? `${chain.barangay.name}, ${chain.city.name}` : null }
      : null,
    clubs: members
      .filter((m) => m.organizer_type === "community" && m.player_id === userId)
      .map((m) => ({
        id: m.organizer_id,
        name: communities.find((c) => c.id === m.organizer_id)?.name ?? "Unknown club",
        role: m.role,
        status: m.status,
      })),
    bookings: {
      upcoming: mine.filter((b) => b.starts_at >= now && b.status !== "cancelled" && b.status !== "expired")
        .length,
      total: mine.length,
    },
    suspension: s ? { at: s.at, by: { id: s.by, name: by?.name ?? "Super Admin" }, reason: s.reason } : null,
    history: auditLogs.filter((a) => a.target.type === "user" && a.target.id === userId).reverse(),
  };
}

export const adminUserHandlers = [
  http.get(`${API}/admin/users`, async ({ request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const role = url.searchParams.get("role") as UserRole | null;
    const status = url.searchParams.get("status") as UserStatus | null;
    const digits = q.replace(/\D/g, "");
    const rows = users
      .map((u) => userRow(u.id))
      .filter((r) => !role || r.roles.includes(role))
      .filter((r) => !status || r.status === status)
      .filter(
        (r) =>
          !q ||
          r.name.toLowerCase().includes(q) ||
          r.email.includes(q) ||
          (digits.length >= 4 && (r.phone ?? "").replace(/\D/g, "").includes(digits)),
      )
      .sort(
        (a, b) =>
          Number(b.status === "suspended") - Number(a.status === "suspended") || a.name.localeCompare(b.name),
      );
    return ok(rows);
  }),

  http.get(`${API}/admin/users/:id`, async ({ params }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    if (!users.some((u) => u.id === params.id)) return fail(404, "This account doesn't exist.");
    return ok(userDetail(String(params.id)));
  }),

  http.patch(`${API}/admin/users/:id/status`, async ({ params, request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const u = users.find((x) => x.id === params.id);
    if (!u) return fail(404, "This account doesn't exist.");
    const body = (await request.json()) as { status?: string; reason?: string };
    const reason = body.reason?.trim() ?? "";
    if (body.status === "suspended") {
      if (u.id === auth.user.id) return fail(409, "You can't suspend your own account.");
      if (u.super_admin) return fail(409, "Super Admin accounts can't be suspended.");
      if (suspendedUsers[u.id]) return fail(409, "This account is already suspended.");
      if (reason.length < 10)
        return invalid({
          reason: ["Say why in a sentence (at least 10 characters). They see it when they try to sign in."],
        });
      suspendedUsers[u.id] = { at: new Date().toISOString(), reason, by: auth.user.id };
      audit(
        auth.user.id,
        "user.suspended",
        `Suspended ${u.name}'s account`,
        { type: "user", id: u.id, name: u.name },
        reason,
      );
    } else if (body.status === "active") {
      if (!suspendedUsers[u.id]) return fail(409, "This account isn't suspended.");
      delete suspendedUsers[u.id];
      audit(
        auth.user.id,
        "user.reactivated",
        `Reactivated ${u.name}'s account`,
        { type: "user", id: u.id, name: u.name },
        reason || null,
      );
    } else {
      return invalid({ status: ["Choose suspended or active."] });
    }
    return ok(userRow(u.id));
  }),

  http.post(`${API}/admin/users/:id/password-reset`, async ({ params }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const u = users.find((x) => x.id === params.id);
    if (!u) return fail(404, "This account doesn't exist.");
    if (suspendedUsers[u.id])
      return fail(409, "Reactivate the account first. Suspended accounts can't sign in.");
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    resetTokens[token] = { userId: u.id, expires: Date.now() + 30 * 60_000 };
    audit(auth.user.id, "user.password_reset_sent", `Sent ${u.name} a password reset link`, {
      type: "user",
      id: u.id,
      name: u.name,
    });
    // Mock-only: the link stands in for the email until the backend sends real ones.
    return ok({ sent: true, mock_reset_url: `/reset-password?token=${token}` });
  }),
];
