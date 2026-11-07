import type { MatchSummary, PersonRef } from "@courtflex/api";
import { formatDateShort, useVenueMatches } from "@courtflex/api";
import { cn, EmptyState, ErrorState, Skeleton } from "@courtflex/ui";
import { useClubContext } from "../../app/club-context";

const names = (team: PersonRef[]) => team.map((p) => p.name).join(" & ");
const statusText: Record<MatchSummary["status"], string> = {
  scheduled: "Ready to start",
  in_progress: "Live",
  awaiting_confirmation: "Waiting for confirmation",
  completed: "Final",
  disputed: "Disputed",
  voided: "Void",
};

/**
 * Matches on this venue's courts, live first. Scoring happens in the Live
 * Scorer (the player app), which opens from here; open play hosts and staff
 * start one from a court on the open play queue.
 */
export function MatchesPage() {
  const { club } = useClubContext();
  const q = useVenueMatches(club.id);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-expanded font-bold sm:text-3xl">Matches</h1>
          <p className="mt-1 text-line-dim">
            Games scored on your courts. To score an open play game, use "Score this game" on its court in the
            session.
          </p>
        </div>
        <a
          href={`/matches/new?venue=${club.id}`}
          className="inline-flex h-11 items-center rounded-full bg-ball px-5 text-sm font-semibold text-ball-ink hover:bg-ball-bright"
        >
          New match on a court
        </a>
      </header>
      {q.isPending ? (
        <Skeleton className="h-48" />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState
          title="No matches on your courts yet"
          body="When a game is scored on one of your courts, it shows here, live."
        />
      ) : (
        <ul className="divide-y divide-line-faint border-y border-line-faint">
          {q.data.map((m) => (
            <li key={m.id}>
              <a
                href={`/matches/${m.id}`}
                className="grid gap-1 px-1 py-4 hover:bg-court-surface sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-xs font-semibold text-line-dim">
                    {m.status === "in_progress" && (
                      <span aria-hidden className="size-2 animate-pulse rounded-full bg-signal-red" />
                    )}
                    {statusText[m.status]}
                    <span className="font-normal">
                      · {m.court?.name ?? "No court"} · {m.match_type}, {m.category}
                      {m.session ? ` · ${m.session.title}` : ""}
                    </span>
                  </span>
                  <span className="mt-1 block font-semibold">
                    <span className={cn(m.winner === 0 && "text-field")}>{names(m.teams[0])}</span>
                    <span className="text-line-dim"> vs </span>
                    <span className={cn(m.winner === 1 && "text-ball")}>{names(m.teams[1])}</span>
                  </span>
                  <span className="block text-sm text-line-dim">
                    Scorer: {m.scorer.name}
                    {m.ended_at ? ` · ${formatDateShort(m.ended_at, club.timezone)}` : ""}
                  </span>
                </span>
                <span className="text-xl font-condensed tabular-nums">{m.score || "–"}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
