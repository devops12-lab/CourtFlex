import { Navigate, useParams, useSearchParams } from "react-router";
import { todayIn, useCourtPublic } from "@courtflex/api";
import { PageLoader } from "@courtflex/ui";
import { NotFound } from "../NotFound";
import { TZ } from "./booking-labels";

/** /courts/:id/book?start=…&minutes=… opens the venue booking page with that court and time picked. */
export function CourtBookRedirect() {
  const { courtId } = useParams();
  const [params] = useSearchParams();
  const court = useCourtPublic(courtId);
  if (court.isPending) return <PageLoader />;
  if (court.error) return <NotFound message="This court isn't listed on CourtFlex." />;
  const start = params.get("start");
  const next = new URLSearchParams({ court: court.data.id });
  if (start) {
    next.set("date", todayIn(TZ, new Date(start)));
    next.set("start", new Date(start).toISOString());
    next.set("hours", String(Math.max(1, Math.round(Number(params.get("minutes") ?? 60) / 60))));
  }
  return <Navigate to={`/venues/${court.data.venue.slug}/book?${next}`} replace />;
}
