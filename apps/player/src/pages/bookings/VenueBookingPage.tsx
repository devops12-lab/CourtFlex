import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutGrid,
  MapPin,
  Navigation,
  RefreshCw,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";
import type {
  BookingMinutes,
  BookingPayMethod,
  GuestCodeSent,
  PriceChangedDetails,
  SlotTakenDetails,
  VenueBookingDay,
} from "@courtflex/api";
import {
  ApiError,
  formatDateLong,
  formatTime,
  formatTimeRange,
  shiftDate,
  todayIn,
  useBookingQuote,
  useCreateBooking,
  useCreateGuestBooking,
  useMe,
  useSendGuestCode,
  useVenueBookingDay,
} from "@courtflex/api";
import { Button, cn, ErrorState, Field, Input, Skeleton, Textarea, useOnline } from "@courtflex/ui";
import { ClubCover, pesos } from "@courtflex/features";
import { NotFound } from "../NotFound";
import { TZ } from "./booking-labels";
import { rememberGuest } from "./FindBookingPage";

type Step = "schedule" | "details" | "payment" | "review";
const PLAYER_STEPS: Array<{ value: Step; label: string }> = [
  { value: "schedule", label: "Schedule" },
  { value: "payment", label: "Payment" },
  { value: "review", label: "Review" },
];
/** Booking without an account adds a step for name, mobile and email. */
const GUEST_STEPS: Array<{ value: Step; label: string }> = [
  { value: "schedule", label: "Schedule" },
  { value: "details", label: "Details" },
  { value: "payment", label: "Payment" },
  { value: "review", label: "Review" },
];

export interface GuestInfo {
  name: string;
  phone: string;
  email: string;
}
const PHONE_RE = /^(\+?63|0)9\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function guestProblems(g: GuestInfo) {
  const e: Partial<Record<keyof GuestInfo, string>> = {};
  if (g.name.trim().length < 2) e.name = "Enter your full name.";
  if (!PHONE_RE.test(g.phone.replace(/[\s-]/g, ""))) e.phone = "Enter a mobile number, like 09171234567.";
  if (!EMAIL_RE.test(g.email.trim())) e.email = "Enter a valid email. Your booking code is sent there.";
  return e;
}
const MAX_HOURS = 3;

export const payLabels: Record<BookingPayMethod, { title: string; body: string }> = {
  pay_at_court: {
    title: "Pay at the court",
    body: "Confirmed straight away. Pay at the front desk before you play.",
  },
  gcash: {
    title: "GCash",
    body: "We hold the court for 30 minutes while you send the payment and upload the receipt.",
  },
  maya: {
    title: "Maya",
    body: "We hold the court for 30 minutes while you send the payment and upload the receipt.",
  },
};

export function methodsOf(p: VenueBookingDay["venue"]["payments"]): BookingPayMethod[] {
  return [
    ...(p.pay_at_court && !p.require_prepayment ? (["pay_at_court"] as const) : []),
    ...(p.gcash ? (["gcash"] as const) : []),
    ...(p.maya ? (["maya"] as const) : []),
  ];
}

/**
 * Book a court at a venue: pick a date and a run of free hours on one court,
 * choose how to pay, then review the server's price and confirm. Anyone can
 * look; continuing past the schedule asks visitors to sign in.
 */
export function VenueBookingPage() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const today = todayIn(TZ);
  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") && params.get("date")! >= today
      ? params.get("date")!
      : today;
  const day = useVenueBookingDay(slug, date);

  if (day.isPending && !day.data) return <Skeleton className="mx-auto h-[40rem] max-w-6xl rounded-[28px]" />;
  if (day.error && !day.data) {
    return day.error instanceof ApiError && day.error.status === 404 ? (
      <NotFound message="This venue isn't listed on CourtFlex." />
    ) : day.error instanceof ApiError && day.error.status === 422 ? (
      <div className="mx-auto max-w-xl">
        <ErrorState message={day.error.field("date") ?? day.error.message} onRetry={() => setParams({})} />
      </div>
    ) : (
      <ErrorState message={day.error.message} onRetry={() => day.refetch()} />
    );
  }
  return (
    <Booker
      day={day.data!}
      refreshing={day.isFetching}
      onRefresh={() => day.refetch()}
      params={params}
      setParams={setParams}
    />
  );
}

