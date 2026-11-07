import { Link, useSearchParams } from "react-router";
import type { PlayerBooking, PlayerBookingTab } from "@courtflex/api";
import { formatTimeRange, usePlayerBookings } from "@courtflex/api";
import {
  BookingStatusBadge,
  EmptyState,
  ErrorState,
  PaymentDot,
  Skeleton,
  Tabs,
  cn,
  paymentStatusLabels,
} from "@courtflex/ui";
import { pesos } from "@courtflex/features";
import { TZ } from "./booking-labels";

const tabs: Array<{ value: PlayerBookingTab; label: string }> = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "cancelled", label: "Cancelled" },
];

const empty: Record<PlayerBookingTab, { title: string; body: string }> = {
  upcoming: { title: "No courts booked", body: "Find a court near you and pick a time." },
  past: { title: "No past bookings yet", body: "Games you've played show up here." },
  cancelled: { title: "Nothing cancelled", body: "Bookings you or a venue cancel show up here." },
};

/** Court bookings, split by what's coming, what's done and what was called off. */
export function MyBookingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = tabs.find((t) => t.value === params.get("tab"))?.value ?? "upcoming";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-expanded font-extrabold">My bookings</h1>
        <Link
          to="/courts"
          className="inline-flex h-11 items-center rounded-full bg-ball px-5 text-sm font-semibold text-ball-ink hover:bg-ball/90"
        >
          Book a court
        </Link>
      </div>
      <Tabs
        className="mt-6"
        label="Bookings"
        value={tab}
        onChange={(t) => setParams(t === "upcoming" ? {} : { tab: t }, { replace: true })}
        items={tabs}
      >
        {(t) => <BookingList tab={t} />}
      </Tabs>
    </div>
  );
}

function BookingList({ tab }: { tab: PlayerBookingTab }) {
  const list = usePlayerBookings(tab);
  if (list.isPending) return <Skeleton className="mt-6 h-48" />;
  if (list.error) return <ErrorState message={list.error.message} onRetry={() => list.refetch()} />;
  if (list.data.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          title={empty[tab].title}
          body={empty[tab].body}
          action={
            tab === "upcoming" ? (
              <Link to="/courts" className="font-semibold text-ball underline underline-offset-4">
                Find a court
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }
  return (
    <ul className="mt-2">
      {list.data.map((b) => (
        <li key={b.id} className="border-b court-line">
          <BookingRow booking={b} />
        </li>
      ))}
    </ul>
  );
}

function BookingRow({ booking: b }: { booking: PlayerBooking }) {
  const start = new Date(b.starts_at);
  const part = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-PH", { ...o, timeZone: TZ }).format(start);
  const off = b.status === "cancelled" || b.status === "expired";
  return (
    <Link
      to={`/bookings/${b.id}`}
      className="grid grid-cols-[3.5rem_1fr] items-center gap-4 py-4 hover:bg-court-surface sm:grid-cols-[3.5rem_1fr_auto]"
    >
      {/* Date block: weekday over the day number, like a scoreboard date. */}
      <span
        className={cn(
          "flex h-14 flex-col items-center justify-center rounded-sm border",
          b.status === "confirmed" || b.status === "pending"
            ? "border-line"
            : "border-line-faint text-line-dim",
        )}
      >
        <span className="text-xs">{part({ weekday: "short" })}</span>
        <span className="text-xl leading-none font-bold font-condensed">{part({ day: "numeric" })}</span>
        <span className="text-[0.65rem]">{part({ month: "short" })}</span>
      </span>
      <span className="min-w-0">
        <span className={cn("block font-semibold", off && "text-line-dim line-through")}>
          {formatTimeRange(b.starts_at, b.ends_at, TZ)}, {b.court.name}
        </span>
        <span className="block truncate text-sm text-line-dim">
          {b.venue.name}, code {b.booking_code}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-3 sm:hidden">
          <Badges booking={b} />
        </span>
      </span>
      <span className="hidden flex-col items-end gap-1.5 sm:flex">
        <span className="font-condensed">{pesos(b.total)}</span>
        <span className="flex items-center gap-3">
          <Badges booking={b} />
        </span>
      </span>
    </Link>
  );
}

/** Booking status and payment status are separate facts, so they get separate badges. */
function Badges({ booking: b }: { booking: PlayerBooking }) {
  return (
    <>
      <BookingStatusBadge status={b.status} />
      {b.status !== "cancelled" && (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
          <PaymentDot status={b.payment_status} />
          {paymentStatusLabels[b.payment_status]}
        </span>
      )}
    </>
  );
}
