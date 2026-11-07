import { Link } from "react-router";
import { Plus } from "lucide-react";
import type { CalendarBlock, DailySummary } from "@courtflex/api";
import {
  formatDateLong,
  formatMoney,
  formatTime,
  paymentMethodLabels,
  todayIn,
  useCalendar,
  useDailySummary,
} from "@courtflex/api";
import { Button, EmptyState, ErrorState, PaymentStatusBadge, Skeleton, useOnline } from "@courtflex/ui";
import { useClubContext } from "../../app/club-context";
import { CourtTimeline } from "../bookings/CourtTimeline";
import { useBookingSheets } from "../bookings/BookingSheets";
import { useNow } from "../bookings/use-now";
import { formatDateShort, useOrganizerSessions, useReceiptsToCheck } from "@courtflex/api";
import { CapacityPips } from "@courtflex/features";

export function TodayPage() {
  const { club, can } = useClubContext();
  const tz = club.timezone;
  const today = todayIn(tz);
  const calendar = useCalendar(club.id, today);
  const summary = useDailySummary(club.id, today);
  const { openBooking, openWalkIn, sheets } = useBookingSheets();
  const online = useOnline();
  const canWalkIn = can("createWalkInBooking") && !club.read_only && club.settings.allow_walk_ins && online;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-expanded font-bold sm:text-3xl">{formatDateLong(today, tz)}</h1>
          <p className="mt-1 text-line-dim">
            {summary.data ? <DaySentence summary={summary.data} /> : "Loading today's courts"}
          </p>
        </div>
        {canWalkIn && (
          <Button variant="primary" onClick={() => openWalkIn({ date: today })}>
            <Plus className="size-4" aria-hidden />
            New walk-in
          </Button>
        )}
      </div>

      <ReceiptsToCheck onOpen={openBooking} />

      <section aria-labelledby="board-h" className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="board-h" className="text-lg font-semibold">
            Court board
          </h2>
          <Link
            to="bookings"
            className="tap text-sm font-semibold text-line-dim underline underline-offset-4 hover:text-line"
          >
            Open full calendar
          </Link>
        </div>
        {calendar.isPending && <Skeleton className="h-60" />}
        {calendar.error && <ErrorState message={calendar.error.message} onRetry={() => calendar.refetch()} />}
        {calendar.data && (
          <CourtTimeline day={calendar.data} timeZone={tz} onOpenBooking={(id) => openBooking(id)} />
        )}
      </section>

      <OpenPlayToday />

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="next-h">
          <h2 id="next-h" className="mb-3 text-lg font-semibold">
            Up next
          </h2>
          {calendar.isPending && <Skeleton className="h-48" />}
          {calendar.data && (
            <UpNext
              blocks={calendar.data.blocks}
              courtName={(id) => calendar.data.courts.find((c) => c.id === id)?.name ?? "Court"}
              onOpen={openBooking}
              canPay={can("recordOnsitePayment") && !club.read_only && online}
              onWalkIn={canWalkIn ? () => openWalkIn({ date: today }) : undefined}
            />
          )}
        </section>

        <section aria-labelledby="money-h">
          <h2 id="money-h" className="mb-3 text-lg font-semibold">
            Collected today
          </h2>
          {summary.isPending && <Skeleton className="h-48" />}
          {summary.error && <ErrorState message={summary.error.message} onRetry={() => summary.refetch()} />}
          {summary.data && <Ledger summary={summary.data} />}
        </section>
      </div>
      {sheets}
    </div>
  );
}

function DaySentence({ summary }: { summary: DailySummary }) {
  const booked = Math.round(summary.booked_hours * 10) / 10;
  return (
    <>
      {summary.bookings_count} {summary.bookings_count === 1 ? "booking" : "bookings"}, {booked} of{" "}
      {summary.open_hours} court hours taken
    </>
  );
}

