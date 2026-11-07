import { formatDateShort, useVenueTournaments } from "@courtflex/api";
import { EmptyState, ErrorState, Skeleton } from "@courtflex/ui";
import { useClubContext } from "../../app/club-context";

const statusText = {
  registration: "Taking entries",
  in_progress: "Being played",
  completed: "Finished",
  cancelled: "Cancelled",
} as const;

/**
 * Tournaments at this venue: the venue's own and clubs' that play here. They're
 * run from the player app's tournament page (same sign-in), which opens from here.
 */
export function TournamentsPage() {
  const { club, can } = useClubContext();
  const q = useVenueTournaments(club.id);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-expanded font-bold sm:text-3xl">Tournaments</h1>
          <p className="mt-1 text-line-dim">
            Your venue's tournaments, and clubs' tournaments played on your courts.
          </p>
        </div>
        {can("manageOpenPlay") && (
          <a
            href="/tournaments/new"
            className="inline-flex h-11 items-center rounded-full bg-ball px-5 text-sm font-semibold text-ball-ink hover:bg-ball-bright"
          >
            Run a tournament
          </a>
        )}
      </header>
      {q.isPending ? (
        <Skeleton className="h-48" />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState
          title="No tournaments here yet"
          body="Run one: players register on its page, the draw is seeded by rating, and every match is scored live."
        />
      ) : (
        <ul className="divide-y divide-line-faint border-y border-line-faint">
          {q.data.map((t) => (
            <li key={t.id}>
              <a
                href={`/tournaments/${t.slug}`}
                className="grid gap-1 px-1 py-4 hover:bg-court-surface sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-line-dim">
                    {statusText[t.status]} · {t.match_type} · by {t.host.name}
                  </span>
                  <span className="mt-1 block text-lg font-semibold">{t.name}</span>
                  <span className="block text-sm text-line-dim">
                    {formatDateShort(t.starts_at, club.timezone)} · {t.entries_count} of {t.capacity} entries
                    {t.champion ? ` · Champion: ${t.champion.name}` : ""}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
