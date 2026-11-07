import { Link, useSearchParams } from "react-router";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { Leaderboard, MatchType, RankingEntry, RankingScope } from "@courtflex/api";
import { useLeaderboard, useMe, useRankingAreas } from "@courtflex/api";
import { cn, ErrorState, Field, Segmented, Select, Skeleton, Tabs } from "@courtflex/ui";

const scopeLabels: Record<RankingScope, string> = {
  barangay: "Barangay",
  city: "City",
  province: "Province",
  country: "Country",
  global: "Global",
};

/**
 * Leaderboards: one rating per player per format, filtered by where players
 * live. Open to everyone; the address keeps the format, level and area.
 */
export function RankingsPage() {
  const [params, setParams] = useSearchParams();
  const type = (params.get("type") ?? "doubles") as MatchType;
  const me = useMe();
  // Players start on their city; visitors (no home) on the country.
  const scope = (params.get("scope") ?? (me.data ? "city" : "country")) as RankingScope;
  const area = params.get("area") ?? undefined;
  const set = (next: Record<string, string | null>) =>
    setParams(
      () => {
        const p = new URLSearchParams(window.location.search);
        for (const [k, v] of Object.entries(next)) {
          if (v === null) p.delete(k);
          else p.set(k, v);
        }
        return p;
      },
      { replace: true },
    );

  const q = useLeaderboard({ type, scope, area });
  const areas = useRankingAreas(scope);
  // Visitors (no home area) need to pick one below country level.
  const needsArea = !area && scope !== "country" && scope !== "global" && q.error;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-expanded sm:text-4xl">Rankings</h1>
        <p className="mt-1 text-line-dim">
          One rating per player for singles and one for doubles, ranked where they live. Players are ranked
          after {q.data?.minimum_matches ?? 5} confirmed competitive matches.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        <Segmented
          label="Format"
          value={type}
          onChange={(t) => set({ type: t })}
          options={[
            { value: "doubles", label: "Doubles" },
            { value: "singles", label: "Singles" },
          ]}
          className="max-w-xs"
        />
        <Tabs<RankingScope>
          label="Area"
          value={scope}
          onChange={(s) => set({ scope: s, area: null })}
          items={(["barangay", "city", "province", "country", "global"] as const).map((s) => ({
            value: s,
            label: scopeLabels[s],
          }))}
        >
          {() => (
            <div className="mt-6 flex flex-col gap-6">
              {scope !== "country" && scope !== "global" && (
                <Field label={`Choose a ${scopeLabels[scope].toLowerCase()}`} className="max-w-sm">
                  {(p) => (
                    <Select
                      {...p}
                      value={area ?? q.data?.area.id ?? ""}
                      onChange={(e) => set({ area: e.target.value || null })}
                    >
                      {!area && !q.data && <option value="">Choose one</option>}
                      {areas.data?.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                          {q.data?.my_areas.some((m) => m.id === a.id) ? " (home)" : ""}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
              {scope === "global" ? (
                <p className="rounded-2xl border border-dashed border-line-faint p-6 text-line-dim">
                  Global rankings aren't open yet. They start once CourtFlex covers more countries. For now,
                  the country board is the widest.
                </p>
              ) : needsArea ? (
                <p className="rounded-2xl border border-line-faint p-6 text-line-dim">
                  Choose a {scopeLabels[scope].toLowerCase()} above to see its board.
                </p>
              ) : q.isPending ? (
                <Skeleton className="h-96 rounded-2xl" />
              ) : q.error ? (
                <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
              ) : (
                <Board b={q.data} />
              )}
            </div>
          )}
        </Tabs>
      </div>
    </div>
  );
}

function Board({ b }: { b: Leaderboard }) {
  const label = b.type === "singles" ? "singles" : "doubles";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-expanded">{b.area.name}</h2>
        <p className="text-sm text-line-dim">
          {b.ranked.length} ranked in {label}
        </p>
      </div>

      {b.me && <MyPosition me={b.me} min={b.minimum_matches} area={b.area.name} />}

      {b.ranked.length === 0 ? (
        <p className="rounded-2xl border border-line-faint p-6 text-line-dim">
          No one here has {b.minimum_matches} confirmed {label} matches yet. Play competitive matches to start
          the board.
        </p>
      ) : (
        <ol aria-label={`${b.area.name} ${label} rankings`} className="flex flex-col">
          {b.ranked.map((e) => (
            <Row key={e.player.id} e={e} mine={e.player.id === b.me?.player.id} />
          ))}
        </ol>
      )}

      {b.provisional.length > 0 && (
        <details className="rounded-2xl border border-line-faint p-4">
          <summary className="cursor-pointer font-semibold">
            Not ranked yet ({b.provisional.length})
            <span className="ml-2 text-sm font-normal text-line-dim">
              fewer than {b.minimum_matches} rated {label} matches
            </span>
          </summary>
          <ul className="mt-3 divide-y divide-line-faint">
            {b.provisional.map((e) => (
              <li key={e.player.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link to={`/players/${e.player.id}`} className="font-semibold hover:text-ball">
                  {e.player.name}
                </Link>
                <span className="text-line-dim">
                  <span className="text-base font-condensed text-line tabular-nums">{e.rating}</span> ·{" "}
                  {b.minimum_matches - e.games} more to go
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function MyPosition({ me, min, area }: { me: RankingEntry; min: number; area: string }) {
  return (
    <section
      aria-label="Your position"
      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ball/50 bg-ball/10 p-4 sm:p-5"
    >
      {me.rank !== null ? (
        <p>
          <span className="text-sm text-line-dim">You're</span>
          <span className="ml-2 text-4xl font-condensed tabular-nums">#{me.rank}</span>
          <span className="ml-2 text-sm text-line-dim">in {area}</span>
        </p>
      ) : (
        <p>
          <span className="font-semibold">Not ranked yet.</span>{" "}
          <span className="text-line-dim">
            {min - me.games} more confirmed {min - me.games === 1 ? "match" : "matches"} to go.
          </span>
        </p>
      )}
      <p className="text-sm text-line-dim">
        Rating <span className="text-xl font-condensed text-line tabular-nums">{me.rating}</span> · {me.wins}–
        {me.losses}
      </p>
    </section>
  );
}

function Row({ e, mine }: { e: RankingEntry; mine: boolean }) {
  const podium = e.rank! <= 3;
  return (
    <li
      aria-current={mine ? "true" : undefined}
      className={cn(
        "grid grid-cols-[3rem_1fr_auto] items-center gap-3 border-b border-line-faint px-2 py-3 sm:grid-cols-[3.5rem_1fr_5rem_4rem_3rem] sm:gap-4",
        mine && "rounded-xl border-b-transparent bg-ball/10",
      )}
    >
      <span
        className={cn(
          "font-condensed tabular-nums",
          podium ? "text-3xl" : "text-xl text-line-dim",
          e.rank === 1 && "text-ball",
        )}
      >
        {e.rank}
      </span>
      <span className="min-w-0">
        <Link
          to={`/players/${e.player.id}`}
          className={cn("block truncate font-semibold hover:text-ball", podium && "text-lg")}
        >
          {e.player.name}
          {mine && <span className="ml-2 text-xs font-semibold text-ball">You</span>}
        </Link>
        <span className="block truncate text-sm text-line-dim">
          {e.player.city ?? ""}
          <span className="sm:hidden">
            {" "}
            · {e.wins}–{e.losses}
          </span>
        </span>
      </span>
      <span className={cn("text-right font-condensed tabular-nums", podium ? "text-2xl" : "text-xl")}>
        {e.rating}
      </span>
      <span className="hidden text-right text-sm text-line-dim tabular-nums sm:block">
        {e.wins}–{e.losses}
      </span>
      <Movement m={e.movement} />
    </li>
  );
}

function Movement({ m }: { m: number | null }) {
  const base = "hidden items-center justify-end gap-0.5 text-sm tabular-nums sm:flex";
  if (m === null)
    return (
      <span className={cn(base, "text-xs text-line-dim")} aria-label="New this week">
        New
      </span>
    );
  if (m === 0)
    return (
      <span className={cn(base, "text-line-dim")} aria-label="No change this week">
        <Minus className="size-3.5" aria-hidden />
      </span>
    );
  return (
    <span
      className={cn(base, m > 0 ? "text-field" : "text-line-dim")}
      aria-label={m > 0 ? `Up ${m} this week` : `Down ${-m} this week`}
    >
      {m > 0 ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />}
      {Math.abs(m)}
    </span>
  );
}
