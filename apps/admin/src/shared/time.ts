import { formatDateShort } from "@courtflex/api";

/** CourtFlex runs in the Philippines: admin dates are shown in Manila time. */
export const TZ = "Asia/Manila";

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago", then the date. */
export function ago(iso: string, now = Date.now()) {
  const mins = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} ${mins === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return `on ${formatDateShort(iso, TZ)}`;
}
