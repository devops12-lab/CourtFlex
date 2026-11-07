import { Link } from "react-router";
import { MapPin } from "lucide-react";
import type { ClubListing } from "@courtflex/api";
import { cn } from "@courtflex/ui";
import { ClubCover, ClubLogo } from "./ClubMark";

/** A club in the directory: cover, logo, what it is, where, and what's on. */
export function ClubCard({ club, to }: { club: ClubListing; to: string }) {
  return (
    <Link
      to={to}
      className="group flex flex-col overflow-hidden rounded-md border border-line-faint bg-court-surface transition-colors hover:border-line/60"
    >
      <div className="relative">
        <ClubCover name={club.name} url={club.cover_url} className="h-24" />
        <ClubLogo name={club.name} url={club.logo_url} className="absolute -bottom-6 left-4 bg-court-deep" />
        {club.live_session_count > 0 && (
          <span className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-sm bg-ball px-2 py-1 text-xs font-semibold text-ball-ink">
            <span className="size-1.5 animate-pulse rounded-full bg-ball-ink" aria-hidden />
            Playing now
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col px-4 pt-8 pb-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg leading-snug font-bold group-hover:underline">{club.name}</h3>
          <span
            className={cn(
              "shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold",
              club.type === "venue" ? "bg-court-outer text-line" : "border border-line/40 text-line-dim",
            )}
          >
            {club.type === "venue" ? "Venue" : "Club"}
          </span>
        </div>
        <p className="mt-1 text-sm text-line-dim">{club.tagline}</p>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-line-dim">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          {club.city}, {club.province}
        </p>
        {club.home_venue && (
          <p className="mt-0.5 truncate pl-5 text-sm text-line-dim">Plays at {club.home_venue.name}</p>
        )}
        {club.status === "pending_review" && (
          <p className="mt-3 border-l-2 border-signal-amber pl-2 text-sm text-signal-amber">
            Waiting for CourtFlex review
          </p>
        )}
        <dl className="mt-auto flex gap-6 border-t court-line pt-3 text-sm">
          <div>
            <dt className="text-line-dim">Members</dt>
            <dd className="font-semibold font-condensed">{club.member_count}</dd>
          </div>
          {club.court_count !== null && (
            <div>
              <dt className="text-line-dim">Courts</dt>
              <dd className="font-semibold font-condensed">{club.court_count}</dd>
            </div>
          )}
          <div>
            <dt className="text-line-dim">Sessions coming up</dt>
            <dd className="font-semibold font-condensed">{club.upcoming_session_count}</dd>
          </div>
        </dl>
      </div>
    </Link>
  );
}
