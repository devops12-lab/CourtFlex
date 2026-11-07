import { useState } from "react";
import { Link } from "react-router";
import { Plus } from "lucide-react";
import { useOrganizerSessions } from "@courtflex/api";
import { Tabs } from "@courtflex/ui";
import { SessionGrid } from "@courtflex/features";
import { useClubContext } from "../../app/club-context";
import { ReadOnlyNote } from "../../shared/FormFeedback";

type Tab = "upcoming" | "pending" | "past";

/** Every open play session on this venue's courts: its own, and community clubs' sessions. */
export function OpenPlayPage() {
  const { club, can } = useClubContext();
  const [tab, setTab] = useState<Tab>("upcoming");
  const upcoming = useOrganizerSessions("venue", club.id, "upcoming");
  const pending = useOrganizerSessions("venue", club.id, "pending");
  const past = useOrganizerSessions("venue", club.id, "past");
  const lists = { upcoming, pending, past };
  const current = lists[tab];
  const canCreate = can("manageOpenPlay") && !club.read_only;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-expanded font-bold sm:text-3xl">Open play</h1>
          <p className="mt-1 max-w-prose text-line-dim">
            Your sessions and community clubs' sessions on your courts.
            {club.settings.allow_player_open_play
              ? club.settings.require_open_play_approval
                ? " Community sessions wait for your approval."
                : " Community sessions go live without approval."
              : " Community sessions are turned off in Settings."}
          </p>
        </div>
        {canCreate && (
          <Link
            to="new"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-ball px-4 text-sm font-semibold text-ball-ink hover:bg-ball-bright"
          >
            <Plus className="size-4" aria-hidden />
            New session
          </Link>
        )}
      </div>
      <div className="mt-4">
        <ReadOnlyNote />
      </div>
      <Tabs
        className="mt-6"
        label="Sessions"
        value={tab}
        onChange={setTab}
        items={[
          { value: "upcoming", label: "Upcoming and live", count: upcoming.data?.length },
          ...(can("approvePlayerOpenPlay")
            ? [{ value: "pending" as const, label: "Needs approval", count: pending.data?.length }]
            : []),
          { value: "past", label: "Past", count: past.data?.length },
        ]}
      >
        {() => (
          <SessionGrid
            sessions={current.data}
            loading={current.isPending}
            error={current.error}
            onRetry={() => current.refetch()}
            linkTo={(s) => s.id}
            empty={
              tab === "pending"
                ? { title: "Nothing to approve", body: "Community sessions that need your OK show up here." }
                : tab === "past"
                  ? { title: "No past sessions yet" }
                  : {
                      title: "No sessions coming up",
                      body: canCreate ? "Create one, or let community clubs host on your courts." : undefined,
                    }
            }
          />
        )}
      </Tabs>
    </div>
  );
}
