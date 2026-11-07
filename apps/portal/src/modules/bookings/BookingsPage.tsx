import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useSearchParams } from "react-router";
import { formatDateLong, shiftDate, todayIn, useCalendar } from "@courtflex/api";
import { Button, ErrorState, Input, PaymentDot, Skeleton, useOnline } from "@courtflex/ui";
import { useClubContext } from "../../app/club-context";
import { CourtGrid } from "./CourtGrid";
import { useBookingSheets } from "./BookingSheets";

export function BookingsPage() {
  const { club, can } = useClubContext();
  const tz = club.timezone;
  const today = todayIn(tz);
  const [params, setParams] = useSearchParams();
  const date = params.get("date") ?? today;
  const setDate = (d: string) => setParams(d === today ? {} : { date: d }, { replace: true });
  const calendar = useCalendar(club.id, date);
  const { openBooking, openWalkIn, sheets } = useBookingSheets();
  const online = useOnline();
  const canWalkIn = can("createWalkInBooking") && !club.read_only && club.settings.allow_walk_ins && online;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-expanded font-bold sm:text-3xl">Bookings</h1>
          <p className="mt-1 text-line-dim">
            {formatDateLong(date, tz)}
            {date === today ? ", today" : ""}
          </p>
        </div>
        {canWalkIn && (
          <Button variant="primary" onClick={() => openWalkIn({ date })}>
            <Plus className="size-4" aria-hidden />
            New walk-in
          </Button>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setDate(shiftDate(date, -1))}
          aria-label="Previous day"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          size="sm"
          variant={date === today ? "ghost" : "secondary"}
          onClick={() => setDate(today)}
          disabled={date === today}
        >
          Today
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setDate(shiftDate(date, 1))}
          aria-label="Next day"
        >
          <ChevronRight className="size-4" />
        </Button>
        <label className="sr-only" htmlFor="cal-date">
          Go to date
        </label>
        <Input
          id="cal-date"
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="h-9 w-auto text-sm"
        />
        <Legend />
      </div>

      <div className="mt-5">
        {calendar.isPending && <Skeleton className="h-[480px]" />}
        {calendar.error && <ErrorState message={calendar.error.message} onRetry={() => calendar.refetch()} />}
        {calendar.data && (
          <CourtGrid
            day={calendar.data}
            timeZone={tz}
            onOpenBooking={(id) => openBooking(id)}
            onPickSlot={
              canWalkIn ? (courtId, startsAt) => openWalkIn({ courtId, startsAt, date }) : undefined
            }
          />
        )}
      </div>
      {sheets}
    </div>
  );
}

function Legend() {
  return (
    <ul
      className="ml-auto hidden flex-wrap items-center gap-x-5 gap-y-2 text-xs text-line-dim lg:flex"
      aria-label="Legend"
    >
      <li className="flex items-center gap-1.5">
        <PaymentDot status="unpaid" /> Unpaid
      </li>
      <li className="flex items-center gap-1.5">
        <PaymentDot status="partially_paid" /> Part paid
      </li>
      <li className="flex items-center gap-1.5">
        <PaymentDot status="paid" /> Paid
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-3 w-4 rounded-[2px] border-l-[3px] border-court-outer-bright bg-court-outer" />{" "}
        Open play
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-3 w-4 rounded-[2px] border border-line-faint bg-[repeating-linear-gradient(135deg,var(--color-line-faint)_0_3px,transparent_3px_6px)]" />
        Maintenance
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-3 w-4 rounded-[2px] border border-dashed border-signal-amber" /> Pending
      </li>
    </ul>
  );
}
