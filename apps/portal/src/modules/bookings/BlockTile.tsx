import type { CalendarBlock, CalendarDay } from "@courtflex/api";
import { formatTimeRange } from "@courtflex/api";
import { cn, PaymentDot, paymentStatusLabels } from "@courtflex/ui";
import { reservationLabels } from "./day-scale";

const stripes = "bg-[repeating-linear-gradient(135deg,var(--color-line-faint)_0_6px,transparent_6px_12px)]";

/** One block of court time. Bookings open their details; other blocks are read-only. */
export function BlockTile({
  block,
  timeZone,
  onOpen,
  compact,
  style,
}: {
  block: CalendarBlock;
  timeZone: string;
  onOpen?: (bookingId: string) => void;
  compact?: boolean;
  style?: React.CSSProperties;
}) {
  const b = block.booking;
  const time = formatTimeRange(block.starts_at, block.ends_at, timeZone);
  const done = b ? b.status === "completed" || b.status === "no_show" : block.status === "completed";

  const body = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        {b && <PaymentDot status={b.payment_status} />}
        <span
          className={cn(
            "truncate font-semibold",
            compact && "text-xs",
            b?.status === "no_show" && "line-through",
          )}
        >
          {/* Lanes are narrow on the board, so first names carry it there. */}
          {compact && b ? block.label.split(" ")[0] : block.label}
        </span>
      </span>
      {!compact && <span className="truncate text-xs font-condensed text-line-dim">{time}</span>}
    </>
  );

  const base = cn(
    "absolute flex flex-col justify-start gap-0.5 overflow-hidden rounded-sm px-2 py-1 text-left text-sm",
    b && "border-l-[3px] border-line bg-court-raised hover:bg-[#28406a]",
    b?.status === "pending" && "border border-l-[3px] border-dashed border-signal-amber",
    block.reservation_type === "open_play" && "border-l-[3px] border-court-outer-bright bg-court-outer",
    block.reservation_type === "maintenance" && cn("border border-line-faint text-line-dim", stripes),
    block.reservation_type === "private_event" && "border-l-[3px] border-line-dim bg-court-surface",
    done && "opacity-55",
  );

  if (!b) {
    return (
      <div
        className={base}
        style={style}
        title={`${reservationLabels[block.reservation_type]}: ${block.label}, ${time}`}
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn(base, "cursor-pointer")}
      style={style}
      onClick={() => onOpen?.(b.id)}
      aria-label={`${block.label}, ${time}, ${paymentStatusLabels[b.payment_status]}. Open booking ${b.booking_code}`}
    >
      {body}
    </button>
  );
}

/** Court time that can't be booked: outside opening hours, or a closure. Drawn behind bookings. */
export function ClosedTile({
  closure,
  timeZone,
  compact,
  style,
}: {
  closure: CalendarDay["closures"][number];
  timeZone: string;
  compact?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute overflow-hidden bg-court-deep px-2 py-1 text-xs text-line-dim",
        "bg-[repeating-linear-gradient(45deg,var(--color-line-faint)_0_1px,transparent_1px_8px)]",
      )}
      style={style}
      title={`${closure.reason}, ${formatTimeRange(closure.starts_at, closure.ends_at, timeZone)}`}
    >
      {!compact && <span className="font-semibold">{closure.reason}</span>}
    </div>
  );
}
