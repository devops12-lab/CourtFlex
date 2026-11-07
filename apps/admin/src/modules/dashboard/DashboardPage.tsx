import { Link } from "react-router";
import { ArrowRight, Building2, Users } from "lucide-react";
import type { AdminDashboard, ReviewItem } from "@courtflex/api";
import { formatDateShort, formatMoney, useAdminDashboard } from "@courtflex/api";
import { EmptyState, ErrorState, Skeleton } from "@courtflex/ui";
import { ago, TZ } from "../../shared/time";

export function DashboardPage() {
  const q = useAdminDashboard();
  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="text-3xl font-expanded sm:text-4xl">Dashboard</h1>
        <p className="mt-1 text-line-dim">
          {new Intl.DateTimeFormat("en-PH", { dateStyle: "full", timeZone: TZ }).format(new Date())}
        </p>
      </header>
      {q.isPending ? (
        <div className="flex flex-col gap-6" aria-busy>
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      ) : (
        <>
          <ReviewQueue
            items={q.data.review}
            total={q.data.counts.venues_pending + q.data.counts.clubs_pending}
          />
          {q.data.counts.disputes > 0 && (
            <Link
              to="/competition"
              className="-mt-6 flex items-center justify-between gap-3 rounded-2xl border border-signal-amber/40 bg-court-surface px-5 py-4 hover:bg-court-raised"
            >
              <span>
                <strong>
                  {q.data.counts.disputes} disputed {q.data.counts.disputes === 1 ? "result" : "results"}
                </strong>{" "}
                <span className="text-line-dim">waiting for a decision</span>
              </span>
              <span className="text-sm font-semibold text-ball">Settle</span>
            </Link>
          )}
          <Revenue d={q.data} />
          <Numbers d={q.data} />
          <div className="grid gap-10 lg:grid-cols-2">
            <TrialsEnding d={q.data} />
            <RecentActivity d={q.data} />
          </div>
        </>
      )}
    </div>
  );
}

