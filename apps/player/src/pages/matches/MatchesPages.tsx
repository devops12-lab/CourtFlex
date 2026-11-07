import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Plus, Search, X } from "lucide-react";
import type { MatchFormat, MatchSummary, PersonRef, Side } from "@courtflex/api";
import {
  ApiError,
  defaultFormat,
  useCreateMatch,
  useMe,
  useMyMatches,
  usePlayerDirectory,
  useCourts,
} from "@courtflex/api";
import { Button, cn, ErrorState, Field, Input, Segmented, Select, Skeleton } from "@courtflex/ui";
import { sideTone, statusText } from "./MatchPage";

const names = (team: PersonRef[]) => team.map((p) => p.name.split(" ")[0]).join(" & ");

export function MatchesPage() {
  const q = useMyMatches();
  const me = useMe();
  const uid = me.data?.id;
  // Results waiting for me (I'm on the side that confirms).
  const toConfirm =
    q.data?.filter((m) => m.awaiting_side !== null && m.teams[m.awaiting_side].some((p) => p.id === uid)) ??
    [];
  const live = q.data?.filter((m) => m.status === "in_progress") ?? [];
  const upcoming = q.data?.filter((m) => m.status === "scheduled") ?? [];
  const done =
    q.data?.filter((m) => m.status !== "in_progress" && m.status !== "scheduled" && !toConfirm.includes(m)) ??
    [];
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-expanded sm:text-4xl">Matches</h1>
          <p className="mt-1 text-line-dim">
            Games you played, are playing, or keep score for.{" "}
            <Link to="/players/me" className="font-semibold text-ball underline underline-offset-4">
              My stats
            </Link>
          </p>
        </div>
        <Link
          to="/matches/new"
          className="inline-flex h-11 items-center gap-2 rounded-full bg-ball px-5 font-semibold text-ball-ink hover:bg-ball-bright"
        >
          <Plus className="size-4" aria-hidden />
          Log a match
        </Link>
      </header>
      {q.isPending ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <p className="rounded-2xl border border-line-faint p-5 text-line-dim">
          No matches yet. Log one you're about to play, and keep score from your phone.
        </p>
      ) : (
        <>
          {toConfirm.length > 0 && (
            <MatchList
              title="Needs your confirmation"
              note="Confirm the score if it's right, or dispute it. It's official in 48 hours if no one disputes it."
              list={toConfirm}
            />
          )}
          {live.length > 0 && <MatchList title="Live now" list={live} />}
          {upcoming.length > 0 && <MatchList title="Ready to start" list={upcoming} />}
          {done.length > 0 && <MatchList title="Recent" list={done} />}
        </>
      )}
    </div>
  );
}