function UpNext({
  blocks,
  courtName,
  onOpen,
  canPay,
  onWalkIn,
}: {
  blocks: CalendarBlock[];
  courtName: (id: string) => string;
  onOpen: (id: string, pay?: boolean) => void;
  canPay: boolean;
  onWalkIn?: () => void;
}) {
  const { club } = useClubContext();
  const now = useNow();
  const upcoming = blocks
    .filter(
      (b) =>
        b.booking &&
        new Date(b.ends_at) > now &&
        (b.booking.status === "confirmed" || b.booking.status === "pending"),
    )
    .slice(0, 6);

  if (upcoming.length === 0) {
    return (
      <EmptyState
        title="No more bookings today"
        body="Every remaining court hour is open. Walk-ins can be added from here."
        action={
          onWalkIn && (
            <Button size="sm" onClick={onWalkIn}>
              New walk-in
            </Button>
          )
        }
      />
    );
  }

  return (
    <ul className="border-t-2 border-line">
      {upcoming.map((block) => {
        const b = block.booking!;
        const playing = new Date(b.starts_at) <= now;
        const owes = Number(b.balance_due) > 0;
        return (
          <li key={b.id} className="flex items-center gap-4 border-b court-line py-3">
            <button
              type="button"
              onClick={() => onOpen(b.id)}
              className="flex min-w-0 flex-1 items-center gap-4 text-left"
            >
              <span className="w-20 shrink-0">
                <span className="block text-xl leading-none font-bold font-condensed">
                  {formatTime(b.starts_at, club.timezone)}
                </span>
                <span className="mt-1 block text-xs text-line-dim">
                  {playing ? "On court now" : courtName(b.court_id)}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold hover:underline">{block.label}</span>
                <span className="flex items-center gap-3 text-sm text-line-dim">
                  {playing && <span>{courtName(b.court_id)}</span>}
                  <PaymentStatusBadge status={b.payment_status} />
                  {b.status === "pending" && <span className="text-signal-amber">Awaiting confirmation</span>}
                </span>
              </span>
            </button>
            {owes && canPay && (
              <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-sm font-condensed text-line-dim">{formatMoney(b.balance_due)} due</span>
                <Button size="sm" onClick={() => onOpen(b.id, true)}>
                  Record payment
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Ledger({ summary }: { summary: DailySummary }) {
  return (
    <div className="border-t-2 border-line">
      <p className="pt-4 text-4xl leading-none font-bold font-condensed">
        {formatMoney(summary.collected_total)}
      </p>
      <p className="mt-1 text-sm text-line-dim">Recorded by staff at the venue</p>
      <dl className="mt-5 flex flex-col">
        {summary.by_method.length === 0 && (
          <p className="py-2 text-sm text-line-dim">No payments recorded yet today.</p>
        )}
        {summary.by_method.map((m) => (
          <div key={m.method} className="flex justify-between border-t court-line py-2.5 text-sm">
            <dt>{paymentMethodLabels[m.method]}</dt>
            <dd className="font-condensed">{formatMoney(m.amount)}</dd>
          </div>
        ))}
        <div className="flex justify-between border-t-2 border-line py-3">
          <dt className="font-semibold">Still to collect</dt>
          <dd className="text-lg font-bold font-condensed">{formatMoney(summary.balance_due_total)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Today's open play on this venue's courts, with how full each session is. */
function OpenPlayToday() {
  const { club, can } = useClubContext();
  const sessions = useOrganizerSessions("venue", club.id, "upcoming");
  const visible = can("manageOpenPlay") || can("checkInOpenPlay") || can("approvePlayerOpenPlay");
  const today = todayIn(club.timezone);
  const todays = (sessions.data ?? []).filter((s) => todayIn(club.timezone, new Date(s.starts_at)) === today);
  if (!visible || todays.length === 0) return null;
  return (
    <section aria-labelledby="op-today-h" className="mt-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="op-today-h" className="text-lg font-semibold">
          Open play today
        </h2>
        <Link
          to="open-play"
          className="tap text-sm font-semibold text-line-dim underline underline-offset-4 hover:text-line"
        >
          All sessions
        </Link>
      </div>
      <ul className="border-t-2 border-line">
        {todays.map((s) => (
          <li key={s.id} className="border-b court-line">
            <Link
              to={`open-play/${s.id}`}
              className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3 hover:bg-court-surface"
            >
              <span className="w-36 shrink-0 text-lg font-bold font-condensed">
                {formatTime(s.starts_at, club.timezone)}
                {s.status === "live" && (
                  <span className="ml-2 rounded-sm bg-ball px-1.5 py-0.5 text-xs text-ball-ink">Live</span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{s.title}</span>
                <span className="block text-sm text-line-dim">
                  {s.organizer.type === "community" ? `${s.organizer.name}, ` : ""}
                  {s.courts.map((c) => c.name).join(" and ")}
                </span>
              </span>
              <CapacityPips taken={s.registered_count} capacity={s.capacity} waitlist={s.waitlist_count} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** GCash and Maya receipts players sent, oldest first. Each holds a court until someone checks it. */
function ReceiptsToCheck({ onOpen }: { onOpen: (id: string) => void }) {
  const { club } = useClubContext();
  const receipts = useReceiptsToCheck(club.id);
  const list = receipts.data ?? [];
  if (!list.length) return null;
  return (
    <section
      aria-labelledby="receipts-h"
      className="mt-8 rounded-[22px] border border-signal-amber/50 bg-signal-amber/5 p-5"
    >
      <h2 id="receipts-h" className="text-lg font-semibold">
        Receipts to check <span className="text-signal-amber">({list.length})</span>
      </h2>
      <p className="text-sm text-line-dim">Each one holds a court until you approve it or turn it down.</p>
      <ul className="mt-3 flex flex-col divide-y divide-line-faint">
        {list.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span>
              <span className="block font-semibold">
                {b.player?.name ?? b.guest_name ?? "Guest"}, {formatMoney(b.total)} by{" "}
                {b.payment_method === "maya" ? "Maya" : "GCash"}
              </span>
              <span className="text-sm text-line-dim">
                {b.booking_code}, {formatTime(b.starts_at, club.timezone)} on{" "}
                {formatDateShort(b.starts_at, club.timezone)}. Ref {b.receipt?.reference_number}
              </span>
            </span>
            <Button size="sm" variant="primary" onClick={() => onOpen(b.id)}>
              Check receipt
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
