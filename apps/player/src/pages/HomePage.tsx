import { Link } from "react-router";
import { MatchCard } from "./matches/MatchesPages";
import { MapPin } from "lucide-react";
import {
  formatTimeRange,
  useCourtSearch,
  useMyClubs,
  usePlayerHome,
  useSessions,
  useMyMatches,
} from "@courtflex/api";
import { EmptyState, ErrorState, Skeleton } from "@courtflex/ui";
import { ClubLogo, SessionCard, pesos, shortDay } from "@courtflex/features";

const TZ = "Asia/Manila";

function greeting() {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: TZ }).format(new Date()),
  );
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** The player's home: the next game first, then what's on nearby. */
export function HomePage() {
  const home = usePlayerHome();
  const near = home.data?.near;
  const sessions = useSessions({ scope: "upcoming" });
  const courts = useCourtSearch({ q: near?.city ?? "" });
  const clubs = useMyClubs();
  const nearby = (sessions.data ?? [])
    .filter((s) => !near || s.venue.city === near.city || near.city.startsWith(s.venue.city))
    .slice(0, 3);

  if (home.isPending) return <Skeleton className="mx-auto h-96 max-w-6xl" />;
  if (home.error) return <ErrorState message={home.error.message} onRetry={() => home.refetch()} />;
  const next = home.data.next_game;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12">
      <header>
        <h1 className="text-3xl font-expanded font-extrabold">
          {greeting()}, {home.data.greeting_name}
        </h1>
        {near && (
          <p className="mt-1 flex items-center gap-1.5 text-line-dim">
            <MapPin className="size-4" aria-hidden />
            {near.city}, {near.province}
          </p>
        )}
      </header>

      <section aria-labelledby="next-h">
        <h2 id="next-h" className="mb-3 text-lg font-semibold">
          Your next game
        </h2>
        {next?.kind === "booking" ? (
          <Link
            to={`/bookings/${next.booking_id}`}
            className="block rounded-md border-2 border-line bg-court-outer/40 p-5 hover:bg-court-outer/60"
          >
            <p className="text-sm text-line-dim">{next.venue_name}</p>
            <p className="mt-1 text-xl font-bold">{next.title}</p>
            <p className="mt-1 text-3xl font-bold font-condensed">
              {formatTimeRange(next.starts_at, next.ends_at, TZ)}
              <span className="ml-3 text-lg font-normal text-line-dim">{shortDay(next.starts_at)}</span>
            </p>
            <p className="mt-2 text-sm font-semibold">
              Booking {next.booking_code},{" "}
              {next.payment_status === "paid" ? "paid" : "pay at the venue when you arrive"}
            </p>
          </Link>
        ) : next ? (
          <Link
            to={`/sessions/${next.session_id}`}
            className="block rounded-md border-2 border-line bg-court-outer/40 p-5 hover:bg-court-outer/60"
          >
            <p className="text-sm text-line-dim">{next.venue_name}</p>
            <p className="mt-1 text-xl font-bold">{next.title}</p>
            <p className="mt-1 text-3xl font-bold font-condensed">
              {formatTimeRange(next.starts_at, next.ends_at, TZ)}
              <span className="ml-3 text-lg font-normal text-line-dim">{shortDay(next.starts_at)}</span>
            </p>
            <p className="mt-2 text-sm font-semibold">
              {next.status === "waitlisted"
                ? `You're number ${next.waitlist_position} on the waitlist`
                : next.status === "checked_in"
                  ? "You're checked in"
                  : "You're registered"}
            </p>
          </Link>
        ) : (
          <EmptyState
            title="Nothing booked yet"
            body="Book a court, or join an open play session."
            action={
              <span className="flex flex-wrap gap-x-6 gap-y-2">
                <Link to="/courts" className="tap font-semibold text-ball underline underline-offset-4">
                  Find a court
                </Link>
                <Link to="/sessions" className="font-semibold text-ball underline underline-offset-4">
                  Browse open play
                </Link>
              </span>
            }
          />
        )}
      </section>

      <MyMatches />

      <section aria-labelledby="op-h">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="op-h" className="text-lg font-semibold">
            Open play {near ? `in ${near.city}` : "coming up"}
          </h2>
          <Link
            to="/sessions"
            className="tap text-sm font-semibold text-line-dim underline underline-offset-4 hover:text-line"
          >
            All sessions
          </Link>
        </div>
        {sessions.isPending ? (
          <Skeleton className="h-60" />
        ) : nearby.length === 0 ? (
          <p className="text-line-dim">No sessions near you right now. Check all sessions or start a club.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {nearby.map((s) => (
              <SessionCard key={s.id} session={s} to={`/sessions/${s.id}`} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="courts-h">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="courts-h" className="text-lg font-semibold">
            Courts {near ? `in ${near.city}` : "to try"}
          </h2>
          <Link
            to="/courts"
            className="tap text-sm font-semibold text-line-dim underline underline-offset-4 hover:text-line"
          >
            Find a court
          </Link>
        </div>
        {courts.isPending ? (
          <Skeleton className="h-24" />
        ) : courts.data?.length === 0 ? (
          <p className="text-line-dim">No venues on CourtFlex in your city yet. Search nearby cities.</p>
        ) : (
          <ul className="border-t court-line">
            {courts.data?.slice(0, 4).map((v) => (
              <li key={v.id} className="border-b court-line">
                <Link
                  to={`/venues/${v.slug}`}
                  className="flex items-center gap-4 py-3 hover:bg-court-surface"
                >
                  <ClubLogo name={v.name} url={v.logo_url} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{v.name}</span>
                    <span className="block text-sm text-line-dim">
                      {v.courts.length} {v.courts.length === 1 ? "court" : "courts"},{" "}
                      {v.open_now ? "open now" : "closed now"}
                    </span>
                  </span>
                  <span className="text-right text-sm">
                    from <span className="font-bold font-condensed">{pesos(v.price_from)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {clubs.data && clubs.data.length > 0 && (
        <section aria-labelledby="clubs-h">
          <h2 id="clubs-h" className="mb-3 text-lg font-semibold">
            Your clubs
          </h2>
          <ul className="flex flex-wrap gap-3">
            {clubs.data.map(({ club }) => (
              <li key={`${club.type}-${club.id}`}>
                <Link
                  to={`/clubs/${club.type}/${club.slug}`}
                  className="flex items-center gap-3 rounded-md border border-line-faint py-2 pr-4 pl-2 hover:border-line"
                >
                  <ClubLogo name={club.name} url={club.logo_url} size="sm" />
                  <span className="font-semibold">{club.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Live and upcoming matches; or a way to log one. */
function MyMatches() {
  const q = useMyMatches();
  const active = (q.data ?? [])
    .filter((m) => m.status === "in_progress" || m.status === "scheduled")
    .slice(0, 2);
  return (
    <section aria-labelledby="matches-h">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="matches-h" className="text-lg font-semibold">
          Your matches
        </h2>
        <Link
          to="/matches"
          className="tap text-sm font-semibold text-line-dim underline underline-offset-4 hover:text-line"
        >
          All matches
        </Link>
      </div>
      {q.isPending ? (
        <Skeleton className="h-24" />
      ) : active.length === 0 ? (
        <p className="text-line-dim">
          Playing soon?{" "}
          <Link to="/matches/new" className="font-semibold text-ball underline underline-offset-4">
            Log a match
          </Link>{" "}
          and keep score from your phone.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {active.map((m) => (
            <li key={m.id}>
              <MatchCard m={m} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