function MatchList({ title, list, note }: { title: string; list: MatchSummary[]; note?: string }) {
  return (
    <section aria-labelledby={`${title.toLowerCase().replace(/\W+/g, "-")}-h`}>
      <h2 id={`${title.toLowerCase().replace(/\W+/g, "-")}-h`} className="text-xl font-expanded">
        {title}
      </h2>
      {note && <p className="mt-1 text-sm text-line-dim">{note}</p>}
      <ul className="mt-3 flex flex-col gap-3">
        {list.map((m) => (
          <li key={m.id}>
            <MatchCard m={m} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MatchCard({ m }: { m: MatchSummary }) {
  const games = m.score ? m.score.split(", ") : [];
  return (
    <Link
      to={`/matches/${m.id}`}
      className="group block rounded-2xl border border-line-faint bg-court-surface p-4 transition-colors hover:border-line-dim sm:p-5"
    >
      <div className="flex items-center justify-between gap-3 text-xs text-line-dim">
        <span className="flex items-center gap-1.5 font-semibold">
          {m.status === "in_progress" && (
            <span aria-hidden className="size-2 animate-pulse rounded-full bg-signal-red" />
          )}
          {statusText[m.status]}
        </span>
        <span>
          {m.match_type === "singles" ? "Singles" : "Doubles"}, {m.category}
          {m.court ? ` · ${m.court.name}` : ""}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1">
        {([0, 1] as const).map((side) => (
          <div key={side} className="contents">
            <p
              className={cn(
                "min-w-0 truncate font-semibold",
                m.winner === side && "text-line",
                m.winner !== null && m.winner !== side && "text-line-dim",
              )}
            >
              <span
                aria-hidden
                className={cn("mr-2 inline-block size-2.5 rounded-full", sideTone[side].dot)}
              />
              {names(m.teams[side])}
            </p>
            <p className="flex gap-3 text-lg font-condensed tabular-nums">
              {games.length === 0 ? (
                <span className="text-line-dim">–</span>
              ) : (
                games.map((g, i) => (
                  <span
                    key={i}
                    className={cn(
                      Number(g.split("-")[side]) > Number(g.split("-")[side === 0 ? 1 : 0])
                        ? "text-line"
                        : "text-line-dim",
                    )}
                  >
                    {g.split("-")[side]}
                  </span>
                ))
              )}
            </p>
          </div>
        ))}
      </div>
    </Link>
  );
}

// ── Log a match ───────────────────────────────────────────

export function PlayerPicker({
  label,
  chosen,
  onAdd,
  onRemove,
  max,
  exclude,
}: {
  label: string;
  chosen: PersonRef[];
  onAdd: (p: PersonRef) => void;
  onRemove: (id: string) => void;
  max: number;
  exclude: string[];
}) {
  const [q, setQ] = useState("");
  const found = usePlayerDirectory(q);
  const results = (found.data ?? []).filter((p) => !exclude.includes(p.id));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <ul className="flex flex-wrap gap-2">
        {chosen.map((p) => (
          <li
            key={p.id}
            className="inline-flex h-10 items-center gap-1 rounded-full border border-line-faint pr-1 pl-4 text-sm font-semibold"
          >
            {p.name}
            <button
              type="button"
              onClick={() => onRemove(p.id)}
              className="grid size-8 place-items-center rounded-full text-line-dim hover:bg-court-raised hover:text-line"
              aria-label={`Remove ${p.name}`}
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {chosen.length < max && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-line-dim"
            aria-hidden
          />
          <Input
            type="search"
            aria-label={`Find a player for ${label}`}
            className="pl-9"
            placeholder="Type a name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q.trim().length >= 2 && (
            <ul className="mt-1 overflow-hidden rounded-xl border border-line-faint bg-court-raised">
              {results.length === 0 ? (
                <li className="p-3 text-sm text-line-dim">
                  {found.isPending ? "Searching…" : "No players with that name."}
                </li>
              ) : (
                results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-court-surface"
                      onClick={() => {
                        onAdd({ id: p.id, name: p.name });
                        setQ("");
                      }}
                    >
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-sm text-line-dim">{p.home_city ?? ""}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </fieldset>
  );
}

export function NewMatchPage() {
  const me = useMe();
  const navigate = useNavigate();
  const create = useCreateMatch();
  const self = me.data ? { id: me.data.id, name: me.data.name } : null;
  // Staff accounts without a player profile keep score; they don't play.
  const plays = !!me.data?.has_player_profile;
  const [params] = useSearchParams();
  const staffVenues = me.data?.memberships ?? [];
  const [venueId, setVenueId] = useState(params.get("venue") ?? "");
  const [courtId, setCourtId] = useState("");
  const [type, setType] = useState<"singles" | "doubles">("doubles");
  const [category, setCategory] = useState<"casual" | "competitive">("casual");
  const [teams, setTeams] = useState<[PersonRef[], PersonRef[]]>([
    self && plays && !params.get("venue") ? [self] : [],
    [],
  ]);
  const [format, setFormat] = useState<MatchFormat>(defaultFormat);
  const [first, setFirst] = useState<Side>(0);
  const [scorer, setScorer] = useState(self?.id ?? "");
  const size = type === "singles" ? 1 : 2;
  const everyone = [...teams[0], ...teams[1]];
  const err = create.error instanceof ApiError ? create.error : null;

  const setTeam = (side: Side, list: PersonRef[]) =>
    setTeams((t) => (side === 0 ? [list, t[1]] : [t[0], list]));
  const changeType = (t: "singles" | "doubles") => {
    setType(t);
    const n = t === "singles" ? 1 : 2;
    setTeams((x) => [x[0].slice(0, n), x[1].slice(0, n)]);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/matches"
        className="tap inline-flex items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
      >
        ← Matches
      </Link>
      <h1 className="mt-3 text-3xl font-expanded sm:text-4xl">Log a match</h1>
      <p className="mt-1 text-line-dim">
        Set it up, then keep score from your phone. Anyone with the link can watch.
      </p>
      <form
        noValidate
        className="mt-8 flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(
            {
              match_type: type,
              category,
              format,
              team_a: teams[0].map((p) => p.id),
              team_b: teams[1].map((p) => p.id),
              first_serving: first,
              scorer_id: scorer || undefined,
              court_id: courtId || undefined,
            },
            { onSuccess: (m) => navigate(`/matches/${m.id}`) },
          );
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Segmented
            label="Match"
            value={type}
            onChange={changeType}
            options={[
              { value: "doubles", label: "Doubles" },
              { value: "singles", label: "Singles" },
            ]}
          />
          <Segmented
            label="Kind"
            value={category}
            onChange={setCategory}
            options={[
              { value: "casual", label: "Casual" },
              { value: "competitive", label: "Competitive" },
            ]}
          />
        </div>
        <p className="-mt-3 text-sm text-line-dim">
          {category === "competitive"
            ? "Competitive results count for ratings once the other side confirms them."
            : "Casual matches go in your history but don't change ratings."}
        </p>

        {staffVenues.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="At your venue (optional)">
              {(p) => (
                <Select
                  {...p}
                  value={venueId}
                  onChange={(e) => {
                    setVenueId(e.target.value);
                    setCourtId("");
                  }}
                >
                  <option value="">Not on a venue court</option>
                  {staffVenues.map((v) => (
                    <option key={v.club_id} value={v.club_id}>
                      {v.club_name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {venueId && (
              <CourtSelect
                clubId={venueId}
                value={courtId}
                onChange={setCourtId}
                error={err?.field("court_id")}
              />
            )}
          </div>
        )}

        <div className="grid gap-6 sm:grid-cols-2">
          {([0, 1] as const).map((side) => (
            <div
              key={side}
              className={cn("rounded-2xl border p-4", side === 0 ? "border-field/40" : "border-ball/40")}
            >
              <PlayerPicker
                label={side === 0 ? "Side A" : "Side B"}
                chosen={teams[side]}
                max={size}
                exclude={everyone.map((p) => p.id)}
                onAdd={(p) => setTeam(side, [...teams[side], p])}
                onRemove={(id) =>
                  setTeam(
                    side,
                    teams[side].filter((p) => p.id !== id),
                  )
                }
              />
            </div>
          ))}
        </div>
        {err?.field("teams") && <p className="-mt-3 text-sm text-signal-red">{err.field("teams")}</p>}

        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Games to">
            {(p) => (
              <Select
                {...p}
                value={format.target}
                onChange={(e) => setFormat({ ...format, target: Number(e.target.value) as 11 | 15 | 21 })}
              >
                {[11, 15, 21].map((n) => (
                  <option key={n} value={n}>
                    {n}, win by 2
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Games">
            {(p) => (
              <Select
                {...p}
                value={format.best_of}
                onChange={(e) => setFormat({ ...format, best_of: Number(e.target.value) as 1 | 3 })}
              >
                <option value={1}>One game</option>
                <option value={3}>Best of 3</option>
              </Select>
            )}
          </Field>
          <Field label="Scoring">
            {(p) => (
              <Select
                {...p}
                value={format.scoring}
                onChange={(e) => setFormat({ ...format, scoring: e.target.value as "side_out" | "rally" })}
              >
                <option value="side_out">Side-out (serving side scores)</option>
                <option value="rally">Rally (every rally scores)</option>
              </Select>
            )}
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Segmented
            label="Serves first"
            value={String(first)}
            onChange={(v) => setFirst(Number(v) as Side)}
            options={[
              { value: "0", label: "Side A" },
              { value: "1", label: "Side B" },
            ]}
          />
          <Field label="Keeps score" error={err?.field("scorer_id")}>
            {(p) => (
              <Select {...p} value={scorer} onChange={(e) => setScorer(e.target.value)}>
                {self && <option value={self.id}>Me</option>}
                {everyone
                  .filter((x) => x.id !== self?.id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        </div>

        {err && !err.field("teams") && !err.field("scorer_id") && (
          <p role="alert" className="border-l-2 border-signal-red pl-3 text-sm">
            {err.message}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-fit"
          disabled={teams[0].length !== size || teams[1].length !== size}
          loading={create.isPending}
        >
          Create match
        </Button>
      </form>
    </div>
  );
}

function CourtSelect({
  clubId,
  value,
  onChange,
  error,
}: {
  clubId: string;
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  const courts = useCourts(clubId);
  return (
    <Field label="Court" error={error}>
      {(p) => (
        <Select {...p} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose a court</option>
          {courts.data
            ?.filter((c) => c.status === "active")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </Select>
      )}
    </Field>
  );
}
