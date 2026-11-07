// Super Admin data (Phase 6): the audit log, sign-up reviews and suspended accounts.
import type { AuditEntry, OrgKind } from "@courtflex/api";
import { nextId, users } from "./db";

/** Newest last. Every admin change adds one. */
export const auditLogs: AuditEntry[] = [
  {
    id: "al-1",
    at: "2026-07-01T02:00:00.000Z",
    actor: { id: "u-001", name: "Platform Admin" },
    action: "venue.approved",
    summary: "Approved Mauban Pickleball Courts",
    target: { type: "venue", id: "c-001", name: "Mauban Pickleball Courts" },
    reason: null,
  },
  {
    id: "al-2",
    at: "2026-07-01T02:05:00.000Z",
    actor: { id: "u-001", name: "Platform Admin" },
    action: "venue.approved",
    summary: "Approved Quezon Sports Courts",
    target: { type: "venue", id: "c-002", name: "Quezon Sports Courts" },
    reason: null,
  },
];

/**
 * Sign-up reviews, keyed "venue:<id>" or "club:<id>": when it was submitted, and
 * the decision once made. Venues and clubs without an entry were approved before
 * the admin portal existed.
 */
export const reviews: Record<
  string,
  { submitted_at: string; decided_at?: string; decided_by?: string; reason?: string | null }
> = {
  // Seeded sign-up waiting for review (player-db.ts, c-015).
  "venue:c-015": { submitted_at: new Date(Date.now() - 26 * 3_600_000).toISOString() },
};

export const reviewKey = (kind: OrgKind, id: string) => `${kind}:${id}`;

/** Accounts the Super Admin suspended: they can't sign in. Data is kept. */
export const suspendedUsers: Record<string, { at: string; reason: string; by: string }> = {};

export function audit(
  actorId: string,
  action: string,
  summary: string,
  target: AuditEntry["target"],
  reason: string | null = null,
) {
  const actor = users.find((u) => u.id === actorId)!;
  auditLogs.push({
    id: nextId("al"),
    at: new Date().toISOString(),
    actor: { id: actor.id, name: actor.name },
    action,
    summary,
    target,
    reason,
  });
}

// ── Announcements and platform settings (A5) ──────────────

export interface MockAnnouncement {
  id: string;
  title: string;
  message: string;
  audience: "players" | "owners" | "everyone";
  tone: "info" | "warning";
  starts_at: string;
  ends_at: string | null;
  created_by: string;
  created_at: string;
}

/** Newest last. The sample one has ended, so no banner shows until the Super Admin posts one. */
export const announcements: MockAnnouncement[] = [
  {
    id: "an-1",
    title: "Welcome to CourtFlex",
    message: "Book courts, join open play and find your club, all in one place.",
    audience: "players",
    tone: "info",
    starts_at: "2026-07-01T00:00:00.000Z",
    ends_at: "2026-07-31T00:00:00.000Z",
    created_by: "u-001",
    created_at: "2026-07-01T00:00:00.000Z",
  },
];

export const platformSettings = {
  trial_days: 14,
  venue_signups_open: true,
  support_email: "support@courtflex.test",
  support_phone: "0917 555 0100",
};

/** "Contact CourtFlex support at support@… or 0917 …" */
export const supportLine = () =>
  `Contact CourtFlex support at ${platformSettings.support_email} or ${platformSettings.support_phone}.`;
