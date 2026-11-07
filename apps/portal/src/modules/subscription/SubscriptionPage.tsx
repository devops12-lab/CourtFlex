import type { ClubSubscription, Entitlement } from "@courtflex/api";
import { formatDateShort, formatMoney, useSubscription, usePlatformSettings } from "@courtflex/api";
import { cn, DataTable, EmptyState, ErrorState, Skeleton, SubscriptionStatusBadge } from "@courtflex/ui";
import { useClubContext } from "../../app/club-context";
import { NotFoundPage } from "../clubs/NotFoundPage";

export function SubscriptionPage() {
  const { club, can } = useClubContext();
  const allowed = can("manageClubSubscription");
  const sub = useSubscription(club.id, allowed);

  if (!allowed) return <NotFoundPage message="Only the venue owner can see this venue's plan and billing." />;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-expanded font-bold sm:text-3xl">Plan and billing</h1>
      <p className="mt-1 max-w-prose text-line-dim">
        For {club.name} only. Each of your venues has its own plan, trial and invoices.
      </p>

      {sub.isPending && <Skeleton className="mt-8 h-64" />}
      {sub.error && (
        <div className="mt-8">
          <ErrorState message={sub.error.message} onRetry={() => sub.refetch()} />
        </div>
      )}
      {sub.data && <Body sub={sub.data} timeZone={club.timezone} />}
    </div>
  );
}

function Body({ sub, timeZone }: { sub: ClubSubscription; timeZone: string }) {
  const { settings } = usePlatformSettings();
  return (
    <>
      <section className="mt-8 border-t-2 border-line pt-6" aria-labelledby="plan-h">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="plan-h" className="text-xl font-expanded font-bold">
            {sub.plan.name}
          </h2>
          <SubscriptionStatusBadge status={sub.status} />
        </div>
        <p className="mt-2 text-lg font-condensed">
          {formatMoney(sub.plan.price)} per {sub.plan.billing_interval}
        </p>

        {sub.status === "trialing" && !sub.trial_starts_at && (
          <p className="mt-4 rounded-md border border-signal-amber/50 bg-signal-amber/10 p-4">
            Your {settings.trial_days}-day free trial of {sub.plan.name} starts when CourtFlex approves your
            venue. Nothing is charged during the trial.
          </p>
        )}
        {sub.status === "trialing" &&
          sub.trial_starts_at &&
          sub.trial_ends_at &&
          sub.trial_days_left !== null && (
            <TrialTrack
              start={sub.trial_starts_at}
              end={sub.trial_ends_at}
              daysLeft={sub.trial_days_left}
              timeZone={timeZone}
            />
          )}
        {sub.status !== "trialing" && sub.current_period_ends_at && (
          <p className="mt-4 text-line-dim">
            {sub.status === "expired" || sub.status === "cancelled" || sub.status === "suspended"
              ? `The plan ended ${formatDateShort(sub.current_period_ends_at, timeZone)}. Bookings, payments and courts are kept and can still be viewed; changes resume when the plan is renewed.`
              : `Current period ends ${formatDateShort(sub.current_period_ends_at, timeZone)}.`}
          </p>
        )}
      </section>

      <section className="mt-10" aria-labelledby="ent-h">
        <h2 id="ent-h" className="text-lg font-semibold">
          What this plan includes
        </h2>
        <dl className="mt-3 border-t court-line">
          {sub.entitlements.map((e) => (
            <EntitlementRow key={e.feature_key} e={e} />
          ))}
        </dl>
      </section>

      <section className="mt-10" aria-labelledby="inv-h">
        <h2 id="inv-h" className="text-lg font-semibold">
          Invoices
        </h2>
        <div className="mt-3">
          <DataTable
            caption={`Invoices for this venue's ${sub.plan.name} plan`}
            rows={sub.invoices}
            rowKey={(inv) => inv.id}
            empty={
              <EmptyState
                title="No invoices yet"
                body={
                  sub.trial_ends_at
                    ? `The trial is free. The first invoice is issued when it ends on ${formatDateShort(sub.trial_ends_at, timeZone)}.`
                    : "Invoices appear here once they're issued."
                }
              />
            }
            columns={[
              {
                key: "number",
                header: "Invoice",
                cell: (inv) => <span className="font-condensed">{inv.invoice_number}</span>,
              },
              {
                key: "issued",
                header: "Issued",
                cell: (inv) => formatDateShort(inv.issued_at, timeZone),
                hideOnMobile: true,
              },
              { key: "due", header: "Due", cell: (inv) => formatDateShort(inv.due_at, timeZone) },
              {
                key: "status",
                header: "Status",
                cell: (inv) => (
                  <span
                    className={cn(
                      inv.status === "paid"
                        ? "text-field"
                        : inv.status === "overdue"
                          ? "text-signal-red"
                          : "",
                    )}
                  >
                    {inv.status === "paid" && inv.paid_at
                      ? `Paid ${formatDateShort(inv.paid_at, timeZone)}`
                      : capitalize(inv.status)}
                  </span>
                ),
              },
              { key: "amount", header: "Amount", numeric: true, cell: (inv) => formatMoney(inv.amount) },
            ]}
            minWidth={360}
          />
        </div>
      </section>
    </>
  );
}

/** The 14 trial days drawn as a row of court segments: used days filled, today marked. */
function TrialTrack({
  start,
  end,
  daysLeft,
  timeZone,
}: {
  start: string;
  end: string;
  daysLeft: number;
  timeZone: string;
}) {
  const total = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000);
  const used = Math.min(Math.max(total - daysLeft, 0), total);
  return (
    <div className="mt-6">
      <p>
        <span className="text-3xl font-bold font-condensed">{daysLeft}</span>{" "}
        <span className="text-line-dim">
          of {total} trial days left. Ends {formatDateShort(end, timeZone)}.
        </span>
      </p>
      <div className="mt-3 flex h-3 gap-1" role="img" aria-label={`${used} of ${total} trial days used`}>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-[1px]",
              i < used ? "bg-line" : i === used ? "bg-ball" : "border border-line-faint",
            )}
          />
        ))}
      </div>
      <p className="mt-3 max-w-prose text-sm text-line-dim">
        Nothing is deleted if the trial ends. The venue becomes read-only until a plan is active, and every
        booking and payment record stays available.
      </p>
    </div>
  );
}

function EntitlementRow({ e }: { e: Entitlement }) {
  const value =
    e.limit_value === "included"
      ? "Included"
      : e.limit_value === "not_included"
        ? "Not on this plan"
        : e.limit_value === "unlimited"
          ? "Unlimited"
          : e.usage !== undefined
            ? `${e.usage} of ${e.limit_value} used`
            : `Up to ${e.limit_value}`;
  return (
    <div className="flex justify-between gap-4 border-b court-line py-3">
      <dt>{e.label}</dt>
      <dd className={cn("font-condensed", e.limit_value === "not_included" && "text-line-dim")}>{value}</dd>
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
