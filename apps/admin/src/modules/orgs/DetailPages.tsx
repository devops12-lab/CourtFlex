import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { formatDateShort, formatMoney, useAdminClub, useAdminVenue } from "@courtflex/api";
import { ErrorState, Skeleton } from "@courtflex/ui";
import { DecisionPanel, Fact, History, OrgStatusBadge } from "../../shared/org";
import { TZ } from "../../shared/time";

function Shell({ back, backLabel, children }: { back: string; backLabel: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <Link
        to={back}
        className="tap inline-flex w-fit items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {backLabel}
      </Link>
      {children}
    </div>
  );
}

const loading = (
  <div className="flex flex-col gap-4" aria-busy>
    <Skeleton className="h-12 w-2/3 rounded-xl" />
    <Skeleton className="h-64 rounded-2xl" />
  </div>
);

/** A link to manage it with full access. Opens the owner portal or the player app (another app). */
function ManageLink({ href, children, note }: { href: string; children: ReactNode; note: string }) {
  return (
    <div className="rounded-2xl border border-line-faint p-5">
      <a
        href={href}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-line/70 px-4 text-sm font-semibold hover:bg-court-raised"
      >
        {children}
        <ExternalLink className="size-4" aria-hidden />
      </a>
      <p className="mt-2 text-sm text-line-dim">{note}</p>
    </div>
  );
}

export function VenueDetailPage() {
  const { id } = useParams();
  const q = useAdminVenue(id);
  if (q.isPending)
    return (
      <Shell back="/venues" backLabel="Venues">
        {loading}
      </Shell>
    );
  if (q.error)
    return (
      <Shell back="/venues" backLabel="Venues">
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      </Shell>
    );
  const v = q.data;
  return (
    <Shell back="/venues" backLabel="Venues">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-expanded break-words sm:text-4xl">{v.name}</h1>
          <p className="mt-1 text-line-dim">
            Venue in {v.city}, {v.province}
          </p>
        </div>
        <OrgStatusBadge status={v.status} />
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-8">
          <dl className="grid gap-x-6 gap-y-4 rounded-2xl border border-line-faint bg-court-surface p-5 sm:grid-cols-2">
            <Fact label="Owner">
              {v.owner ? (
                <>
                  {v.owner.name}
                  <span className="block text-sm text-line-dim">{v.owner.email}</span>
                </>
              ) : (
                "None"
              )}
            </Fact>
            <Fact label="Contact">
              {v.contact_phone}
              {v.contact_email && <span className="block text-sm text-line-dim">{v.contact_email}</span>}
            </Fact>
            <Fact label="Address">
              {v.address}, {v.city}, {v.province}
            </Fact>
            <Fact label="Map pin">
              {v.pin ? (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${v.pin.lat}&mlon=${v.pin.lng}#map=17/${v.pin.lat}/${v.pin.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-ball underline underline-offset-4"
                >
                  {v.pin.lat.toFixed(5)}, {v.pin.lng.toFixed(5)}
                </a>
              ) : (
                "Not pinned"
              )}
            </Fact>
            <Fact label="Plan">
              <Link
                to={`/billing?tab=subscriptions&q=${encodeURIComponent(v.name)}`}
                className="font-semibold text-ball underline underline-offset-4"
              >
                {v.plan}, {v.subscription_status.replace("_", " ")}
              </Link>
            </Fact>
            <Fact label="Signed up">
              {v.submitted_at ? formatDateShort(v.submitted_at, TZ) : "Before sign-up in the app"}
            </Fact>
            <Fact label="Bookings, next 7 days">{v.bookings_next_7_days}</Fact>
          </dl>

          <section aria-labelledby="courts-h">
            <h2 id="courts-h" className="text-lg font-expanded">
              Courts ({v.court_list.length})
            </h2>
            <ul className="mt-2 divide-y divide-line-faint border-y border-line-faint">
              {v.court_list.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span>
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-line-dim">
                      {" "}
                      {c.indoor_outdoor === "indoor" ? "Indoor" : "Outdoor"}
                      {c.status !== "active" && `, ${c.status}`}
                    </span>
                  </span>
                  <span className="font-condensed tabular-nums">{formatMoney(c.base_price)} an hour</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <DecisionPanel kind="venue" id={v.id} name={v.name} status={v.status} decision={v.decision} />
          <ManageLink
            href={`/owner/v/${v.slug}`}
            note="Opens the owner portal with full access. Changes you make there are recorded in the audit log."
          >
            Manage this venue
          </ManageLink>
          <History entries={v.history} />
        </aside>
      </div>
    </Shell>
  );
}

export function ClubDetailPage() {
  const { id } = useParams();
  const q = useAdminClub(id);
  if (q.isPending)
    return (
      <Shell back="/clubs" backLabel="Clubs">
        {loading}
      </Shell>
    );
  if (q.error)
    return (
      <Shell back="/clubs" backLabel="Clubs">
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      </Shell>
    );
  const c = q.data;
  return (
    <Shell back="/clubs" backLabel="Clubs">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-expanded break-words sm:text-4xl">{c.name}</h1>
          <p className="mt-1 text-line-dim">
            Club in {c.city}, {c.province}
          </p>
        </div>
        <OrgStatusBadge status={c.status} />
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          {(c.tagline || c.description) && (
            <div className="rounded-2xl border border-line-faint bg-court-surface p-5">
              {c.tagline && <p className="font-semibold">{c.tagline}</p>}
              {c.description && <p className="mt-2 text-line-dim">{c.description}</p>}
            </div>
          )}
          <dl className="grid gap-x-6 gap-y-4 rounded-2xl border border-line-faint bg-court-surface p-5 sm:grid-cols-2">
            <Fact label="Created by">
              {c.created_by ? (
                <>
                  {c.created_by.name}
                  <span className="block text-sm text-line-dim">{c.created_by.email}</span>
                </>
              ) : (
                "Unknown"
              )}
            </Fact>
            <Fact label="Contact">
              {c.contact_phone}
              {c.contact_email && <span className="block text-sm text-line-dim">{c.contact_email}</span>}
            </Fact>
            <Fact label="Home venue">{c.home_venue?.name ?? "None"}</Fact>
            <Fact label="Joining">
              {c.join_policy === "open" ? "Anyone can join" : "Admins approve members"}
            </Fact>
            <Fact label="Members">{c.members}</Fact>
            <Fact label="Membership plans">{c.plans}</Fact>
            <Fact label="Sent">{formatDateShort(c.submitted_at, TZ)}</Fact>
          </dl>
        </div>
        <aside className="flex flex-col gap-6">
          <DecisionPanel kind="club" id={c.id} name={c.name} status={c.status} decision={c.decision} />
          <ManageLink
            href={`/clubs/community/${c.slug}/manage`}
            note="Opens the club's management page in the player app, with full access."
          >
            Manage this club
          </ManageLink>
          <History entries={c.history} />
        </aside>
      </div>
    </Shell>
  );
}
