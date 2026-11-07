import { Link } from "react-router";
import { formatDateShort, useLogout, useMe, useMyClubs, useSessions } from "@courtflex/api";
import { Button, cn, EmptyState, ErrorState, Skeleton } from "@courtflex/ui";
import { ClubLogo, SessionGrid, memberStatusLabels } from "@courtflex/features";

/** Your upcoming games and your clubs. */
export function MePage() {
  const me = useMe();
  const logout = useLogout();
  const joined = useSessions({ scope: "joined" });
  const clubs = useMyClubs();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-expanded font-extrabold">My games</h1>
          <p className="mt-1 text-line-dim">{me.data?.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Court owners and staff who also play switch to their venue here. */}
          {!!me.data?.memberships.length && (
            <a
              href="/owner/"
              className="inline-flex h-11 items-center rounded-full bg-ball px-4 text-sm font-semibold text-ball-ink hover:bg-ball-bright"
            >
              Owner portal
            </a>
          )}
          <Link
            to="/tournaments"
            className="inline-flex h-11 items-center rounded-full border border-line/70 px-4 text-sm font-semibold hover:bg-court-raised"
          >
            Tournaments
          </Link>
          <Link
            to="/rankings"
            className="inline-flex h-11 items-center rounded-full border border-line/70 px-4 text-sm font-semibold hover:bg-court-raised"
          >
            Rankings
          </Link>
          <Link
            to="/players/me"
            className="inline-flex h-11 items-center rounded-full border border-line/70 px-4 text-sm font-semibold hover:bg-court-raised"
          >
            My stats
          </Link>
          <Link
            to="/matches"
            className="inline-flex h-11 items-center rounded-full border border-line/70 px-4 text-sm font-semibold hover:bg-court-raised"
          >
            Matches
          </Link>
          <Link
            to="/me/profile"
            className="inline-flex h-11 items-center rounded-full border border-line/70 px-4 text-sm font-semibold hover:bg-court-raised"
          >
            Edit profile
          </Link>
          <Button
            variant="ghost"
            onClick={() => logout.mutate(undefined, { onSettled: () => window.location.assign("/") })}
          >
            Sign out
          </Button>
        </div>
      </div>

      <section className="mt-8" aria-labelledby="up-h">
        <h2 id="up-h" className="mb-4 text-xl font-expanded font-bold">
          Coming up
        </h2>
        <SessionGrid
          sessions={joined.data}
          loading={joined.isPending}
          error={joined.error}
          onRetry={() => joined.refetch()}
          linkTo={(s) => `/sessions/${s.id}`}
          empty={{
            title: "Nothing booked",
            action: (
              <Link to="/sessions" className="font-semibold text-ball underline underline-offset-4">
                Find a session
              </Link>
            ),
          }}
        />
      </section>

      <section className="mt-12" aria-labelledby="clubs-h">
        <h2 id="clubs-h" className="mb-4 text-xl font-expanded font-bold">
          My clubs
        </h2>
        {clubs.isPending && <Skeleton className="h-32" />}
        {clubs.error && <ErrorState message={clubs.error.message} onRetry={() => clubs.refetch()} />}
        {clubs.data?.length === 0 && (
          <EmptyState
            title="You haven't joined a club"
            body="Clubs post sessions for their members first, often for less."
            action={
              <Link to="/clubs" className="font-semibold text-ball underline underline-offset-4">
                Browse clubs
              </Link>
            }
          />
        )}
        {clubs.data && clubs.data.length > 0 && (
          <ul className="border-t court-line">
            {clubs.data.map(({ club, membership }) => (
              <li key={`${club.type}-${club.id}`} className="border-b court-line">
                <Link
                  to={`/clubs/${club.type}/${club.slug}`}
                  className="flex items-center gap-4 py-3 hover:bg-court-surface"
                >
                  <ClubLogo name={club.name} url={club.logo_url} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{club.name}</span>
                    <span className="block text-sm text-line-dim">
                      {membership.plan?.name ?? "Member"}
                      {membership.expires_at
                        ? `, until ${formatDateShort(membership.expires_at, "Asia/Manila")}`
                        : ""}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      membership.status === "active"
                        ? "text-field"
                        : membership.status === "pending"
                          ? "text-signal-amber"
                          : "text-signal-red",
                    )}
                  >
                    {membership.role === "owner"
                      ? "Owner"
                      : membership.role === "admin"
                        ? "Admin"
                        : memberStatusLabels[membership.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
