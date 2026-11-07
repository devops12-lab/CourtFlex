import { Link } from "react-router";
import type { OpenPlaySession } from "@courtflex/api";
import { formatTimeRange } from "@courtflex/api";
import { cn, EmptyState, ErrorState, Skeleton } from "@courtflex/ui";
import { ClubLogo } from "./ClubMark";
import {
  participantStatusLabels,
  pesos,
  sessionStatusLabels,
  sessionTypeLabels,
  shortDay,
  skillLabels,
} from "./labels";

/** One pip per spot: filled is taken, outlined is open. Big sessions fall back to a bar. */
export function CapacityPips({
  taken,
  capacity,
  waitlist = 0,
}: {
  taken: number;
  capacity: number;
  waitlist?: number;
}) {
  const left = Math.max(capacity - taken, 0);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      {capacity <= 12 ? (
        <span className="flex flex-wrap gap-[3px]" aria-hidden>
          {Array.from({ length: capacity }, (_, i) => (
            <span
              key={i}
              className={cn("size-2 rounded-full", i < taken ? "bg-line" : "border border-line-dim/60")}
            />
          ))}
        </span>
      ) : (
        <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-court-raised" aria-hidden>
          <span
            className="block h-full bg-line"
            style={{ width: `${Math.min(taken / capacity, 1) * 100}%` }}
          />
        </span>
      )}
      <span className="text-sm font-condensed">
        <span className="font-semibold">
          {taken}/{capacity}
        </span>{" "}
        <span className="text-line-dim">
          {left === 0 ? (waitlist ? `full, ${waitlist} waiting` : "full") : `${left} open`}
        </span>
      </span>
    </div>
  );
}

function StatusTag({ session }: { session: OpenPlaySession }) {
  const s = session.status;
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-sm px-2 text-xs font-semibold",
        s === "live" && "bg-ball text-ball-ink",
        s === "published" && "border border-line/50",
        s === "pending_approval" && "border border-dashed border-signal-amber text-signal-amber",
        (s === "cancelled" || s === "rejected") && "border border-signal-red/60 text-signal-red",
        s === "completed" && "border border-line-faint text-line-dim",
      )}
    >
      {s === "live" && <span className="size-1.5 animate-pulse rounded-full bg-ball-ink" aria-hidden />}
      {s === "pending_approval" ? "Pending" : s === "rejected" ? "Turned down" : sessionStatusLabels[s]}
    </span>
  );
}

/** A session as a ticket: who runs it, when, where, how full, and what it costs. */
export function SessionCard({ session: s, to }: { session: OpenPlaySession; to: string }) {
  const mine = s.my_registration;
  return (
    <Link
      to={to}
      className="group flex min-w-0 flex-col rounded-md border border-line-faint bg-court-surface transition-colors hover:border-line/60"
    >
      <div className="flex items-center gap-2 px-4 pt-4">
        <ClubLogo name={s.organizer.name} url={s.organizer.logo_url} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm text-line-dim">{s.organizer.name}</span>
        <StatusTag session={s} />
      </div>
      <div className="px-4 pt-3 pb-4">
        <h3 className="text-lg leading-snug font-bold group-hover:underline">{s.title}</h3>
        <p className="mt-1 text-xl font-semibold font-condensed">
          {formatTimeRange(s.starts_at, s.ends_at, "Asia/Manila")}
          <span className="ml-2 inline-block text-base font-normal whitespace-nowrap text-line-dim">
            {shortDay(s.starts_at)}
          </span>
        </p>
        <p className="mt-1 text-sm text-line-dim">
          {s.venue.name}, {s.courts.map((c) => c.name).join(" and ")}
        </p>
        <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <li className="rounded-sm bg-court-raised px-2 py-1">{skillLabels[s.skill_level]}</li>
          <li className="rounded-sm bg-court-raised px-2 py-1">{sessionTypeLabels[s.session_type]}</li>
          {s.members_only && <li className="rounded-sm border border-line/40 px-2 py-1">Members only</li>}
        </ul>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t court-line px-4 py-3">
        <CapacityPips taken={s.registered_count} capacity={s.capacity} waitlist={s.waitlist_count} />
        <span className="text-right">
          <span className="block font-semibold font-condensed">{pesos(s.fee)}</span>
          {Number(s.member_fee) < Number(s.fee) && (
            <span className="block text-xs text-line-dim">members {pesos(s.member_fee)}</span>
          )}
        </span>
      </div>
      {mine && (
        <div
          className={cn(
            "rounded-b-md px-4 py-2 text-sm font-semibold",
            mine.status === "waitlisted"
              ? "bg-signal-amber/15 text-signal-amber"
              : "bg-court-outer text-line",
          )}
        >
          {mine.status === "waitlisted"
            ? `You're number ${mine.waitlist_position} on the waitlist`
            : `You're ${participantStatusLabels[mine.status].toLowerCase()}`}
        </div>
      )}
    </Link>
  );
}

export function SessionGrid({
  sessions,
  loading,
  error,
  onRetry,
  linkTo,
  empty,
}: {
  sessions: OpenPlaySession[] | undefined;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  linkTo: (s: OpenPlaySession) => string;
  empty: { title: string; body?: string; action?: React.ReactNode };
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-60" />
        ))}
      </div>
    );
  }
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />;
  if (!sessions?.length) return <EmptyState title={empty.title} body={empty.body} action={empty.action} />;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {sessions.map((s) => (
        <SessionCard key={s.id} session={s} to={linkTo(s)} />
      ))}
    </div>
  );
}