function Booker({
  day,
  refreshing,
  onRefresh,
  params,
  setParams,
}: {
  day: VenueBookingDay;
  refreshing: boolean;
  onRefresh: () => void;
  params: URLSearchParams;
  setParams: ReturnType<typeof useSearchParams>[1];
}) {
  const v = day.venue;
  const me = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const methods = methodsOf(v.payments);

  // Visitors book as guests where the venue allows it; elsewhere they sign in first.
  const asGuest = !me.data && v.guest_booking;
  const STEPS = asGuest ? GUEST_STEPS : PLAYER_STEPS;
  const step = (STEPS.some((s) => s.value === params.get("step")) ? params.get("step") : "schedule") as Step;
  const courtId = params.get("court");
  const start = params.get("start");
  const hours = Math.min(MAX_HOURS, Math.max(1, Number(params.get("hours") ?? 1) || 1));
  const pay = (methods.find((m) => m === params.get("pay")) ?? methods[0] ?? null) as BookingPayMethod | null;
  const [notes, setNotes] = useState("");
  // Guest details stay in the page, never in the address.
  const [guest, setGuest] = useState<GuestInfo>({ name: "", phone: "", email: "" });
  const [showGuestErrors, setShowGuestErrors] = useState(false);
  const guestErrors = guestProblems(guest);
  const guestValid = Object.keys(guestErrors).length === 0;

  // Built on the address as it is now, not as it was at the last render: two quick
  // changes in a row (choose GCash, then Continue) must not undo each other.
  const set = (next: Record<string, string | null>) =>
    setParams(
      () => {
        const n = new URLSearchParams(window.location.search);
        for (const [k, val] of Object.entries(next)) {
          if (val === null) n.delete(k);
          else n.set(k, val);
        }
        return n;
      },
      { replace: true },
    );

  // The selection is valid only while every hour in it is still free.
  const court = day.courts.find((c) => c.id === courtId);
  const startIndex = court ? court.cells.findIndex((c) => c?.starts_at === start) : -1;
  const picked = court && startIndex >= 0 ? court.cells.slice(startIndex, startIndex + hours) : [];
  const valid = picked.length === hours && picked.every((c) => c?.state === "available");
  const selection =
    valid && court
      ? {
          court,
          startsAt: picked[0]!.starts_at,
          endsAt: picked[picked.length - 1]!.ends_at,
          total: picked.reduce((sum, c) => sum + Number(c!.price), 0),
          minutes: (hours * 60) as BookingMinutes,
        }
      : null;

  const choose = (courtIdx: number, rowIdx: number) => {
    const c = day.courts[courtIdx]!;
    const cell = c.cells[rowIdx];
    if (!cell || cell.state !== "available") return;
    // Tapping the hour right after the selection extends it; anything else starts again.
    if (selection && c.id === selection.court.id) {
      if (rowIdx === startIndex + hours && hours < MAX_HOURS) return set({ hours: String(hours + 1) });
      if (rowIdx === startIndex + hours - 1 && hours > 1) return set({ hours: String(hours - 1) });
      if (rowIdx === startIndex && hours === 1) return set({ court: null, start: null, hours: null });
    }
    set({ court: c.id, start: cell.starts_at, hours: "1" });
  };

  const goStep = (s: Step) => {
    if (s !== "schedule" && !me.data && !asGuest) {
      // This venue asks everyone to sign in. Come back to the same choice after signing in.
      const back = new URLSearchParams(params);
      back.set("step", s);
      navigate("/login", { state: { from: `${location.pathname}?${back}` } });
      return;
    }
    set({ step: s === "schedule" ? null : s });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const stepIndex = STEPS.findIndex((s) => s.value === step);
  const canContinue =
    step === "schedule"
      ? !!selection
      : step === "details"
        ? !!selection
        : step === "payment"
          ? !!selection && !!pay
          : false;
  const next = () => {
    if (step === "details" && !guestValid) return setShowGuestErrors(true);
    goStep(STEPS[stepIndex + 1]!.value);
  };

  return (
    <div className="mx-auto max-w-6xl pb-28">
      <VenueHeader day={day} />

      <ol aria-label="Steps" className="mx-auto mt-6 grid max-w-md grid-cols-3">
        {STEPS.map((s, i) => (
          <li
            key={s.value}
            aria-current={i === stepIndex ? "step" : undefined}
            className="flex flex-col items-center gap-1.5"
          >
            <span
              className={cn(
                "grid size-9 place-items-center rounded-full text-sm font-bold",
                i < stepIndex && "bg-field text-court-deep",
                i === stepIndex && "bg-ball text-ball-ink",
                i > stepIndex && "bg-court-raised text-line-dim",
              )}
            >
              {i < stepIndex ? <Check className="size-4" aria-label="Done" /> : i + 1}
            </span>
            <span className={cn("text-sm font-semibold", i === stepIndex ? "text-line" : "text-line-dim")}>
              {s.label}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          {!v.bookable ? (
            <section role="status" className="rounded-[24px] border border-line-faint bg-court-surface p-6">
              <h2 className="text-xl font-expanded">Not bookable in the app yet</h2>
              <p className="mt-1 text-line-dim">
                {v.name} doesn't take bookings on CourtFlex yet. Call them to book at {v.contact_phone}.
              </p>
            </section>
          ) : step === "schedule" ? (
            <Schedule
              day={day}
              selection={selection}
              startIndex={startIndex}
              refreshing={refreshing}
              onRefresh={onRefresh}
              onDate={(d) => set({ date: d, court: null, start: null, hours: null })}
              onChoose={choose}
            />
          ) : !selection ? (
            <Gone onBack={() => goStep("schedule")} />
          ) : step === "details" ? (
            <DetailsStep
              guest={guest}
              onChange={setGuest}
              errors={showGuestErrors ? guestErrors : {}}
              signInTo={`${location.pathname}?${new URLSearchParams({ ...Object.fromEntries(params), step: "payment" })}`}
            />
          ) : step === "payment" ? (
            <PaymentStep
              venue={v}
              methods={methods}
              pay={pay}
              onPay={(m) => set({ pay: m })}
              notes={notes}
              onNotes={setNotes}
            />
          ) : (
            <Review
              venueName={v.name}
              selection={selection}
              pay={pay!}
              notes={notes}
              guest={asGuest ? guest : null}
              onBack={() => goStep("payment")}
              onPick={(cId, s) => set({ court: cId, start: s, step: "review" })}
            />
          )}
        </div>

        <Summary day={day} selection={selection} pay={step === "schedule" ? null : pay} />
      </div>

      {/* Sticky bar: what's chosen, the total, and the next step. */}
      {v.bookable && (
        <div
          className={cn(
            "fixed inset-x-0 z-30 border-t court-line bg-court-deep/95 px-4 py-3 backdrop-blur",
            // Signed in on a phone, the app's tab bar sits at the bottom: stay above it.
            me.data
              ? "bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0"
              : "bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          )}
        >
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => goStep(STEPS[stepIndex - 1]!.value)}
                className="grid size-11 shrink-0 place-items-center rounded-full border border-line-faint hover:bg-court-raised"
                aria-label="Back"
              >
                <ArrowLeft className="size-5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              {selection ? (
                <>
                  <p className="truncate text-sm font-semibold">
                    {formatDateLong(day.date, TZ)},{" "}
                    {formatTimeRange(selection.startsAt, selection.endsAt, TZ)}
                  </p>
                  <p className="truncate text-xs text-line-dim">
                    {selection.court.name}, {hours} {hours === 1 ? "hour" : "hours"}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold">Choose your schedule</p>
                  <p className="text-xs text-line-dim">Pick a date, a court and a start time</p>
                </>
              )}
            </div>
            {selection && (
              <div className="text-right">
                <p className="text-[0.7rem] font-semibold tracking-wide text-line-dim uppercase">Total</p>
                <p className="text-xl font-extrabold font-condensed">{pesos(selection.total)}</p>
              </div>
            )}
            {step !== "review" && (
              <Button variant="primary" size="lg" disabled={!canContinue} onClick={next}>
                Continue
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function VenueHeader({ day }: { day: VenueBookingDay }) {
  const v = day.venue;
  return (
    <header className="grid gap-5 rounded-[28px] border border-line-faint bg-court-surface p-3 sm:p-4 md:grid-cols-[minmax(0,1.3fr)_1fr]">
      <div className="h-40 overflow-hidden rounded-[22px] bg-court-outer sm:h-56">
        <ClubCover name={v.name} url={v.cover_url} className="h-full w-full" />
      </div>
      <div className="flex flex-col p-2 sm:p-3">
        <p className="text-xs font-bold tracking-[0.18em] text-ball uppercase">Pickleball venue</p>
        <h1 className="mt-2 text-3xl leading-tight font-expanded">{v.name}</h1>
        <p className="mt-2 flex gap-1.5 text-sm text-line-dim">
          <MapPin className="mt-0.5 size-4 shrink-0 text-field" aria-hidden />
          {v.address}, {v.city}, {v.province}
        </p>
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${v.latitude},${v.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-ball underline-offset-4 hover:underline"
        >
          <Navigation className="tap size-4" aria-hidden />
          Directions
        </a>
        <dl className="mt-auto grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2 pt-5">
          <Tile icon={Wallet} label="Base rate" value={`${pesos(v.price_from)}/hr`} />
          <Tile
            icon={LayoutGrid}
            label="Courts"
            value={`${day.courts.length} ${day.courts.length === 1 ? "court" : "courts"}`}
          />
          <Tile icon={CalendarDays} label="Booking" value={v.bookable ? "Online" : "By phone"} />
        </dl>
      </div>
    </header>
  );
}

function Tile({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line-faint bg-court-deep/50 px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-wide text-line-dim uppercase">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-bold [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

type Selection = {
  court: VenueBookingDay["courts"][number];
  startsAt: string;
  endsAt: string;
  total: number;
  minutes: BookingMinutes;
};

function Schedule({
  day,
  selection,
  startIndex,
  refreshing,
  onRefresh,
  onDate,
  onChoose,
}: {
  day: VenueBookingDay;
  selection: Selection | null;
  startIndex: number;
  refreshing: boolean;
  onRefresh: () => void;
  onDate: (d: string) => void;
  onChoose: (courtIdx: number, rowIdx: number) => void;
}) {
  const today = todayIn(TZ);
  const dates = useMemo(
    () =>
      Array.from({ length: Math.min(day.venue.booking_window_days + 1, 30) }, (_, i) => shiftDate(today, i)),
    [today, day.venue.booking_window_days],
  );
  const strip = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => strip.current?.scrollBy({ left: dir * 280, behavior: "smooth" });
  const hours = selection ? selection.minutes / 60 : 0;

  return (
    <section
      aria-labelledby="sched-h"
      className="overflow-hidden rounded-[24px] border border-line-faint bg-court-surface"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b court-line p-5">
        <div>
          <h2 id="sched-h" className="text-2xl font-expanded">
            Book a court
          </h2>
          <p className="mt-1 text-sm text-line-dim">
            Pick a date, then a court and a start time from the grid.
          </p>
        </div>
        <span className="rounded-full border border-line-faint px-3 py-1 text-xs font-semibold text-line-dim">
          Philippine time
        </span>
      </div>

      <div className="border-b court-line p-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scroll(-1)}
            className="hidden size-10 shrink-0 place-items-center rounded-full border border-line-faint hover:bg-court-raised sm:grid"
            aria-label="Earlier dates"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div
            ref={strip}
            role="radiogroup"
            aria-label="Date"
            className="flex flex-1 [scrollbar-width:none] gap-2 overflow-x-auto pb-1"
          >
            {dates.map((d) => {
              const on = d === day.date;
              const dt = new Date(`${d}T12:00:00+08:00`);
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={formatDateLong(d, TZ)}
                  onClick={() => onDate(d)}
                  className={cn(
                    "flex w-16 shrink-0 flex-col items-center rounded-2xl border py-2 transition-colors",
                    on ? "border-ball bg-ball text-ball-ink" : "border-line-faint hover:border-line-dim",
                  )}
                >
                  <span className={cn("text-xs", on ? "font-semibold" : "text-line-dim")}>
                    {dt.toLocaleDateString("en-PH", { weekday: "short", timeZone: TZ })}
                  </span>
                  <span className="text-sm font-bold">
                    {dt.toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: TZ })}
                  </span>
                  {d === today && (
                    <span className={cn("text-[0.65rem] font-bold", on ? "" : "text-ball")}>Today</span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => scroll(1)}
            className="hidden size-10 shrink-0 place-items-center rounded-full border border-line-faint hover:bg-court-raised sm:grid"
            aria-label="Later dates"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-xs text-line-dim">Book up to {day.venue.booking_window_days} days ahead</p>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">{formatDateLong(day.date, TZ)}</h3>
            <p className="text-sm text-line-dim">
              Tap a start time. Tap the next hour to make it longer, up to {MAX_HOURS} hours.
            </p>
          </div>
          <Button size="sm" onClick={onRefresh} loading={refreshing}>
            {!refreshing && <RefreshCw className="size-4" aria-hidden />}
            Refresh
          </Button>
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-line-dim" aria-label="Key">
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-field/70" />
            Available
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-ball" />
            Selected
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-court-raised" />
            Booked or unavailable
          </li>
          <li className="flex items-center gap-1.5">
            <Zap className="size-3 text-ball" />
            Different rate
          </li>
        </ul>

        {day.rows.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-line-faint p-5 text-line-dim">
            {day.venue.name} is closed on this date. Choose another day.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line-faint">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="bg-court-deep/40">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 w-36 bg-court-surface px-3 py-3 text-left text-xs font-semibold tracking-wide text-line-dim uppercase"
                  >
                    Time
                  </th>
                  {day.courts.map((c) => (
                    <th
                      key={c.id}
                      scope="col"
                      className="min-w-36 border-l border-line-faint px-3 py-3 text-left"
                    >
                      <span className="block font-bold">{c.name}</span>
                      <span className="block text-xs font-normal text-line-dim">
                        {c.indoor_outdoor === "indoor" ? "Indoor" : "Outdoor"}, base {pesos(c.base_price)}/hr
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {day.rows.map((row, r) => {
                  const any = day.courts.find((c) => c.cells[r])?.cells[r];
                  return (
                    <tr key={row} className="border-t border-line-faint">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-court-surface px-3 py-2 text-left text-xs font-semibold font-condensed whitespace-nowrap text-line-dim"
                      >
                        {any ? formatTimeRange(any.starts_at, any.ends_at, TZ) : row}
                      </th>
                      {day.courts.map((c, ci) => {
                        const cell = c.cells[r];
                        const on =
                          !!selection &&
                          selection.court.id === c.id &&
                          r >= startIndex &&
                          r < startIndex + hours;
                        if (!cell)
                          return (
                            <td
                              key={c.id}
                              className="border-l border-line-faint bg-court-deep/40 px-2 text-center text-xs text-line-dim/70"
                            >
                              Closed
                            </td>
                          );
                        return (
                          <td key={c.id} className="border-l border-line-faint p-1">
                            {cell.state === "available" ? (
                              <button
                                type="button"
                                aria-pressed={on}
                                aria-label={`${c.name}, ${formatTimeRange(cell.starts_at, cell.ends_at, TZ)}, ${pesos(cell.price)}`}
                                onClick={() => onChoose(ci, r)}
                                className={cn(
                                  "flex h-11 w-full items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors",
                                  on ? "bg-ball text-ball-ink" : "bg-field/10 text-field hover:bg-field/20",
                                )}
                              >
                                {on ? (
                                  <Check className="size-4" aria-hidden />
                                ) : (
                                  cell.special_rate && <Zap className="size-3.5 text-ball" aria-hidden />
                                )}
                                {pesos(cell.price)}
                              </button>
                            ) : (
                              <span className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-court-raised/40 text-xs text-line-dim">
                                <Clock className="size-3.5" aria-hidden />
                                {cell.state === "booked" ? "Booked" : "Unavailable"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {selection && (
          <p role="status" className="mt-4 rounded-2xl border border-ball/40 bg-ball/10 px-4 py-3 text-sm">
            <span className="font-semibold">
              {hours} {hours === 1 ? "hour" : "hours"} selected
            </span>{" "}
            on {selection.court.name}, {formatTimeRange(selection.startsAt, selection.endsAt, TZ)}
          </p>
        )}
      </div>
    </section>
  );
}

function PaymentStep({
  venue,
  methods,
  pay,
  onPay,
  notes,
  onNotes,
}: {
  venue: VenueBookingDay["venue"];
  methods: BookingPayMethod[];
  pay: BookingPayMethod | null;
  onPay: (m: BookingPayMethod) => void;
  notes: string;
  onNotes: (s: string) => void;
}) {
  return (
    <section
      aria-labelledby="pay-h"
      className="rounded-[24px] border border-line-faint bg-court-surface p-5 sm:p-6"
    >
      <h2 id="pay-h" className="flex items-center gap-2 text-2xl font-expanded">
        How you'll pay
      </h2>
      <p className="mt-1 text-sm text-line-dim">
        {venue.payments.require_prepayment
          ? `${venue.name} asks for payment before play.`
          : `Choose one of the ways ${venue.name} takes payment.`}{" "}
        No CourtFlex booking fee.
      </p>
      {methods.length === 0 ? (
        <p className="mt-4 text-signal-amber">
          {venue.name} hasn't set up payments in the app yet. Call them to book.
        </p>
      ) : (
        <div role="radiogroup" aria-label="Payment" className="mt-5 flex flex-col gap-3">
          {methods.map((m) => {
            const on = pay === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onPay(m)}
                className={cn(
                  "flex items-start gap-4 rounded-2xl border p-4 text-left transition-colors",
                  on ? "border-ball bg-ball/[0.07]" : "border-line-faint hover:border-line-dim",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2",
                    on ? "border-ball bg-ball" : "border-line-dim",
                  )}
                >
                  {on && <Check className="size-3 text-ball-ink" />}
                </span>
                <span>
                  <span className="block font-bold">{payLabels[m].title}</span>
                  <span className="block text-sm text-line-dim">{payLabels[m].body}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <Field label="Note for the venue (optional)" className="mt-6">
        {(p) => (
          <Textarea
            {...p}
            value={notes}
            maxLength={300}
            onChange={(e) => onNotes(e.target.value)}
            placeholder="For example: we need four paddles to rent."
          />
        )}
      </Field>
    </section>
  );
}

function Review({
  venueName,
  selection: sel,
  pay,
  notes,
  guest,
  onBack,
  onPick,
}: {
  venueName: string;
  selection: Selection;
  pay: BookingPayMethod;
  notes: string;
  /** Booking without an account: confirmed with a code sent to this email. */
  guest: GuestInfo | null;
  onBack: () => void;
  onPick: (courtId: string, startsAt: string) => void;
}) {
  const quote = useBookingQuote(sel.court.id, sel.startsAt, sel.minutes);
  const asPlayer = useCreateBooking();
  const asGuest = useCreateGuestBooking();
  const create = guest ? asGuest : asPlayer;
  const sendCode = useSendGuestCode();
  const [code, setCode] = useState("");
  const navigate = useNavigate();
  const online = useOnline();
  const [priceNote, setPriceNote] = useState<string | null>(null);
  const error = create.error instanceof ApiError ? create.error : null;
  const taken = error?.code === "slot_taken" ? (error.details as SlotTakenDetails) : null;

  if (quote.isPending) return <Skeleton className="h-96 rounded-[24px]" />;
  if (quote.error) {
    const msg =
      quote.error instanceof ApiError
        ? (quote.error.field("starts_at") ?? quote.error.field("court_id") ?? quote.error.message)
        : quote.error.message;
    return (
      <section className="rounded-[24px] border border-line-faint bg-court-surface p-6">
        <ErrorState message={msg} onRetry={() => quote.refetch()} />
        <Button className="mt-4" onClick={onBack}>
          Back
        </Button>
      </section>
    );
  }
  const q = quote.data;
  const held = pay !== "pay_at_court";

  if (taken) {
    return (
      <section
        className="rounded-[24px] border border-line-faint bg-court-surface p-6"
        aria-labelledby="taken-h"
      >
        <div role="alert" className="border-l-2 border-signal-amber py-1 pl-4">
          <h2 id="taken-h" className="text-xl font-bold">
            That time was just taken
          </h2>
          <p className="mt-1 text-line-dim">
            Someone booked {q.court_name} at {formatTime(q.starts_at, TZ)} a moment before you. Nothing was
            booked for you.
          </p>
        </div>
        {taken.alternatives.length > 0 && (
          <>
            <h3 className="mt-6 mb-2 font-semibold">Still free at {venueName}</h3>
            <ul className="flex flex-col gap-2">
              {taken.alternatives.map((a) => (
                <li key={`${a.court_id}-${a.starts_at}`}>
                  <button
                    type="button"
                    onClick={() => {
                      create.reset();
                      onPick(a.court_id, a.starts_at);
                    }}
                    className="flex w-full items-center justify-between gap-4 rounded-2xl border border-line-faint px-4 py-3 text-left hover:border-line-dim"
                  >
                    <span>
                      <span className="block font-semibold">{a.court_name}</span>
                      <span className="text-sm text-line-dim">
                        {formatTimeRange(a.starts_at, a.ends_at, TZ)}
                      </span>
                    </span>
                    <span className="font-condensed">{pesos(a.total)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    );
  }

  const input = {
    court_id: q.court_id,
    starts_at: q.starts_at,
    duration_minutes: sel.minutes,
    expected_total: q.total,
    payment_method: pay,
    notes: notes.trim() || undefined,
  };
  const onCreateError = (e: Error) => {
    if (e instanceof ApiError && e.code === "price_changed") {
      setPriceNote(
        `The price changed to ${pesos((e.details as PriceChangedDetails).total)}. Check the total and confirm again.`,
      );
      create.reset();
      quote.refetch();
    }
  };
  const confirm = () => {
    setPriceNote(null);
    if (guest) {
      // First a code to the guest's email; the booking is made when they enter it.
      if (!sendCode.data) return sendCode.mutate({ name: guest.name.trim(), email: guest.email.trim() });
      asGuest.mutate(
        {
          ...input,
          verification_id: sendCode.data.verification_id,
          code: code.trim(),
          name: guest.name.trim(),
          phone: guest.phone.trim(),
          email: guest.email.trim(),
        },
        {
          onSuccess: (b) => {
            const access = { booking_code: b.booking_code, email: guest.email.trim().toLowerCase() };
            rememberGuest(access);
            navigate("/find-booking", { replace: true, state: { access, justBooked: true } });
          },
          onError: onCreateError,
        },
      );
      return;
    }
    asPlayer.mutate(input, {
      onSuccess: (b) => navigate(`/bookings/${b.id}?new=1`, { replace: true }),
      onError: onCreateError,
    });
  };
  const codeError = asGuest.error instanceof ApiError ? asGuest.error.field("code") : undefined;
  const sendError =
    sendCode.error instanceof ApiError
      ? (sendCode.error.field("email") ?? sendCode.error.field("name") ?? sendCode.error.message)
      : sendCode.error?.message;
  const other =
    error && error.code !== "price_changed" && !codeError
      ? (error.field("starts_at") ??
        error.field("payment_method") ??
        error.field("phone") ??
        error.field("email") ??
        error.field("name") ??
        error.message)
      : null;
  const label = held ? `Hold the court and pay by ${payLabels[pay].title}` : "Confirm booking";

  return (
    <section
      aria-labelledby="rev-h"
      className="rounded-[24px] border border-line-faint bg-court-surface p-5 sm:p-6"
    >
      <h2 id="rev-h" className="text-2xl font-expanded">
        Review and confirm
      </h2>
      <p className="mt-1 text-sm text-line-dim">
        CourtFlex checks the time and price again when you confirm.
      </p>

      <h3 className="mt-6 text-sm font-semibold">Price</h3>
      <ul className="mt-2 flex flex-col divide-y divide-line-faint rounded-2xl border border-line-faint">
        {q.lines.map((l) => (
          <li key={l.starts_at} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span>
              {formatTimeRange(l.starts_at, l.ends_at, TZ)}
              <span className="ml-2 text-line-dim">at {pesos(l.hourly_rate)}/hr</span>
            </span>
            <span className="font-condensed">{pesos(l.amount)}</span>
          </li>
        ))}
        <li className="flex items-center justify-between px-4 py-3 font-bold">
          <span>Total</span>
          <span className="text-xl font-condensed">{pesos(q.total)}</span>
        </li>
      </ul>
      {priceNote && (
        <p role="status" className="mt-3 text-sm text-signal-amber">
          {priceNote}
        </p>
      )}

      <h3 className="mt-6 text-sm font-semibold">Payment</h3>
      <p className="mt-1">
        <span className="font-semibold">{payLabels[pay].title}.</span>{" "}
        <span className="text-line-dim">
          {held
            ? "Your court is held for 30 minutes. Next, send the payment and upload the receipt on your booking page. The venue checks it, then your booking is confirmed."
            : "Your booking is confirmed now. Pay at the front desk before you play."}
        </span>
      </p>

      <h3 className="mt-6 text-sm font-semibold">Cancelling</h3>
      <p className="mt-1 text-sm text-line-dim">
        You can cancel in the app until {formatTime(q.cancel_until, TZ)} on{" "}
        {formatDateLong(todayIn(TZ, new Date(q.cancel_until)), TZ)}. {q.cancellation_policy}
      </p>

      {guest && sendCode.data ? (
        <form
          noValidate
          className="mt-6 rounded-2xl border border-ball/40 bg-ball/[0.06] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          <h3 className="font-bold">Check your email</h3>
          <p className="mt-1 text-sm text-line-dim">
            We sent a 6-digit code to {sendCode.data.email}. Enter it to confirm the booking. It works for 10
            minutes.
          </p>
          <Field label="Code from the email" error={codeError} className="mt-4">
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="text-center text-xl font-condensed tracking-[0.4em] sm:w-48"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            )}
          </Field>
          {import.meta.env.VITE_USE_MOCKS !== "false" && (
            <p className="mt-2 text-xs text-line-dim">Mock API: the code is 246810.</p>
          )}
          {other && (
            <p role="alert" className="mt-4 border-l-2 border-signal-red pl-3 text-sm">
              {other}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="mt-4 h-14 w-full rounded-2xl"
            loading={create.isPending}
            disabled={!online || code.length !== 6}
          >
            {label}
          </Button>
          <ResendCode
            sent={sendCode.data}
            sending={sendCode.isPending}
            onResend={() => sendCode.mutate({ name: guest.name.trim(), email: guest.email.trim() })}
          />
        </form>
      ) : (
        <>
          {(other || sendError) && (
            <p role="alert" className="mt-5 border-l-2 border-signal-red pl-3 text-sm">
              {other ?? sendError}
            </p>
          )}
          <Button
            variant="primary"
            size="lg"
            className="mt-6 h-14 w-full rounded-2xl"
            onClick={confirm}
            loading={create.isPending || sendCode.isPending}
            disabled={!online}
          >
            {guest ? "Email me a code to confirm" : label}
          </Button>
          {guest && (
            <p className="mt-2 text-center text-xs text-line-dim">
              We send a code to {guest.email.trim()} to make sure it's yours. Your booking code goes there
              too.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Gone({ onBack }: { onBack: () => void }) {
  return (
    <section role="alert" className="rounded-[24px] border border-line-faint bg-court-surface p-6">
      <h2 className="text-xl font-bold">That time isn't free any more</h2>
      <p className="mt-1 text-line-dim">Someone else may have booked it. Choose another time.</p>
      <Button className="mt-4" onClick={onBack}>
        Choose a time
      </Button>
    </section>
  );
}

function Summary({
  day,
  selection,
  pay,
}: {
  day: VenueBookingDay;
  selection: Selection | null;
  pay: BookingPayMethod | null;
}) {
  const hours = selection ? selection.minutes / 60 : 0;
  return (
    <aside
      aria-label="Your booking"
      className="rounded-[24px] border border-line-faint bg-court-surface p-5 lg:sticky lg:top-24"
    >
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <CalendarDays className="size-5 text-field" aria-hidden />
        Your booking
      </h2>
      <p className="text-sm text-line-dim">Review your choice before continuing.</p>
      <dl className="mt-4 flex flex-col gap-3 text-sm">
        <Row label="Venue" value={day.venue.name} />
        <Row label="Date" value={formatDateLong(day.date, TZ)} />
        <Row label="Court" value={selection?.court.name ?? "Choose a court"} muted={!selection} />
        <Row
          label="Time"
          value={selection ? formatTimeRange(selection.startsAt, selection.endsAt, TZ) : "Choose a time"}
          muted={!selection}
        />
        {selection && <Row label="Length" value={`${hours} ${hours === 1 ? "hour" : "hours"}`} />}
        {pay && <Row label="Payment" value={payLabels[pay].title} />}
      </dl>
      <div className="mt-4 flex items-end justify-between border-t court-line pt-4">
        <span className="font-semibold">Total</span>
        <span className="text-3xl font-extrabold font-condensed">
          {selection ? pesos(selection.total) : "—"}
        </span>
      </div>
      <ul className="mt-4 flex flex-col gap-3 rounded-2xl border border-line-faint bg-court-deep/40 p-4 text-xs">
        <li className="flex gap-2.5">
          <Zap className="size-4 shrink-0 text-field" aria-hidden />
          <span>
            <span className="block font-semibold text-line">Live price and availability</span>
            <span className="text-line-dim">Checked again when you confirm.</span>
          </span>
        </li>
        <li className="flex gap-2.5">
          <Wallet className="size-4 shrink-0 text-field" aria-hidden />
          <span>
            <span className="block font-semibold text-line">Payment options</span>
            <span className="text-line-dim">
              {methodsOf(day.venue.payments)
                .map((m) => payLabels[m].title)
                .join(", ") || "By phone"}
            </span>
          </span>
        </li>
        <li className="flex gap-2.5">
          <ShieldCheck className="size-4 shrink-0 text-field" aria-hidden />
          <span>
            <span className="block font-semibold text-line">Your booking page</span>
            <span className="text-line-dim">Shows the booking code, payment and receipt status.</span>
          </span>
        </li>
      </ul>
      <p className="mt-4 text-xs text-line-dim">
        <Link to={`/venues/${day.venue.slug}`} className="underline underline-offset-4 hover:text-line">
          About {day.venue.name}
        </Link>
      </p>
    </aside>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <dt className="text-[0.7rem] font-semibold tracking-wide text-line-dim uppercase">{label}</dt>
      <dd className={cn("font-semibold", muted && "text-line-dim")}>{value}</dd>
    </div>
  );
}

/** "Send a new code", available a minute after the last one. */
function ResendCode({
  sent,
  onResend,
  sending,
}: {
  sent: GuestCodeSent;
  onResend: () => void;
  sending: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const wait = Math.max(0, Math.ceil((new Date(sent.resend_after).getTime() - now) / 1000));
  return (
    <p className="mt-3 text-center text-sm text-line-dim">
      No email?{" "}
      <button
        type="button"
        disabled={wait > 0 || sending}
        onClick={onResend}
        className="font-semibold text-ball underline-offset-4 hover:underline disabled:text-line-dim disabled:no-underline"
      >
        {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
      </button>
    </p>
  );
}

/** Booking without an account: who it's for. The email gets the code and the booking code. */
function DetailsStep({
  guest,
  onChange,
  errors,
  signInTo,
}: {
  guest: GuestInfo;
  onChange: (g: GuestInfo) => void;
  errors: Partial<Record<keyof GuestInfo, string>>;
  signInTo: string;
}) {
  const set = (k: keyof GuestInfo, v: string) => onChange({ ...guest, [k]: v });
  return (
    <section
      aria-labelledby="details-h"
      className="rounded-[24px] border border-line-faint bg-court-surface p-5 sm:p-6"
    >
      <h2 id="details-h" className="text-2xl font-expanded">
        Your details
      </h2>
      <p className="mt-1 text-sm text-line-dim">
        Book without an account. The venue uses these to find your booking.{" "}
        <Link
          to="/login"
          state={{ from: signInTo }}
          className="font-semibold text-ball underline-offset-4 hover:underline"
        >
          Have an account? Sign in
        </Link>
      </p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field label="Full name" error={errors.name} className="sm:col-span-2">
          {(p) => (
            <Input
              {...p}
              autoComplete="name"
              placeholder="Juan Dela Cruz"
              value={guest.name}
              onChange={(e) => set("name", e.target.value)}
            />
          )}
        </Field>
        <Field label="Mobile number" error={errors.phone}>
          {(p) => (
            <Input
              {...p}
              type="tel"
              autoComplete="tel"
              placeholder="09171234567"
              value={guest.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Email"
          hint="We send a code here to confirm, then your booking code."
          error={errors.email}
        >
          {(p) => (
            <Input
              {...p}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={guest.email}
              onChange={(e) => set("email", e.target.value)}
            />
          )}
        </Field>
      </div>
      <p className="mt-5 flex items-start gap-2 rounded-2xl border border-line-faint bg-court-deep/40 p-3 text-xs text-line-dim">
        <ShieldCheck className="size-4 shrink-0 text-field" aria-hidden />
        Used for this booking only. To see it later, use View Bookings with your booking code and this email.
      </p>
    </section>
  );
}
