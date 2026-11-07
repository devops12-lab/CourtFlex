import type { CalendarBlock, CalendarDay } from "@courtflex/api";
import { minutesOfDay } from "@courtflex/api";

/** Maps times on a club's day to positions. Display only; the server owns the times. */
export function dayScale(day: CalendarDay, timeZone: string) {
  const open = minutesOfDay(day.opens_at, timeZone);
  let close = minutesOfDay(day.closes_at, timeZone);
  if (close <= open) close += 24 * 60;
  const span = close - open;

  const pct = (iso: string) => ((minutesOfDay(iso, timeZone) - open) / span) * 100;

  const hours: number[] = [];
  for (let m = Math.ceil(open / 60) * 60; m <= close; m += 60) hours.push(m);

  return {
    open,
    close,
    span,
    hours,
    /** Start and size of a block as percentages of the day. */
    place(block: Pick<CalendarBlock, "starts_at" | "ends_at">) {
      const start = Math.max(pct(block.starts_at), 0);
      const end = Math.min(pct(block.ends_at), 100);
      return { start, size: Math.max(end - start, 0) };
    },
    /** Where "now" falls, or null when it's outside this day's hours. */
    nowPct(now: Date) {
      if (now < new Date(day.opens_at) || now > new Date(day.closes_at)) return null;
      return pct(now.toISOString());
    },
  };
}

export function hourLabel(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${suffix}`;
}

export const reservationLabels: Record<CalendarBlock["reservation_type"], string> = {
  booking: "Booking",
  open_play: "Open play",
  maintenance: "Maintenance",
  private_event: "Private event",
};
