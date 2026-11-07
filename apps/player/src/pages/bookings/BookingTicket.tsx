import { formatDateLong, formatTimeRange, todayIn, type PlayerBooking } from "@courtflex/api";
import { cn } from "@courtflex/ui";
import { TZ } from "./booking-labels";

/**
 * The booking drawn as the court it's for, seen from above: baselines, the
 * two kitchens and the net. The code sits in one service box so front-desk
 * staff can read it off a phone held at arm's length.
 */
export function BookingTicket({ booking: b }: { booking: PlayerBooking }) {
  const off = b.status === "cancelled" || b.status === "expired";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md",
        off ? "bg-court-raised text-line-dim" : "bg-court-outer text-line",
      )}
    >
      <CourtLines dashed={off} />
      <div className="relative grid min-h-48 grid-cols-[1fr_auto_1fr] items-center gap-4 p-5 sm:p-7">
        <div>
          <p className="text-sm">Booking code</p>
          <p
            className={cn(
              "mt-1 text-3xl font-expanded font-black tracking-wide sm:text-4xl",
              !off && "text-ball",
              off && "line-through",
            )}
            data-testid="booking-code"
          >
            {b.booking_code}
          </p>
        </div>
        {/* the net */}
        <span aria-hidden className="h-full w-0" />
        <div className="text-right">
          <p className="font-semibold">{b.court.name}</p>
          <p className="text-2xl font-bold font-condensed sm:text-3xl">
            {formatTimeRange(b.starts_at, b.ends_at, TZ)}
          </p>
          <p className="text-sm">{formatDateLong(todayIn(TZ, new Date(b.starts_at)), TZ)}</p>
        </div>
      </div>
    </div>
  );
}

/** A 44 × 20 ft court, stretched to fit. Lines keep their width at any size. */
function CourtLines({ dashed }: { dashed: boolean }) {
  const stroke = {
    stroke: "currentColor",
    strokeOpacity: dashed ? 0.35 : 0.55,
    strokeWidth: 2,
    vectorEffect: "non-scaling-stroke" as const,
    strokeDasharray: dashed ? "6 6" : undefined,
    fill: "none",
  };
  return (
    <svg
      aria-hidden
      viewBox="0 0 44 20"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)]"
    >
      <rect x="0" y="0" width="44" height="20" {...stroke} />
      {/* kitchen (non-volley zone) lines, 7 ft each side of the net */}
      <line x1="15" y1="0" x2="15" y2="20" {...stroke} />
      <line x1="29" y1="0" x2="29" y2="20" {...stroke} />
      {/* centre lines, baseline to kitchen */}
      <line x1="0" y1="10" x2="15" y2="10" {...stroke} />
      <line x1="29" y1="10" x2="44" y2="10" {...stroke} />
      {/* net */}
      <line x1="22" y1="-1" x2="22" y2="21" {...stroke} strokeWidth={4} strokeOpacity={dashed ? 0.35 : 0.9} />
    </svg>
  );
}
