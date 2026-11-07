import { Link } from "react-router";
import { formatMoney, useAdminRevenue } from "@courtflex/api";
import { ErrorState, Skeleton } from "@courtflex/ui";

export function RevenuePage() {
  const q = useAdminRevenue();
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-expanded sm:text-4xl">Revenue</h1>
        <p className="mt-1 text-line-dim">
          CourtFlex's income is venue subscriptions. Booking payments go to the venues and are shown for
          comparison.
        </p>
      </header>
      {q.isPending ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      ) : (
        <>
          <section
            aria-labelledby="recurring-h"
            className="grid gap-px overflow-hidden rounded-2xl border border-line-faint bg-line-faint sm:grid-cols-[1.4fr_1fr_1fr]"
          >
            <h2 id="recurring-h" className="sr-only">
              Recurring revenue
            </h2>
            <div className="bg-court-surface p-5">
              <p className="text-sm text-line-dim">Monthly recurring revenue</p>
              <p className="mt-1 text-5xl font-condensed text-ball tabular-nums">{formatMoney(q.data.mrr)}</p>
              <p className="mt-1 text-sm text-line-dim">{formatMoney(q.data.arr)} a year at this rate</p>
            </div>
            <div className="bg-court-surface p-5">
              <p className="text-sm text-line-dim">Paying venues</p>
              <p className="mt-1 text-3xl font-condensed tabular-nums">{q.data.paying_venues}</p>
              <p className="mt-1 text-sm text-line-dim">{q.data.trialing_venues} more on a free trial</p>
            </div>
            <div className="bg-court-surface p-5">
              <p className="text-sm text-line-dim">Not yet paid</p>
              <p className="mt-1 text-3xl font-condensed tabular-nums">{formatMoney(q.data.unpaid)}</p>
              {Number(q.data.overdue) > 0 ? (
                <Link
                  to="/billing?tab=invoices&status=overdue"
                  className="mt-1 block text-sm font-semibold text-signal-amber underline underline-offset-4"
                >
                  {formatMoney(q.data.overdue)} overdue
                </Link>
              ) : (
                <p className="mt-1 text-sm text-line-dim">Nothing overdue</p>
              )}
            </div>
          </section>

          <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
            <section aria-labelledby="months-h" className="min-w-0">
              <h2 id="months-h" className="text-xl font-expanded">
                By month
              </h2>
              <div className="relative mt-3 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <caption className="sr-only">Income by month, last 6 months</caption>
                  <thead>
                    <tr className="border-b-2 border-line text-left text-line-dim">
                      <th scope="col" className="py-2 font-medium">
                        Month
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        Subscriptions paid
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        Bookings paid at venues
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...q.data.by_month].reverse().map((m) => (
                      <tr key={m.month} className="border-b border-line-faint">
                        <th scope="row" className="py-3 text-left font-semibold">
                          {m.label}
                        </th>
                        <td className="py-3 text-right font-condensed tabular-nums">
                          {formatMoney(m.subscriptions_paid)}
                        </td>
                        <td className="py-3 text-right font-condensed text-line-dim tabular-nums">
                          {formatMoney(m.bookings_paid)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="plans-h">
              <h2 id="plans-h" className="text-xl font-expanded">
                By plan
              </h2>
              {q.data.by_plan.length === 0 ? (
                <p className="mt-3 text-line-dim">No paying venues yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line-faint border-y border-line-faint">
                  {q.data.by_plan.map((p) => (
                    <li key={p.code} className="flex items-center justify-between gap-3 py-3">
                      <span>
                        <span className="block font-semibold">{p.name}</span>
                        <span className="block text-sm text-line-dim">
                          {p.venues} paying {p.venues === 1 ? "venue" : "venues"}
                        </span>
                      </span>
                      <span className="font-condensed tabular-nums">{formatMoney(p.mrr)} a month</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to="/billing?tab=plans"
                className="mt-4 inline-block text-sm font-semibold text-ball underline underline-offset-4"
              >
                Manage plans
              </Link>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
