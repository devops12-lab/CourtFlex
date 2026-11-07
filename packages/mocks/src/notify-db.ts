// In-app notifications (Phase 7, P1). Created where things happen (results,
// disputes, tournaments, receipts, memberships, waitlists, friends), unless the
// player turned that category off. Email is the backend's job; the preference
// is kept here for it.
import type { NotificationCategory, NotificationPreferences } from "@courtflex/api";
import { users } from "./db";

export interface MockNotification {
  id: string;
  user_id: string;
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export const notifications: MockNotification[] = [];
/** By user id. Missing: everything on in the app, email off. */
export const notificationPrefs: Record<string, NotificationPreferences> = {};

export const defaultPrefs = (): NotificationPreferences => ({
  matches: { in_app: true, email: false },
  tournaments: { in_app: true, email: false },
  bookings: { in_app: true, email: true },
  clubs: { in_app: true, email: false },
  friends: { in_app: true, email: false },
});

export const prefsOf = (userId: string) => (notificationPrefs[userId] ??= defaultPrefs());

// Quiet while the sample data is being built; handlers.ts turns it on.
let muted = true;
export const unmuteNotifications = () => {
  muted = false;
};

let seq = 1;

export function notify(
  userId: string | null | undefined,
  category: NotificationCategory,
  type: string,
  title: string,
  body: string,
  link: string | null = null,
  at = new Date().toISOString(),
) {
  if (muted || !userId) return;
  if (!users.some((u) => u.id === userId && u.has_player_profile)) return;
  if (!prefsOf(userId)[category].in_app) return;
  notifications.push({
    id: `n-${seq++}-${Date.now() % 100000}`,
    user_id: userId,
    category,
    type,
    title,
    body,
    link,
    read_at: null,
    created_at: at,
  });
}

// A few to start the demo with.
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const seedOne = (n: Omit<MockNotification, "id" | "read_at"> & { read?: boolean }) =>
  notifications.push({ ...n, id: `n-seed-${seq++}`, read_at: n.read ? n.created_at : null });

seedOne({
  user_id: "u-004",
  category: "matches",
  type: "result_to_confirm",
  title: "Confirm your result",
  body: "Jamie submitted your singles match: Jamie won 11-7. Confirm it, or dispute it if it's wrong.",
  link: "/matches/m-2",
  created_at: ago(25 * 60),
});
seedOne({
  user_id: "u-003",
  category: "tournaments",
  type: "tournament_result",
  title: "Saturday Shootout is over",
  body: "Bea & Miguel won it. You and Paolo finished third in Pool A.",
  link: "/tournaments/saturday-shootout",
  created_at: ago(2 * 60),
});
seedOne({
  user_id: "u-003",
  category: "tournaments",
  type: "tournament_open",
  title: "Mauban Doubles Open is taking entries",
  body: "Eight teams, single elimination, a week from Saturday. Two places left.",
  link: "/tournaments/mauban-doubles-open",
  created_at: ago(26 * 60),
  read: true,
});
