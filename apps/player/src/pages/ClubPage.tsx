import { useState } from "react";
import { Link, useParams } from "react-router";
import { ChevronLeft, MapPin, Settings } from "lucide-react";
import type { ClubProfile, OrganizerType } from "@courtflex/api";
import {
  ApiError,
  formatDateShort,
  useClubProfile,
  useLeaveClub,
  useOrganizerSessions,
} from "@courtflex/api";
import { Button, cn, ErrorState, Skeleton, Tabs, useToast } from "@courtflex/ui";
import {
  ClubCover,
  ClubLogo,
  SessionGrid,
  durationLabel,
  memberStatusLabels,
  pesos,
} from "@courtflex/features";
import { NotFound } from "./NotFound";

type Tab = "sessions" | "about" | "stats";

/** A club (player community) at /clubs/community/:slug, or a venue's page at /venues/:slug. */
export function ClubPage({ venue }: { venue?: boolean }) {
  const params = useParams();
  const type = (venue ? "venue" : params.type) as OrganizerType;
  const profile = useClubProfile(type, params.slug);
  if (profile.isPending) return <Skeleton className="mx-auto h-96 max-w-5xl" />;
  if (profile.error) {
    return profile.error instanceof ApiError && profile.error.status === 404 ? (
      <NotFound
        message={
          venue ? "This venue isn't listed on CourtFlex." : "This club doesn't exist, or it isn't public yet."
        }
      />
    ) : (
      <ErrorState message={profile.error.message} onRetry={() => profile.refetch()} />
    );
  }
  return <ClubView club={profile.data} />;
}

