// Keeps the demo data for the whole browser tab, so the player app (/) and the
// owner portal (/owner) see the same bookings, sessions and payments even though
// moving between them loads a new page. Only used while the mock API is on.
import {
  adjustments,
  bookings,
  clubs,
  counters,
  courtHours,
  courts,
  exceptions,
  memberships,
  payments,
  priceRules,
  reservations,
  statusHistory,
  subscriptionPlans,
  subscriptions,
  users,
} from "./db";
import { passwords, places, profiles, resetTokens, unverified, verifyAttempts } from "./player-db";
import {
  communities,
  feePayments,
  feeRefunds,
  memberEvents,
  members,
  participants,
  plans,
  queues,
  sessions,
} from "./open-play-db";
import { matches, scoreEvents } from "./match-db";
import { ratingAdjustments, ratingEvents, ratingProfiles, ratingRules } from "./rating-db";
import { entries, tmatches, tournaments } from "./tournament-db";
import { notificationPrefs, notifications } from "./notify-db";
import { announcements, auditLogs, platformSettings, reviews, suspendedUsers } from "./admin-db";

const KEY = "courtflex-mock-db";

const lists: Record<string, unknown[]> = {
  users,
  memberships,
  clubs,
  courts,
  priceRules,
  exceptions,
  reservations,
  bookings,
  payments,
  adjustments,
  communities,
  plans,
  members,
  feePayments,
  feeRefunds,
  sessions,
  participants,
  auditLogs,
  subscriptionPlans,
  announcements,
  matches,
  scoreEvents,
  ratingEvents,
  ratingAdjustments,
  tournaments,
  entries,
  tmatches,
  notifications,
};

const records: Record<string, Record<string, unknown>> = {
  courtHours,
  statusHistory,
  subscriptions,
  passwords,
  verifyAttempts,
  resetTokens,
  profiles,
  places,
  memberEvents,
  queues,
  reviews,
  suspendedUsers,
  platformSettings,
  ratingProfiles,
  ratingRules,
  notificationPrefs,
};

/**
 * A fingerprint of the sample data's shape: which fields records have (nested
 * too) and how many venues, courts, people and clubs there are. Taken before anything is
 * restored. When the sample data changes (new venues, new fields), saved copies
 * from older code no longer match and are thrown away instead of breaking pages.
 */
function shapeOf(value: unknown, depth = 0): string {
  if (depth > 3 || value === null || typeof value !== "object") return typeof value;
  if (Array.isArray(value)) return `[${value.length ? shapeOf(value[0], depth + 1) : ""}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${k}:${shapeOf((value as Record<string, unknown>)[k], depth + 1)}`)
    .join(",")}}`;
}
// Only lists whose size is fixed by the code count; bookings and sessions vary with the time of day.
const FIXED = new Set(["users", "memberships", "clubs", "courts", "communities", "plans"]);
const VERSION = Object.entries(lists)
  .map(([name, list]) => `${name}${FIXED.has(name) ? `#${list.length}` : ""}${shapeOf(list[0])}`)
  .join("|");

let paused = false;

/** Writes the current demo data to this tab's storage. */
export function saveMockData() {
  if (paused) return;
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ version: VERSION, lists, records, unverified: [...unverified], counters }),
    );
  } catch (e) {
    // Full storage (large uploaded images) only means the next page starts from the last good copy.
    console.warn("[mocks] Couldn't save the demo data", e);
  }
}

/** Replaces the freshly seeded sample data with this tab's saved copy, if there is one. */
export function restoreMockData() {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw) as {
      version: string;
      lists: Record<string, unknown[]>;
      records: Record<string, Record<string, unknown>>;
      unverified: string[];
      counters: typeof counters;
    };
    if (saved.version !== VERSION) return;
    for (const [name, list] of Object.entries(lists)) {
      const copy = saved.lists[name];
      if (copy) list.splice(0, list.length, ...copy);
    }
    for (const [name, record] of Object.entries(records)) {
      const copy = saved.records[name];
      if (!copy) continue;
      for (const k of Object.keys(record)) delete record[k];
      Object.assign(record, copy);
    }
    unverified.clear();
    for (const id of saved.unverified) unverified.add(id);
    Object.assign(counters, saved.counters);
  } catch {
    sessionStorage.removeItem(KEY);
  }
}

/** Drops the saved copy. The next page load starts from the sample data. */
export function clearMockData() {
  paused = true;
  sessionStorage.removeItem(KEY);
}
