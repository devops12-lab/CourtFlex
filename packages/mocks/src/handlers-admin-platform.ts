// Super Admin: the audit log, announcements and platform settings (A5).
import { http } from "msw";
import type { Announcement, AnnouncementInput, AuditPage, PlatformSettings } from "@courtflex/api";
import { nextId, users } from "./db";
import { announcements, audit, auditLogs, platformSettings, type MockAnnouncement } from "./admin-db";
import { authorizeAdmin } from "./handlers-admin";
import { API, fail, invalid, latency, ok } from "./http-helpers";

const PAGE_SIZE = 25;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function statusOf(a: MockAnnouncement, now = new Date().toISOString()): Announcement["status"] {
  if (a.ends_at && a.ends_at <= now) return "ended";
  if (a.starts_at > now) return "scheduled";
  return "live";
}

function view(a: MockAnnouncement): Announcement {
  const by = users.find((u) => u.id === a.created_by);
  return {
    id: a.id,
    title: a.title,
    message: a.message,
    audience: a.audience,
    tone: a.tone,
    starts_at: a.starts_at,
    ends_at: a.ends_at,
    created_by: { id: a.created_by, name: by?.name ?? "Super Admin" },
    created_at: a.created_at,
    status: statusOf(a),
  };
}

const audienceWords = { players: "players", owners: "venue owners and staff", everyone: "everyone" };

function validateAnnouncement(body: Partial<AnnouncementInput>) {
  const errors: Record<string, string[]> = {};
  const title = body.title?.trim() ?? "";
  const message = body.message?.trim() ?? "";
  if (title.length < 3 || title.length > 80) errors.title = ["Use 3 to 80 characters."];
  if (message.length < 10 || message.length > 280) errors.message = ["Use 10 to 280 characters."];
  if (!body.audience || !(body.audience in audienceWords)) errors.audience = ["Choose who sees it."];
  if (body.tone !== "info" && body.tone !== "warning") errors.tone = ["Choose information or warning."];
  const starts = body.starts_at ? new Date(body.starts_at) : new Date();
  const ends = body.ends_at ? new Date(body.ends_at) : null;
  if (Number.isNaN(starts.getTime())) errors.starts_at = ["Enter a valid start."];
  if (ends && Number.isNaN(ends.getTime())) errors.ends_at = ["Enter a valid end."];
  else if (ends && ends <= starts) errors.ends_at = ["End after it starts."];
  else if (ends && ends.getTime() <= Date.now()) errors.ends_at = ["End in the future."];
  return { errors, title, message, starts: starts.toISOString(), ends: ends?.toISOString() ?? null };
}

