import { useState } from "react";
import { Link } from "react-router";
import { Plus, Search } from "lucide-react";
import type { SkillLevel } from "@courtflex/api";
import { useMyClubs, useSessions, type SessionScope } from "@courtflex/api";
import { cn, Input, Tabs } from "@courtflex/ui";
import { SessionGrid, skillLabels } from "@courtflex/features";

const levels: Array<SkillLevel | ""> = ["", "beginner", "novice", "intermediate", "advanced", "pro"];

export function SessionsPage() {
  const [scope, setScope] = useState<SessionScope>("upcoming");
  const [level, setLevel] = useState<SkillLevel | "">("");
  const [search, setSearch] = useState("");
  const sessions = useSessions({ scope, level, search });
  const myClubs = useMyClubs();
  const canHost = myClubs.data?.some((c) => c.can_host);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-expanded font-extrabold">Open play</h1>
          <p className="mt-1 text-line-dim">Find a game that fits your day.</p>
        </div>
        {canHost && (
          <Link
            to="/sessions/new"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-ball px-4 text-sm font-semibold text-ball-ink hover:bg-ball-bright"
          >
            <Plus className="size-4" aria-hidden />
            Host a session
          </Link>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-line-dim"
            aria-hidden
          />
          <Input
            aria-label="Search sessions"
            placeholder="Search by session, club or venue"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div role="group" aria-label="Skill level" className="flex gap-2 overflow-x-auto pb-1">
          {levels.map((l) => (
            <button
              key={l || "all"}
              type="button"
              aria-pressed={level === l}
              onClick={() => setLevel(l)}
              className={cn(
                "h-9 shrink-0 rounded-full border px-4 text-sm font-semibold",
                level === l
                  ? "border-line bg-line text-court-deep"
                  : "border-line-faint text-line-dim hover:text-line",
              )}
            >
              {l ? skillLabels[l] : "All levels"}
            </button>
          ))}
        </div>
      </div>

      <Tabs
        className="mt-6"
        label="Which sessions"
        value={scope}
        onChange={setScope}
        items={[
          { value: "upcoming", label: "Current and upcoming" },
          { value: "joined", label: "Joined" },
          { value: "hosted", label: "Hosting" },
          { value: "past", label: "Past" },
        ]}
      >
        {() => (
          <SessionGrid
            sessions={sessions.data}
            loading={sessions.isPending}
            error={sessions.error}
            onRetry={() => sessions.refetch()}
            linkTo={(s) => `/sessions/${s.id}`}
            empty={
              scope === "joined"
                ? {
                    title: "You haven't joined any sessions yet",
                    body: "Pick one from Current and upcoming.",
                  }
                : scope === "hosted"
                  ? {
                      title: "You're not hosting anything",
                      body: canHost
                        ? "Host a session for your club."
                        : "Club owners and admins can host sessions.",
                    }
                  : scope === "past"
                    ? { title: "No past sessions yet" }
                    : { title: "No sessions match", body: "Try another level or search." }
            }
          />
        )}
      </Tabs>
    </div>
  );
}