function ReviewQueue({ items, total }: { items: ReviewItem[]; total: number }) {
  return (
    <section aria-labelledby="review-h">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="review-h" className="text-xl font-expanded">
          Needs review{total > 0 && <span className="ml-2 text-signal-amber">{total}</span>}
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-line-faint p-5 text-line-dim">
          Nothing waiting. New venue and club sign-ups show up here.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line-faint overflow-hidden rounded-2xl border border-signal-amber/40">
          {items.map((r) => {
            const Icon = r.kind === "venue" ? Building2 : Users;
            return (
              <li key={`${r.kind}-${r.id}`}>
                <Link
                  to={`/${r.kind === "venue" ? "venues" : "clubs"}/${r.id}`}
                  className="group flex items-center gap-4 bg-court-surface px-4 py-4 transition-colors hover:bg-court-raised sm:px-5"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-signal-amber/15 text-signal-amber">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.name}</span>
                    <span className="block text-sm text-line-dim sm:truncate">
                      {r.kind === "venue" ? "Venue" : "Club"} in {r.city}, {r.province}. Sent by{" "}
                      {r.submitted_by.name} {ago(r.submitted_at)}.
                    </span>
                  </span>
                  <span className="hidden items-center gap-1 text-sm font-semibold text-ball sm:flex">
                    Review
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-ball sm:hidden" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Revenue({ d }: { d: AdminDashboard }) {
  const r = d.revenue;
  return (
    <section aria-labelledby="revenue-h">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="revenue-h" className="text-xl font-expanded">
          Revenue
        </h2>
        <Link to="/revenue" className="text-sm font-semibold text-ball underline underline-offset-4">
          See revenue
        </Link>
      </div>
      <div className="mt-3 grid gap-px overflow-hidden rounded-2xl border border-line-faint bg-line-faint sm:grid-cols-[1.4fr_1fr_1fr]">
        <div className="bg-court-surface p-5">
          <p className="text-sm text-line-dim">Monthly recurring revenue</p>
          <p className="mt-1 text-4xl font-condensed text-ball tabular-nums sm:text-5xl">
            {formatMoney(r.mrr)}
          </p>
          <p className="mt-1 text-xs text-line-dim">Monthly price of every paid, active venue plan.</p>
        </div>
        <dl className="grid grid-cols-2 gap-px bg-line-faint sm:col-span-2">
          <div className="bg-court-surface p-5">
            <dt className="text-sm text-line-dim">Subscriptions paid this month</dt>
            <dd className="mt-1 text-2xl font-condensed tabular-nums">
              {formatMoney(r.subscriptions_paid_this_month)}
            </dd>
          </div>
          <div className="bg-court-surface p-5">
            <dt className="text-sm text-line-dim">Invoices not yet paid</dt>
            <dd
              className={`mt-1 text-2xl font-condensed tabular-nums ${Number(r.subscriptions_unpaid) > 0 ? "text-signal-amber" : ""}`}
            >
              {formatMoney(r.subscriptions_unpaid)}
            </dd>
          </div>
          <div className="col-span-2 bg-court-surface p-5">
            <dt className="text-sm text-line-dim">Bookings paid at venues this month</dt>
            <dd className="mt-1 text-2xl font-condensed tabular-nums">
              {formatMoney(r.bookings_paid_this_month)}
            </dd>
            <dd className="text-xs text-line-dim">
              After refunds. This goes to the venues, not to CourtFlex.
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function Numbers({ d }: { d: AdminDashboard }) {
  const c = d.counts;
  const tiles: Array<{ label: string; value: number; note?: string }> = [
    {
      label: "Venues live",
      value: c.venues_active,
      note: [
        c.venues_pending && `${c.venues_pending} waiting`,
        c.venues_suspended && `${c.venues_suspended} suspended`,
      ]
        .filter(Boolean)
        .join(", "),
    },
    {
      label: "Clubs",
      value: c.clubs_active,
      note: c.clubs_pending ? `${c.clubs_pending} waiting` : undefined,
    },
    { label: "Players", value: c.players },
    { label: "Bookings, next 7 days", value: c.bookings_next_7_days },
    { label: "Open play, next 7 days", value: c.sessions_next_7_days },
  ];
  return (
    <section aria-labelledby="numbers-h">
      <h2 id="numbers-h" className="sr-only">
        Platform numbers
      </h2>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line-faint bg-line-faint lg:grid-cols-5">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="flex flex-col bg-court-surface p-4 last:col-span-2 sm:p-5 lg:last:col-span-1"
          >
            <dt className="text-sm text-line-dim">{t.label}</dt>
            <dd className="mt-1 text-3xl font-condensed tabular-nums">{t.value.toLocaleString("en-PH")}</dd>
            {t.note && <dd className="mt-0.5 text-xs text-signal-amber">{t.note}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

function TrialsEnding({ d }: { d: AdminDashboard }) {
  return (
    <section aria-labelledby="trials-h">
      <h2 id="trials-h" className="text-xl font-expanded">
        Trials ending this week
      </h2>
      {d.trials_ending.length === 0 ? (
        <p className="mt-3 text-line-dim">No venue trials end in the next 7 days.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line-faint border-y border-line-faint">
          {d.trials_ending.map((t) => (
            <li key={t.club_id} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0 truncate font-semibold">{t.club_name}</span>
              <span className="shrink-0 text-sm text-line-dim">
                {t.days_left === 0
                  ? "Ends today"
                  : `${t.days_left} ${t.days_left === 1 ? "day" : "days"} left`}
                , {formatDateShort(t.ends_at, TZ)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentActivity({ d }: { d: AdminDashboard }) {
  return (
    <section aria-labelledby="activity-h">
      <h2 id="activity-h" className="text-xl font-expanded">
        Recent admin activity
      </h2>
      {d.recent_activity.length === 0 ? (
        <EmptyState title="No admin activity yet" />
      ) : (
        <ol className="mt-3 divide-y divide-line-faint border-y border-line-faint">
          {d.recent_activity.map((a) => (
            <li key={a.id} className="py-3">
              <p className="font-semibold">{a.summary}</p>
              <p className="text-sm text-line-dim">
                {a.actor.name}, {ago(a.at)}
                {a.reason && <span className="block text-line">Reason: {a.reason}</span>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