export const adminPlatformHandlers = [
  // ── Audit log ──────────────────────────────────────────
  http.get(`${API}/admin/audit-logs`, async ({ request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const type = url.searchParams.get("type");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const isBilling = (action: string) => action.startsWith("subscription.") || action.startsWith("invoice.");
    const isCompetition = (action: string) => action.startsWith("match.") || action.startsWith("rating.");
    const matches = [...auditLogs]
      .reverse()
      .filter((a) =>
        !type
          ? true
          : type === "billing"
            ? isBilling(a.action)
            : type === "competition"
              ? isCompetition(a.action)
              : a.target.type === type && !isBilling(a.action),
      )
      .filter(
        (a) =>
          !q ||
          [a.summary, a.actor.name, a.target.name, a.reason ?? ""].some((x) => x.toLowerCase().includes(q)),
      );
    const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    const result: AuditPage = {
      entries: matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      total: matches.length,
      page: Math.min(page, pages),
      pages,
    };
    return ok(result);
  }),

  // ── Announcements ──────────────────────────────────────
  http.get(`${API}/admin/announcements`, async () => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const rank = { live: 0, scheduled: 1, ended: 2 };
    return ok(
      announcements
        .map(view)
        .sort((a, b) => rank[a.status] - rank[b.status] || b.starts_at.localeCompare(a.starts_at)),
    );
  }),

  http.post(`${API}/admin/announcements`, async ({ request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const body = (await request.json()) as AnnouncementInput;
    const v = validateAnnouncement(body);
    if (Object.keys(v.errors).length) return invalid(v.errors);
    const a: MockAnnouncement = {
      id: nextId("an"),
      title: v.title,
      message: v.message,
      audience: body.audience,
      tone: body.tone,
      starts_at: v.starts,
      ends_at: v.ends,
      created_by: auth.user.id,
      created_at: new Date().toISOString(),
    };
    announcements.push(a);
    audit(auth.user.id, "announcement.posted", `Posted "${a.title}" for ${audienceWords[a.audience]}`, {
      type: "announcement",
      id: a.id,
      name: a.title,
    });
    return ok(view(a), 201);
  }),

  http.patch(`${API}/admin/announcements/:id`, async ({ params, request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const a = announcements.find((x) => x.id === params.id);
    if (!a) return fail(404, "This announcement doesn't exist.");
    if (statusOf(a) === "ended") return fail(409, "This announcement has ended. Post a new one instead.");
    const body = (await request.json()) as AnnouncementInput;
    const v = validateAnnouncement({ ...body, starts_at: body.starts_at ?? a.starts_at });
    if (Object.keys(v.errors).length) return invalid(v.errors);
    Object.assign(a, {
      title: v.title,
      message: v.message,
      audience: body.audience,
      tone: body.tone,
      starts_at: v.starts,
      ends_at: v.ends,
    });
    audit(auth.user.id, "announcement.edited", `Edited "${a.title}"`, {
      type: "announcement",
      id: a.id,
      name: a.title,
    });
    return ok(view(a));
  }),

  http.post(`${API}/admin/announcements/:id/end`, async ({ params }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const a = announcements.find((x) => x.id === params.id);
    if (!a) return fail(404, "This announcement doesn't exist.");
    if (statusOf(a) === "ended") return fail(409, "This announcement has already ended.");
    a.ends_at = new Date().toISOString();
    if (a.starts_at > a.ends_at) a.starts_at = a.ends_at;
    audit(auth.user.id, "announcement.ended", `Ended "${a.title}"`, {
      type: "announcement",
      id: a.id,
      name: a.title,
    });
    return ok(view(a));
  }),

  /** Public: the live announcements for one app. Players see "players" and "everyone"; owners, "owners" and "everyone". */
  http.get(`${API}/announcements`, ({ request }) => {
    const app = new URL(request.url).searchParams.get("for");
    if (app !== "players" && app !== "owners") return invalid({ for: ["Choose players or owners."] });
    return ok(
      announcements
        .filter((a) => statusOf(a) === "live" && (a.audience === app || a.audience === "everyone"))
        .map(view)
        .reverse(),
    );
  }),

  // ── Settings ───────────────────────────────────────────
  /** Public: the apps use these in their wording (trial length, support contact). */
  http.get(`${API}/platform/settings`, () => ok<PlatformSettings>({ ...platformSettings })),

  http.put(`${API}/admin/settings`, async ({ request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const body = (await request.json()) as Partial<PlatformSettings>;
    const errors: Record<string, string[]> = {};
    if (!Number.isInteger(body.trial_days) || body.trial_days! < 7 || body.trial_days! > 60)
      errors.trial_days = ["Choose 7 to 60 days."];
    const email = body.support_email?.trim().toLowerCase() ?? "";
    if (!EMAIL_RE.test(email)) errors.support_email = ["Enter a valid email."];
    const phone = body.support_phone?.trim() ?? "";
    if (!/^[0-9+][0-9 -]{6,16}$/.test(phone))
      errors.support_phone = ["Enter a phone number, like 0917 555 0100."];
    if (typeof body.venue_signups_open !== "boolean") errors.venue_signups_open = ["Choose open or closed."];
    if (Object.keys(errors).length) return invalid(errors);
    const before = { ...platformSettings };
    Object.assign(platformSettings, {
      trial_days: body.trial_days,
      venue_signups_open: body.venue_signups_open,
      support_email: email,
      support_phone: phone,
    });
    const changes: string[] = [];
    if (before.trial_days !== platformSettings.trial_days)
      changes.push(`free trial ${before.trial_days} → ${platformSettings.trial_days} days`);
    if (before.venue_signups_open !== platformSettings.venue_signups_open)
      changes.push(`new venue sign-ups ${platformSettings.venue_signups_open ? "opened" : "closed"}`);
    if (before.support_email !== platformSettings.support_email)
      changes.push(`support email ${platformSettings.support_email}`);
    if (before.support_phone !== platformSettings.support_phone)
      changes.push(`support phone ${platformSettings.support_phone}`);
    if (changes.length)
      audit(auth.user.id, "settings.updated", `Changed settings: ${changes.join(", ")}`, {
        type: "settings",
        id: "platform",
        name: "Platform settings",
      });
    return ok<PlatformSettings>({ ...platformSettings });
  }),
];
