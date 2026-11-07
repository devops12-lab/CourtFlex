import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ChevronLeft, MapPin, Phone } from "lucide-react";
import type { CourtPublic } from "@courtflex/api";
import {
  formatDateShort,
  formatTime,
  formatTimeRange,
  shiftDate,
  todayIn,
  useCourtPublic,
  usePublicAvailability,
} from "@courtflex/api";
import { cn, ErrorState, Input, Segmented, Skeleton } from "@courtflex/ui";
import { pesos, shortDay } from "@courtflex/features";
import { clock } from "./CourtsPage";
import { NotFound } from "./NotFound";

const TZ = "Asia/Manila";
const days = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [0, "Sunday"],
] as const;

export function CourtPage() {
  const { courtId } = useParams();
  const court = useCourtPublic(courtId);
  if (court.isPending) return <Skeleton className="mx-auto h-96 max-w-4xl" />;
  if (court.error) {
    return court.error.message === "Court not found." ? (
      <NotFound message="This court isn't listed on CourtFlex." />
    ) : (
      <ErrorState message={court.error.message} onRetry={() => court.refetch()} />
    );
  }
  return <CourtView court={court.data} />;
}

function CourtView({ court: c }: { court: CourtPublic }) {
  return (
    <div className="mx-auto max-w-4xl">
      <Link
        to={`/venues/${c.venue.slug}`}
        className="tap inline-flex items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {c.venue.name}
      </Link>
      <header className="mt-3">
        <h1 className="text-3xl font-expanded font-extrabold">{c.name}</h1>
        <p className="mt-1 text-line-dim capitalize">
          {c.indoor_outdoor}, {c.surface_type.toLowerCase()}
        </p>
        <p className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-line-dim">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5" aria-hidden />
            {c.venue.address}, {c.venue.city}
          </span>
          {c.venue.contact_phone && (
            <a
              href={`tel:${c.venue.contact_phone.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-1.5 hover:text-line"
            >
              <Phone className="size-3.5" aria-hidden />
              {c.venue.contact_phone}
            </a>
          )}
        </p>
      </header>

      {c.venue.bookable ? (
        <Availability court={c} />
      ) : (
        <section role="status" className="mt-8 rounded-md border border-line-faint bg-court-surface p-5">
          <h2 className="text-xl font-expanded font-bold">Not bookable in the app yet</h2>
          <p className="mt-1 text-line-dim">
            {c.venue.name} doesn't take bookings on CourtFlex yet. Call them to book
            {c.venue.contact_phone ? ` at ${c.venue.contact_phone}` : ""}.
          </p>
        </section>
      )}

      <div className="mt-12 grid gap-10 md:grid-cols-2">
        <section aria-labelledby="rates-h">
          <h2 id="rates-h" className="mb-3 text-lg font-semibold">
            Rates per hour
          </h2>
          <dl className="border-t court-line">
            <Row label="Standard" value={pesos(c.base_price)} />
            {c.price_rules.map((r) => (
              <Row
                key={r.id}
                label={`${r.day_of_week === null ? "Every day" : days.find((d) => d[0] === r.day_of_week)![1]}, ${clock(r.starts_at)} to ${clock(r.ends_at)}`}
                value={pesos(r.price)}
              />
            ))}
          </dl>
          <p className="mt-2 text-sm text-line-dim">
            Paid at the venue. The price is confirmed when you book.
          </p>
        </section>
        <section aria-labelledby="hours-h">
          <h2 id="hours-h" className="mb-3 text-lg font-semibold">
            Opening hours
          </h2>
          <dl className="border-t court-line">
            {days.map(([d, name]) => {
              const h = c.hours.find((x) => x.weekday === d);
              return (
                <Row
                  key={d}
                  label={name}
                  value={!h || h.is_closed ? "Closed" : `${clock(h.opens_at!)} to ${clock(h.closes_at!)}`}
                />
              );
            })}
          </dl>
          {c.closures.length > 0 && (
            <div className="mt-4 border-l-2 border-signal-amber pl-3 text-sm">
              <p className="font-semibold">Closed on</p>
              <ul>
                {c.closures.map((x) => (
                  <li key={x.starts_at}>
                    {formatDateShort(x.starts_at, TZ)}, {formatTimeRange(x.starts_at, x.ends_at, TZ)}:{" "}
                    {x.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <section className="mt-12" aria-labelledby="venue-h">
        <h2 id="venue-h" className="mb-3 text-lg font-semibold">
          At {c.venue.name}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {c.venue.amenities.map((a) => (
            <li key={a} className="rounded-sm border border-line-faint px-3 py-1.5 text-sm">
              {a}
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-prose text-sm text-line-dim">Cancellation: {c.venue.cancellation_policy}</p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b court-line py-2.5 text-sm">
      <dt className="text-line-dim">{label}</dt>
      <dd className="font-condensed">{value}</dd>
    </div>
  );
}

const lengths = ["60", "90", "120"] as const;
type Length = (typeof lengths)[number];

/**
 * Live availability. Read straight from the server every time; picking a time
 * reserves nothing until the player confirms on the review page.
 */
function Availability({ court: c }: { court: CourtPublic }) {
  const today = todayIn(TZ);
  const last = shiftDate(today, c.venue.booking_window_days);
  const [params, setParams] = useSearchParams();
  const asked = params.get("date") ?? "";
  const date = asked >= today && asked <= last ? asked : today;
  const minutes: Length = lengths.find((l) => l === params.get("minutes")) ?? "60";
  const [picked, setPicked] = useState<string | null>(null);
  const slots = usePublicAvailability(c.id, date, Number(minutes));
  const upcoming = (slots.data ?? []).filter((s) => new Date(s.starts_at) > new Date());
  // A picked time that's no longer free (someone else booked it) drops out on the next refresh.
  const choice = upcoming.find((s) => s.starts_at === picked && s.available) ?? null;

  const set = (key: "date" | "minutes", value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
    setPicked(null);
  };

  return (
    <section className="mt-8 rounded-md border-2 border-line p-5" aria-labelledby="avail-h">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="avail-h" className="text-xl font-expanded font-bold">
            When it's free
          </h2>
          <p className="mt-1 text-sm text-line-dim">
            Pick a start time. Book up to {c.venue.booking_window_days} days ahead and pay at the venue.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5 text-sm font-medium">
            <label htmlFor="avail-date">Date</label>
            <Input
              id="avail-date"
              type="date"
              min={today}
              max={last}
              value={date}
              onChange={(e) => e.target.value && set("date", e.target.value)}
              className="h-11 w-auto"
            />
          </div>
          <Segmented
            label="Length"
            value={minutes}
            onChange={(v) => set("minutes", v)}
            options={[
              { value: "60", label: "1 h" },
              { value: "90", label: "1.5 h" },
              { value: "120", label: "2 h" },
            ]}
          />
        </div>
      </div>
      <div className="mt-5">
        {slots.isPending && <Skeleton className="h-28" />}
        {slots.error && <ErrorState message={slots.error.message} onRetry={() => slots.refetch()} />}
        {slots.data && upcoming.length === 0 && (
          <p className="text-line-dim">No times left that day. Try another date.</p>
        )}
        {upcoming.length > 0 && (
          <ul
            className="grid grid-cols-3 gap-1.5 sm:grid-cols-6"
            aria-label={`Start times on ${formatDateShort(`${date}T12:00:00Z`, TZ)}`}
          >
            {upcoming.map((s) => {
              const on = choice?.starts_at === s.starts_at;
              return (
                <li key={s.starts_at}>
                  <button
                    type="button"
                    disabled={!s.available}
                    aria-pressed={on}
                    onClick={() => setPicked(on ? null : s.starts_at)}
                    className={cn(
                      "flex h-14 w-full flex-col items-center justify-center rounded-sm border text-sm",
                      on
                        ? "border-ball bg-ball text-ball-ink"
                        : s.available
                          ? "border-line-faint hover:border-line"
                          : "cursor-not-allowed border-transparent text-line-faint line-through",
                    )}
                  >
                    <span className="font-semibold font-condensed">{formatTime(s.starts_at, TZ)}</span>
                    {s.available ? (
                      <span className={cn("text-xs font-condensed", on ? "text-ball-ink" : "text-line-dim")}>
                        {pesos(s.price)}
                      </span>
                    ) : (
                      <span className="sr-only">taken</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {choice && (
        <div className="sticky bottom-20 z-20 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-court-raised p-4 shadow-[0_-8px_24px_rgb(15_27_45/0.6)] md:bottom-4">
          <p>
            <span className="block font-semibold">
              {shortDay(choice.starts_at)}, {formatTimeRange(choice.starts_at, choice.ends_at, TZ)}
            </span>
            <span className="text-sm text-line-dim">
              {c.name}, {pesos(choice.price)} at the venue
            </span>
          </p>
          <Link
            to={`/courts/${c.id}/book?start=${encodeURIComponent(choice.starts_at)}&minutes=${minutes}`}
            className="inline-flex h-12 items-center rounded-full bg-ball px-6 font-semibold text-ball-ink hover:bg-ball/90"
          >
            Review booking
          </Link>
        </div>
      )}
    </section>
  );
}
