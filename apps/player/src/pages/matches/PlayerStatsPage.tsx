import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Link, useParams } from "react-router";
import type { MatchType, PlayerStats, RatingSummary } from "@courtflex/api";
import { usePlayerStats } from "@courtflex/api";
import { cn, ErrorState, Segmented, Skeleton } from "@courtflex/ui";
import { MatchCard } from "./MatchesPages";

const TZ = "Asia/Manila";
const day = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: TZ });
const skillLabel = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** A player's ratings, record, form, rating over time and recent matches. /players/me for your own. */
export function PlayerStatsPage() {
  const { playerId } = useParams();
  const q = usePlayerStats(playerId);
  if (q.isPending) return <Skeleton className="mx-auto h-[36rem] max-w-3xl rounded-[28px]" />;
  if (q.error)
    return (
      <div className="mx-auto max-w-lg py-10">
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      </div>
    );
  return <Stats s={q.data} mine={playerId === "me"} />;
}

function Stats({ s, mine }: { s: PlayerStats; mine: boolean }) {
  const [type, setType] = useState<MatchType>(
    s.ratings.doubles.games >= s.ratings.singles.games ? "doubles" : "singles",
  );
  const winRate = s.totals.played ? Math.round((s.totals.wins / s.totals.played) * 100) : null;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header>
        <p className="text-sm text-line-dim">
          {skillLabel(s.player.skill)}
          {s.player.home_city ? ` · ${s.player.home_city}` : ""}
        </p>
        <h1 className="mt-1 text-3xl font-expanded sm:text-4xl">{mine ? "My stats" : s.player.name}</h1>
        {s.ranks.length > 0 && (
          <ul aria-label="Rankings" className="mt-3 flex flex-wrap gap-2">
            {s.ranks.map((r) => (
              <li key={`${r.type}-${r.area.scope}`}>
                <Link
                  to={`/rankings?type=${r.type}&scope=${r.area.scope}&area=${r.area.id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-faint px-3 text-sm hover:border-line-dim"
                >
                  <span className={cn("text-base font-condensed tabular-nums", r.rank === 1 && "text-ball")}>
                    #{r.rank}
                  </span>
                  <span className="text-line-dim">
                    {r.type} in {r.area.name.split(",")[0]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </header>

      <section aria-label="Ratings" className="grid gap-4 sm:grid-cols-2">
        <RatingCard r={s.ratings.singles} />
        <RatingCard r={s.ratings.doubles} />
      </section>

      <section aria-label="Record" className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <dl className="flex gap-8">
          <div>
            <dt className="text-sm text-line-dim">Played</dt>
            <dd className="text-3xl font-condensed tabular-nums">{s.totals.played}</dd>
          </div>
          <div>
            <dt className="text-sm text-line-dim">Won</dt>
            <dd className="text-3xl font-condensed tabular-nums">
              {s.totals.wins}
              {winRate !== null && <span className="ml-1.5 text-base text-line-dim">{winRate}%</span>}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-line-dim">Casual</dt>
            <dd className="text-3xl font-condensed tabular-nums">{s.totals.casual}</dd>
          </div>
        </dl>
        {s.form.length > 0 && (
          <div>
            <p className="text-sm text-line-dim">Last {s.form.length}, newest last</p>
            <ol className="mt-1 flex gap-1.5" aria-label={`Recent form: ${s.form.join(", ")}`}>
              {s.form.map((f, i) => (
                <li
                  key={i}
                  className={cn(
                    "grid size-8 place-items-center rounded-lg text-sm font-bold",
                    f === "W" ? "bg-field/15 text-field" : "bg-court-raised text-line-dim",
                  )}
                >
                  {f}
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <section
        aria-labelledby="chart-h"
        className="rounded-2xl border border-line-faint bg-court-surface p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="chart-h" className="text-lg font-expanded">
            {type === "singles" ? "Singles" : "Doubles"} rating over time
          </h2>
          <Segmented
            label="Show"
            value={type}
            onChange={setType}
            options={[
              { value: "doubles", label: "Doubles" },
              { value: "singles", label: "Singles" },
            ]}
            className="w-56"
          />
        </div>
        <RatingChart key={type} points={s.history[type]} />
      </section>

      <section aria-labelledby="recent-h">
        <h2 id="recent-h" className="text-xl font-expanded">
          Recent matches
        </h2>
        {s.recent.length === 0 ? (
          <p className="mt-3 text-line-dim">No finished matches yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {s.recent.map((m) => (
              <li key={m.id}>
                <MatchCard m={m} />
              </li>
            ))}
          </ul>
        )}
        {mine && (
          <Link
            to="/matches"
            className="mt-4 inline-block text-sm font-semibold text-ball underline underline-offset-4"
          >
            All my matches
          </Link>
        )}
      </section>
    </div>
  );
}

function RatingCard({ r }: { r: RatingSummary }) {
  return (
    <div className="rounded-2xl border border-line-faint bg-court-surface p-5">
      <p className="flex items-center justify-between gap-2 text-sm text-line-dim">
        {r.type === "singles" ? "Singles" : "Doubles"} rating
        {r.provisional && (
          <span className="rounded-full border border-dashed border-signal-amber px-2 py-0.5 text-xs font-semibold text-signal-amber">
            Provisional
          </span>
        )}
      </p>
      <p className="mt-1 text-5xl font-condensed tabular-nums">{r.rating}</p>
      <p className="mt-1 text-sm text-line-dim">
        {r.games === 0
          ? "No rated matches yet. Competitive matches count once they're confirmed."
          : `${r.wins} won, ${r.losses} lost in ${r.games} rated ${r.games === 1 ? "match" : "matches"}.`}
        {r.provisional && r.games > 0 && ` ${r.matches_to_rank} more to be ranked.`}
        {r.provisional && r.games === 0 && ` ${r.matches_to_rank} to be ranked.`}
      </p>
    </div>
  );
}

/**
 * Rating after each rated match. One series (the toggle picks it), so no
 * legend: the title names it. Hover or arrow keys show each point; the same
 * numbers are in a table below.
 */
function RatingChart({ points }: { points: Array<{ at: string; rating: number }> }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e!.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const H = 200;
  const pad = { l: 44, r: 16, t: 14, b: 26 };
  const geo = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((p) => p.rating);
    let lo = Math.floor((Math.min(...values) - 10) / 25) * 25;
    let hi = Math.ceil((Math.max(...values) + 10) / 25) * 25;
    if (hi - lo < 50) {
      lo -= 25;
      hi += 25;
    }
    const x = (i: number) =>
      pad.l +
      (points.length === 1
        ? (width - pad.l - pad.r) / 2
        : (i / (points.length - 1)) * (width - pad.l - pad.r));
    const y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
    const step = (hi - lo) / 4 >= 25 ? Math.round((hi - lo) / 4 / 25) * 25 : 25;
    const ticks: number[] = [];
    for (let t = lo; t <= hi; t += step) ticks.push(t);
    const path = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`)
      .join(" ");
    return { x, y, ticks, path };
    // pad is constant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, width]);

  if (!geo) {
    return <p className="mt-4 text-line-dim">No rated matches in this format yet.</p>;
  }

  const nearest = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < points.length; i++)
      if (Math.abs(geo.x(i) - px) < Math.abs(geo.x(best) - px)) best = i;
    return best;
  };
  const onMove = (e: PointerEvent) => setActive(nearest(e.clientX));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") setActive((a) => Math.min((a ?? -1) + 1, points.length - 1));
    else if (e.key === "ArrowLeft") setActive((a) => Math.max((a ?? points.length) - 1, 0));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(points.length - 1);
    else return;
    e.preventDefault();
  };
  const shown = active ?? points.length - 1;
  const p = points[shown]!;
  const prev = shown > 0 ? points[shown - 1]!.rating : null;
  const change = prev === null ? null : p.rating - prev;
  const tipLeft = Math.min(Math.max(geo.x(shown) - 70, 0), width - 140);

  return (
    <div className="mt-4">
      <div ref={box} className="relative">
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={`Rating from ${points[0]!.rating} to ${points.at(-1)!.rating} over ${points.length} rated matches. Use the arrow keys to step through them.`}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          className="block touch-pan-y outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ball"
        >
          {geo.ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.l}
                x2={width - pad.r}
                y1={geo.y(t)}
                y2={geo.y(t)}
                stroke="var(--color-line-faint)"
                strokeWidth={1}
              />
              <text
                x={pad.l - 8}
                y={geo.y(t)}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill="var(--color-line-dim)"
              >
                {t}
              </text>
            </g>
          ))}
          <text x={pad.l} y={H - 6} fontSize={11} fill="var(--color-line-dim)">
            {day.format(new Date(points[0]!.at))}
          </text>
          {points.length > 1 && (
            <text x={width - pad.r} y={H - 6} textAnchor="end" fontSize={11} fill="var(--color-line-dim)">
              {day.format(new Date(points.at(-1)!.at))}
            </text>
          )}
          {active !== null && (
            <line
              x1={geo.x(active)}
              x2={geo.x(active)}
              y1={pad.t}
              y2={H - pad.b}
              stroke="var(--color-line-dim)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}
          <path
            d={geo.path}
            fill="none"
            stroke="var(--color-field)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* The current (or hovered) point: an 8px marker with a surface ring. */}
          <circle
            cx={geo.x(shown)}
            cy={geo.y(p.rating)}
            r={5}
            fill="var(--color-field)"
            stroke="var(--color-court-surface)"
            strokeWidth={2}
          />
        </svg>
        <div
          aria-live="polite"
          className="pointer-events-none absolute top-0 w-[140px] rounded-lg border border-line-faint bg-court-deep px-3 py-1.5 text-xs shadow-lg"
          style={{ left: tipLeft }}
        >
          <span className="block text-line-dim">
            {day.format(new Date(p.at))} · match {shown + 1}
          </span>
          <span className="text-base font-condensed text-line tabular-nums">{p.rating}</span>
          {change !== null && (
            <span className="ml-2 text-line-dim tabular-nums">{change >= 0 ? `+${change}` : change}</span>
          )}
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold text-line-dim hover:text-line">
          Show as a table
        </summary>
        <table className="mt-2 w-full">
          <caption className="sr-only">Rating after each rated match</caption>
          <thead>
            <tr className="border-b border-line-faint text-left text-line-dim">
              <th scope="col" className="py-1.5 font-medium">
                Match
              </th>
              <th scope="col" className="py-1.5 font-medium">
                Date
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Rating
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((x, i) => (
              <tr key={i} className="border-b border-line-faint">
                <td className="py-1.5">{i + 1}</td>
                <td className="py-1.5">{day.format(new Date(x.at))}</td>
                <td className="py-1.5 text-right font-condensed tabular-nums">{x.rating}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
