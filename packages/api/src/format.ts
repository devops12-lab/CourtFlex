import type { ISODate, Money, PaymentMethod } from "./types";

// Display helpers only. They format server values; they never calculate them.

export function formatMoney(amount: Money, currency = "PHP"): string {
  const n = Number(amount);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

export function formatTimeRange(start: string, end: string, timeZone: string) {
  return `${formatTime(start, timeZone)} – ${formatTime(end, timeZone)}`;
}

export function formatDateLong(date: ISODate, timeZone: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(new Date(`${date}T12:00:00Z`));
}

export function formatDateShort(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date(iso));
}

/** Today's date in a club's timezone, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(now);
}

export function shiftDate(date: ISODate, days: number): ISODate {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Minutes since local midnight in the club's timezone. */
export function minutesOfDay(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return h * 60 + m;
}

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash_at_venue: "GCash at venue",
  maya_at_venue: "Maya at venue",
  card_at_venue: "Card at venue",
  other: "Other",
};
