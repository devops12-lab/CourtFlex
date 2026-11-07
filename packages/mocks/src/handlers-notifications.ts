// Notifications API (Phase 7, P1).
import { http } from "msw";
import type {
  AppNotification,
  NotificationCategory,
  NotificationPage,
  NotificationPreferences,
} from "@courtflex/api";
import { notificationPrefs, notifications, prefsOf } from "./notify-db";
import { API, fail, invalid, latency, ok, sessionUser } from "./http-helpers";

const CATEGORIES: NotificationCategory[] = ["matches", "tournaments", "bookings", "clubs", "friends"];

function signedIn() {
  const user = sessionUser();
  return user
    ? ({ user, error: null } as const)
    : ({ error: fail(401, "Your session has ended. Sign in again.") } as const);
}

export const notificationHandlers = [
  http.get(`${API}/notifications`, async () => {
    const auth = signedIn();
    if (auth.error) return auth.error;
    const mine = notifications
      .filter((n) => n.user_id === auth.user.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 100);
    const items: AppNotification[] = mine.map(({ user_id: _u, ...n }) => n);
    const page: NotificationPage = { items, unread: mine.filter((n) => !n.read_at).length };
    return ok(page);
  }),

  http.post(`${API}/notifications/:id/read`, async ({ params }) => {
    const auth = signedIn();
    if (auth.error) return auth.error;
    const n = notifications.find((x) => x.id === params.id && x.user_id === auth.user.id);
    if (!n) return fail(404, "This notification doesn't exist.");
    n.read_at ??= new Date().toISOString();
    return ok({ read: n.id });
  }),

  http.post(`${API}/notifications/read-all`, async () => {
    const auth = signedIn();
    if (auth.error) return auth.error;
    const now = new Date().toISOString();
    let count = 0;
    for (const n of notifications)
      if (n.user_id === auth.user.id && !n.read_at) {
        n.read_at = now;
        count++;
      }
    return ok({ read: count });
  }),

  http.get(`${API}/notification-preferences`, async () => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    return ok(prefsOf(auth.user.id));
  }),

  http.put(`${API}/notification-preferences`, async ({ request }) => {
    await latency();
    const auth = signedIn();
    if (auth.error) return auth.error;
    const body = (await request.json()) as Partial<NotificationPreferences>;
    const next = { ...prefsOf(auth.user.id) };
    for (const c of CATEGORIES) {
      const v = body[c];
      if (!v || typeof v.in_app !== "boolean" || typeof v.email !== "boolean")
        return invalid({ [c]: ["Choose on or off for the app and email."] });
      next[c] = { in_app: v.in_app, email: v.email };
    }
    notificationPrefs[auth.user.id] = next;
    return ok(next);
  }),
];