function ClubView({ club }: { club: ClubProfile }) {
  const [tab, setTab] = useState<Tab>("sessions");
  const [when, setWhen] = useState<"upcoming" | "past">("upcoming");
  const sessions = useOrganizerSessions(club.type, club.id, when);
  // Venues have courts and sessions, but no members: only clubs do.
  const isVenue = club.type === "venue";

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        to={isVenue ? "/courts" : "/clubs"}
        className="tap inline-flex items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {isVenue ? "All courts" : "All clubs"}
      </Link>

      <header className="mt-4 overflow-hidden rounded-md border border-line-faint">
        <ClubCover name={club.name} url={club.cover_url} className="h-32 sm:h-44" />
        <div className="flex flex-wrap items-end gap-4 bg-court-surface px-5 pb-5">
          <ClubLogo name={club.name} url={club.logo_url} size="lg" className="-mt-10 bg-court-deep" />
          <div className="min-w-0 flex-1 pt-3">
            <p className="text-sm text-line-dim">{isVenue ? "Venue" : "Club"}</p>
            <h1 className="text-2xl leading-tight font-expanded font-extrabold [overflow-wrap:anywhere] sm:text-3xl">
              {club.name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-line-dim">
              <MapPin className="size-3.5" aria-hidden />
              {club.city}, {club.province}
              {club.home_venue && (
                <>
                  {". Plays at "}
                  <Link
                    to={`/venues/${club.home_venue.slug}`}
                    className="underline underline-offset-4 hover:text-line"
                  >
                    {club.home_venue.name}
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {club.me.can_manage && club.type === "community" && (
              <Link
                to="manage"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-line/70 px-4 text-sm font-semibold hover:bg-court-raised"
              >
                <Settings className="size-4" aria-hidden />
                Manage club
              </Link>
            )}
            {!isVenue && <MembershipAction club={club} />}
          </div>
        </div>
        {club.status === "pending_review" && (
          <p className="border-t border-signal-amber/50 bg-signal-amber/10 px-5 py-3 text-sm">
            <strong className="font-semibold">Waiting for CourtFlex review.</strong> Only you can see this
            club for now. Once it's approved it appears in the directory and you can host sessions.
          </p>
        )}
      </header>

      <Tabs
        className="mt-6"
        label={club.name}
        value={tab}
        onChange={setTab}
        items={[
          { value: "sessions", label: "Sessions", count: club.upcoming_session_count },
          { value: "about", label: "About" },
          { value: "stats", label: "Statistics" },
        ]}
      >
        {(t) =>
          t === "sessions" ? (
            <div className="flex flex-col gap-4">
              <div role="group" aria-label="When" className="flex gap-2">
                {(["upcoming", "past"] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={when === w}
                    onClick={() => setWhen(w)}
                    className={cn(
                      "h-9 rounded-full border px-4 text-sm font-semibold",
                      when === w
                        ? "border-line bg-line text-court-deep"
                        : "border-line-faint text-line-dim hover:text-line",
                    )}
                  >
                    {w === "upcoming" ? "Current and upcoming" : "Past"}
                  </button>
                ))}
              </div>
              <SessionGrid
                sessions={sessions.data}
                loading={sessions.isPending}
                error={sessions.error}
                onRetry={() => sessions.refetch()}
                linkTo={(s) => `/sessions/${s.id}`}
                empty={{ title: when === "upcoming" ? "Nothing scheduled yet" : "No past sessions" }}
              />
            </div>
          ) : t === "about" ? (
            <About club={club} />
          ) : (
            <dl className="grid gap-6 sm:grid-cols-4">
              {!isVenue && <Stat label="Members" value={club.member_count} />}
              <Stat label="Sessions held" value={club.stats.sessions_held} />
              <Stat label="Players hosted" value={club.stats.players_hosted} />
              <Stat label="Games played" value={club.stats.games_played} />
            </dl>
          )
        }
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-t-2 border-line pt-3">
      <dt className="text-sm text-line-dim">{label}</dt>
      <dd className="text-4xl font-bold font-condensed">{value}</dd>
    </div>
  );
}

function About({ club }: { club: ClubProfile }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col gap-6">
        {club.description && <p className="max-w-prose text-lg">{club.description}</p>}
        {club.rules && (
          <section>
            <h3 className="font-semibold">Club rules</h3>
            <p className="mt-1 max-w-prose text-line-dim">{club.rules}</p>
          </section>
        )}
        {club.courts.length > 0 && (
          <section>
            <h3 className="font-semibold">Courts</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {club.courts.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/courts/${c.id}`}
                    className="inline-flex rounded-sm border border-line-faint px-3 py-1.5 text-sm hover:border-line"
                  >
                    {c.name} <span className="ml-1.5 text-line-dim capitalize">{c.indoor_outdoor}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h3 className="font-semibold">Contact</h3>
          <p className="mt-1 text-line-dim">
            {[club.contact_phone, club.contact_email].filter(Boolean).join(", ") || "No contact details yet."}
          </p>
        </section>
      </div>
      {club.type === "community" && (
        <section aria-labelledby="plans-h">
          <h3 id="plans-h" className="font-semibold">
            Membership
          </h3>
          <p className="mt-1 text-sm text-line-dim">
            {club.join_policy === "approval"
              ? "New members are approved by the club."
              : "Join straight away."}{" "}
            Session cancellations are free until {club.cancellation_hours} hours before the start.
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {club.plans.map((p) => (
              <li key={p.id} className="rounded-md border border-line-faint p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-bold">{p.name}</span>
                  <span className="text-lg font-bold font-condensed">{pesos(p.price)}</span>
                </div>
                <p className="mt-1 text-sm text-line-dim">{p.description}</p>
                <p className="mt-2 text-sm">
                  {durationLabel(p.duration_days)}
                  {p.session_discount_percent > 0 ? `, ${p.session_discount_percent}% off sessions` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Join (opens the join form), see where your application stands, or leave. */
function MembershipAction({ club }: { club: ClubProfile }) {
  const leave = useLeaveClub(club.type, club.id);
  const toast = useToast();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const m = club.me.membership;
  const statusLink = `/clubs/community/${club.slug}/membership`;

  if (club.me.role === "staff") return <span className="text-sm text-line-dim">You work here</span>;
  if (club.status !== "active") return null;

  if (m && m.status !== "rejected") {
    const owesReceipt = m.payment?.status === "awaiting_receipt" || m.payment?.status === "rejected";
    return (
      <div className="flex flex-col items-end gap-1 text-right">
        {owesReceipt ? (
          <Link
            to={statusLink}
            className="inline-flex h-11 items-center rounded-full bg-ball px-5 font-semibold text-ball-ink hover:bg-ball-bright"
          >
            {m.payment?.status === "rejected" ? "Send a new receipt" : "Pay and send receipt"}
          </Link>
        ) : (
          <Link
            to={statusLink}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-sm font-semibold",
              m.status === "active"
                ? "border-court-outer-bright text-field"
                : m.status === "pending"
                  ? "border-dashed border-signal-amber text-signal-amber"
                  : "border-signal-red/60 text-signal-red",
            )}
          >
            {m.role === "owner"
              ? "Owner"
              : m.role === "admin"
                ? "Admin"
                : m.payment?.status === "in_review"
                  ? "Receipt being checked"
                  : memberStatusLabels[m.status]}
          </Link>
        )}
        {m.expires_at && m.status === "active" && (
          <span className="text-xs text-line-dim">Until {formatDateShort(m.expires_at, "Asia/Manila")}</span>
        )}
        {m.role !== "owner" &&
          (confirmLeave ? (
            <span className="flex gap-2">
              <Button
                size="sm"
                variant="danger"
                loading={leave.isPending}
                onClick={() =>
                  leave.mutate(undefined, {
                    onSuccess: () => toast({ tone: "success", message: `You left ${club.name}.` }),
                  })
                }
              >
                Leave {club.name}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmLeave(false)}>
                Stay
              </Button>
            </span>
          ) : (
            <button
              type="button"
              className="text-xs text-line-dim underline underline-offset-4 hover:text-line"
              onClick={() => setConfirmLeave(true)}
            >
              {m.status === "pending" ? "Withdraw request" : "Leave club"}
            </button>
          ))}
      </div>
    );
  }

  return (
    <Link
      to={`/clubs/community/${club.slug}/join`}
      className="inline-flex h-12 items-center rounded-full bg-ball px-6 font-semibold text-ball-ink hover:bg-ball-bright"
    >
      {club.join_policy === "approval" ? "Apply to join" : "Join club"}
    </Link>
  );
}
