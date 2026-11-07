import { useState } from "react";
import { Link } from "react-router";
import { Plus, Search } from "lucide-react";
import { useClubDirectory } from "@courtflex/api";
import { EmptyState, ErrorState, Input, Select, Skeleton } from "@courtflex/ui";
import { ClubCard } from "@courtflex/features";

/** Find a club: a player community to join and play with. Venues are under Courts. */
export function ClubsPage() {
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const all = useClubDirectory({});
  const clubs = useClubDirectory({ search, city, type: "community" });
  const cities = [...new Set((all.data ?? []).map((c) => c.city))].sort();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-expanded font-extrabold">Find your people</h1>
          <p className="mt-1 text-line-dim">
            Clubs are groups of players who play together. Join one, or start your own.
          </p>
        </div>
        <Link
          to="/clubs/new"
          className="inline-flex h-11 items-center gap-2 rounded-full border border-line/70 px-4 text-sm font-semibold hover:bg-court-raised"
        >
          <Plus className="size-4" aria-hidden />
          Start a club
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-line-dim"
            aria-hidden
          />
          <Input
            aria-label="Search clubs"
            placeholder="Search clubs or cities"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          City
          <Select value={city} onChange={(e) => setCity(e.target.value)} className="sm:w-44">
            <option value="">Anywhere</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </label>
      </div>

      <div className="mt-8">
        {clubs.isPending && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-72" />
            ))}
          </div>
        )}
        {clubs.error && <ErrorState message={clubs.error.message} onRetry={() => clubs.refetch()} />}
        {clubs.data?.length === 0 && (
          <EmptyState
            title="No clubs match"
            body="Try another city, or start a club for your group."
            action={
              <Link to="/clubs/new" className="font-semibold text-ball underline underline-offset-4">
                Start a club
              </Link>
            }
          />
        )}
        {clubs.data && clubs.data.length > 0 && (
          <>
            <p className="mb-3 text-sm text-line-dim">
              {clubs.data.length} {clubs.data.length === 1 ? "result" : "results"}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {clubs.data.map((c) => (
                <ClubCard key={`${c.type}-${c.id}`} club={c} to={`/clubs/${c.type}/${c.slug}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
