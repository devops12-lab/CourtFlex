import { formatTime } from "@courtflex/api";
import { shortDay } from "@courtflex/features";

export const TZ = "Asia/Manila";

export const durationLabel = (minutes: number) => (minutes === 60 ? "1 hour" : `${minutes / 60} hours`);

/** The cancellation deadline in words, from the server's cancel_until. */
export function cancelDeadline(cancelUntil: string, startsAt: string, now = new Date()) {
  if (new Date(cancelUntil) <= now) return "Cancelling in the app has closed for this booking.";
  if (cancelUntil === startsAt) return "You can cancel in the app until it starts.";
  return `You can cancel in the app until ${shortDay(cancelUntil)}, ${formatTime(cancelUntil, TZ)}.`;
}
