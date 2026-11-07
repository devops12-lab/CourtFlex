import { useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, CalendarDays, MapPin, Plus, Trophy, Users } from "lucide-react";
import type {
  PersonRef,
  TournamentDetail,
  TournamentFormat,
  TournamentMatchView,
  TournamentSummary,
} from "@courtflex/api";
import {
  ApiError,
  formatMoney,
  useCancelTournament,
  useMe,
  useRegisterTournament,
  useStartTournament,
  useTournament,
  useTournamentHosts,
  useTournaments,
  useWithdrawTournament,
} from "@courtflex/api";
import { Button, cn, ErrorState, Field, Sheet, Skeleton, Tabs, Textarea, useToast } from "@courtflex/ui";
import { PlayerPicker } from "../matches/MatchesPages";

const TZ = "Asia/Manila";
const when = new Intl.DateTimeFormat("en-PH", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: TZ,
});
export const formatLabels: Record<TournamentFormat, string> = {
  single_elimination: "Single elimination",
  round_robin: "Round robin",
  pool_knockout: "Pool play, then knockout",
};
const statusLabels: Record<TournamentSummary["status"], string> = {
  registration: "Taking entries",
  in_progress: "Being played",
  completed: "Finished",
  cancelled: "Cancelled",
};

// ── List ──────────────────────────────────────────────────

export function TournamentsPage() {
  const me = useMe();
  const q = useTournaments();
  const hosts = useTournamentHosts(!!me.data);
  const groups: Array<[string, TournamentSummary[]]> = [
    ["Being played", q.data?.filter((t) => t.status === "in_progress") ?? []],
    ["Taking entries", q.data?.filter((t) => t.status === "registration") ?? []],
    ["Finished", q.data?.filter((t) => t.status === "completed") ?? []],
  ];
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-expanded sm:text-4xl">Tournaments</h1>
          <p className="mt-1 text-line-dim">
            Run by venues and clubs. Results count for your rating, like any competitive match.
          </p>
        </div>
        {!!hosts.data?.length && (
          <Link
            to="/tournaments/new"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-ball px-5 font-semibold text-ball-ink hover:bg-ball-bright"
          >
            <Plus className="size-4" aria-hidden />
            Run a tournament
          </Link>
        )}
      </header>
      {q.isPending ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <p className="rounded-2xl border border-line-faint p-6 text-line-dim">No tournaments yet.</p>
      ) : (
        groups
          .filter(([, list]) => list.length > 0)
          .map(([title, list]) => (
            <section key={title} aria-labelledby={`${title.toLowerCase().replace(/\W+/g, "-")}-h`}>
              <h2 id={`${title.toLowerCase().replace(/\W+/g, "-")}-h`} className="text-xl font-expanded">
                {title}
              </h2>
              <ul className="mt-3 grid gap-4 md:grid-cols-2">
                {list.map((t) => (
                  <li key={t.id}>
                    <TournamentCard t={t} />
                  </li>
                ))}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}

export function TournamentCard({ t }: { t: TournamentSummary }) {
  const full = t.entries_count >= t.capacity;
  return (
    <Link
      to={`/tournaments/${t.slug}`}
      className="group flex h-full flex-col rounded-2xl border border-line-faint bg-court-surface p-5 transition-colors hover:border-line-dim"
    >
      <p className="flex items-center gap-2 text-xs font-semibold text-line-dim">
        {t.status === "in_progress" && (
          <span aria-hidden className="size-2 animate-pulse rounded-full bg-signal-red" />
        )}
        {statusLabels[t.status]}
        <span className="font-normal">
          · {t.match_type === "singles" ? "Singles" : "Doubles"}, {formatLabels[t.format].toLowerCase()}
        </span>
      </p>
      <h3 className="mt-2 text-xl leading-tight font-expanded group-hover:text-ball">{t.name}</h3>
      <p className="mt-1 text-sm text-line-dim">by {t.host.name}</p>
      <ul className="mt-4 flex flex-col gap-1.5 text-sm">
        <li className="flex items-center gap-2">
          <CalendarDays className="size-4 text-line-dim" aria-hidden />
          {when.format(new Date(t.starts_at))}
        </li>
        <li className="flex items-center gap-2">
          <MapPin className="size-4 text-line-dim" aria-hidden />
          {t.venue.name}, {t.venue.city}
        </li>
        <li className="flex items-center gap-2">
          <Users className="size-4 text-line-dim" aria-hidden />
          {t.entries_count} of {t.capacity} {t.match_type === "doubles" ? "teams" : "players"}
          {t.status === "registration" && full && <span className="text-signal-amber">· full</span>}
        </li>
      </ul>
      <p className="mt-auto pt-4 text-sm">
        {t.champion ? (
          <span className="flex items-center gap-2 font-semibold text-ball">
            <Trophy className="size-4" aria-hidden />
            {t.champion.name}
          </span>
        ) : (
          <span className="text-line-dim">
            {Number(t.entry_fee) > 0 ? `${formatMoney(t.entry_fee)} entry, paid at the venue` : "Free entry"}
          </span>
        )}
      </p>
    </Link>
  );
}

// ── One tournament ────────────────────────────────────────

export function TournamentPage() {
  const { slug } = useParams();
  const q = useTournament(slug);
  if (q.isPending) return <Skeleton className="mx-auto h-[36rem] max-w-5xl rounded-[28px]" />;
  if (q.error)
    return (
      <div className="mx-auto max-w-lg py-10">
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      </div>
    );
  // Keyed by status: starting the tournament opens the new draw.
  return <Tournament key={q.data.status} t={q.data} />;
}

type View = "draw" | "entries";

function Tournament({ t }: { t: TournamentDetail }) {
  const [view, setView] = useState<View>(t.status === "registration" ? "entries" : "draw");
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link
        to="/tournaments"
        className="tap inline-flex w-fit items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Tournaments
      </Link>
      <header className="flex flex-col gap-3">
        <p className="flex flex-wrap items-center gap-2 text-sm text-line-dim">
          <span
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold",
              t.status === "in_progress" ? "border-signal-red/70 text-line" : "border-line-faint",
            )}
          >
            {t.status === "in_progress" && (
              <span aria-hidden className="size-2 animate-pulse rounded-full bg-signal-red" />
            )}
            {statusLabels[t.status]}
          </span>
          {t.match_type === "singles" ? "Singles" : "Doubles"} · {formatLabels[t.format]}
          {t.pools ? ` (${t.pools} pools)` : ""}
        </p>
        <h1 className="text-3xl leading-tight font-expanded sm:text-5xl">{t.name}</h1>
        <p className="text-line-dim">
          by {t.host.name} · {when.format(new Date(t.starts_at))} · {t.venue.name}, {t.venue.city}
        </p>
        {t.description && <p className="max-w-2xl">{t.description}</p>}
        <p className="text-sm text-line-dim">
          Games to {t.game.target}, win by 2, {t.game.best_of === 3 ? "best of 3" : "one game"},{" "}
          {t.game.scoring === "rally" ? "rally scoring" : "side-out scoring"} · Courts:{" "}
          {t.courts.map((c) => c.name).join(", ")} ·{" "}
          {Number(t.entry_fee) > 0 ? `${formatMoney(t.entry_fee)} entry, paid at the venue` : "Free entry"}
        </p>
      </header>

      {t.champion && (
        <section
          aria-label="Champion"
          className="flex items-center gap-4 rounded-2xl border border-ball/60 bg-ball/10 p-5"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ball text-ball-ink">
            <Trophy className="size-6" aria-hidden />
          </span>
          <div>
            <p className="text-sm text-line-dim">Champion</p>
            <p className="text-2xl font-expanded">{t.champion.name}</p>
          </div>
        </section>
      )}
      {t.status === "cancelled" && (
        <p className="rounded-2xl border border-signal-red/60 bg-signal-red/10 p-4 text-sm">
          <strong>Cancelled.</strong> {t.cancel_reason}
        </p>
      )}

      <Registration t={t} />
      {t.can_manage && <Organizer t={t} />}

      <Tabs<View>
        label="Tournament"
        value={view}
        onChange={setView}
        items={[
          { value: "draw", label: "Draw", disabled: t.status === "registration" },
          { value: "entries", label: "Entries", count: t.entries.length },
        ]}
      >
        {(v) => <div className="mt-6">{v === "entries" ? <Entries t={t} /> : <Draw t={t} />}</div>}
      </Tabs>
    </div>
  );
}

function Registration({ t }: { t: TournamentDetail }) {
  const me = useMe();
  const register = useRegisterTournament(t.id);
  const withdraw = useWithdrawTournament(t.id);
  const toast = useToast();
  const [partner, setPartner] = useState<PersonRef | null>(null);
  const err = register.error instanceof ApiError ? register.error : null;
  if (t.status !== "registration") return null;
  if (t.my_entry_id)
    return (
      <section
        aria-label="Your entry"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-field/50 bg-field/10 p-4"
      >
        <p>
          <strong>You're in.</strong>{" "}
          <span className="text-line-dim">
            {t.entries.find((e) => e.id === t.my_entry_id)?.name}. The draw is made when the organizer starts
            the tournament.
          </span>
        </p>
        <Button
          size="sm"
          loading={withdraw.isPending}
          onClick={() =>
            withdraw.mutate({}, { onSuccess: () => toast({ tone: "success", message: "You've withdrawn." }) })
          }
        >
          Withdraw
        </Button>
      </section>
    );
  if (!t.can_register)
    return t.register_note ? (
      <p className="rounded-2xl border border-line-faint p-4 text-sm text-line-dim">
        {t.register_note}
        {!me.data && (
          <>
            {" "}
            <Link
              to="/login"
              state={{ from: `/tournaments/${t.slug}` }}
              className="font-semibold text-ball underline underline-offset-4"
            >
              Sign in
            </Link>
          </>
        )}
      </p>
    ) : null;
  const doubles = t.match_type === "doubles";
  return (
    <section
      aria-labelledby="register-h"
      className="flex flex-col gap-4 rounded-2xl border border-ball/50 bg-court-surface p-5"
    >
      <div>
        <h2 id="register-h" className="text-lg font-expanded">
          Register
        </h2>
        <p className="mt-1 text-sm text-line-dim">
          {t.capacity - t.entries_count} of {t.capacity} places left. Registration closes{" "}
          {when.format(new Date(t.registration_closes_at))}.
        </p>
      </div>
      {doubles && (
        <PlayerPicker
          label="Your partner"
          chosen={partner ? [partner] : []}
          max={1}
          exclude={[me.data?.id ?? "", ...t.entries.flatMap((e) => e.players.map((p) => p.id))]}
          onAdd={setPartner}
          onRemove={() => setPartner(null)}
        />
      )}
      {(err?.field("partner_id") || (err && !err.field("partner_id"))) && (
        <p role="alert" className="text-sm text-signal-red">
          {err?.field("partner_id") ?? err?.message}
        </p>
      )}
      <Button
        variant="primary"
        className="w-fit"
        disabled={doubles && !partner}
        loading={register.isPending}
        onClick={() =>
          register.mutate(
            { partner_id: partner?.id },
            { onSuccess: () => toast({ tone: "success", message: `You're registered for ${t.name}.` }) },
          )
        }
      >
        {doubles ? "Register our team" : "Register"}
      </Button>
    </section>
  );
}

function Organizer({ t }: { t: TournamentDetail }) {
  const start = useStartTournament(t.id);
  const cancel = useCancelTournament(t.id);
  const toast = useToast();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const cancelErr = cancel.error instanceof ApiError ? cancel.error : null;
  if (t.status === "completed" || t.status === "cancelled") return null;
  return (
    <section aria-labelledby="org-h" className="flex flex-col gap-3 rounded-2xl border border-line-faint p-5">
      <h2 id="org-h" className="text-lg font-expanded">
        Organizer
      </h2>
      {t.status === "registration" ? (
        <p className="text-sm text-line-dim">
          Starting makes the draw: entries are seeded by rating and the first matches are created, each with
          you as scorer (change it on the match page). No one can register or withdraw after that.
        </p>
      ) : (
        <p className="text-sm text-line-dim">
          Each match has its own page: start it, keep score or hand scoring to someone, and submit the result.
          Winners move on by themselves.
        </p>
      )}
      {start.error && <p className="text-sm text-signal-red">{start.error.message}</p>}
      <div className="flex flex-wrap gap-2">
        {t.status === "registration" && (
          <Button
            variant="primary"
            loading={start.isPending}
            onClick={() =>
              start.mutate({}, { onSuccess: () => toast({ tone: "success", message: "The draw is made." }) })
            }
          >
            Start tournament ({t.entries_count} {t.match_type === "doubles" ? "teams" : "players"})
          </Button>
        )}
        <Button variant="danger" onClick={() => setCancelling(true)}>
          Cancel tournament
        </Button>
      </div>
      <Sheet
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancel this tournament?"
        description="Matches not played yet are voided. Finished ones stay in everyone's history and ratings."
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setCancelling(false)}>Keep it</Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() =>
                cancel.mutate(
                  { reason: reason.trim() },
                  {
                    onSuccess: () => {
                      setCancelling(false);
                      toast({ tone: "success", message: "Tournament cancelled." });
                    },
                  },
                )
              }
            >
              Cancel tournament
            </Button>
          </div>
        }
      >
        <Field
          label="Reason"
          hint="At least 10 characters. Everyone sees it."
          error={cancelErr?.field("reason")}
        >
          {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </Sheet>
    </section>
  );
}

function Entries({ t }: { t: TournamentDetail }) {
  if (t.entries.length === 0) return <p className="text-line-dim">No entries yet.</p>;
  return (
    <ol className="divide-y divide-line-faint border-y border-line-faint">
      {t.entries.map((e, i) => (
        <li key={e.id} className="flex items-center justify-between gap-3 py-3">
          <span className="flex min-w-0 items-center gap-3">
            <span className="w-8 shrink-0 text-lg font-condensed text-line-dim tabular-nums">
              {e.seed ?? i + 1}
            </span>
            <span className="min-w-0">
              <span className={cn("block truncate font-semibold", e.id === t.my_entry_id && "text-ball")}>
                {e.name}
              </span>
              {e.players.length > 1 && (
                <span className="block truncate text-sm text-line-dim">
                  {e.players.map((p) => p.name).join(" and ")}
                </span>
              )}
            </span>
          </span>
          <span className="font-condensed text-line-dim tabular-nums">{e.rating}</span>
        </li>
      ))}
    </ol>
  );
}

// ── The draw ──────────────────────────────────────────────

function Draw({ t }: { t: TournamentDetail }) {
  const knockout = t.matches.filter((m) => m.stage === "knockout");
  return (
    <div className="flex flex-col gap-10">
      {t.standings.map((s) => (
        <Group key={s.pool ?? "rr"} t={t} pool={s.pool} />
      ))}
      {t.format === "pool_knockout" && knockout.length === 0 && t.status === "in_progress" && (
        <p className="rounded-2xl border border-dashed border-line-faint p-5 text-line-dim">
          The knockout starts when every pool match is done: the top two of each pool go through.
        </p>
      )}
      {knockout.length > 0 && <Bracket t={t} list={knockout} />}
    </div>
  );
}

/** A round-robin table and its matches (one per pool in pool play). */
function Group({ t, pool }: { t: TournamentDetail; pool: string | null }) {
  const table = t.standings.find((s) => s.pool === pool)!;
  const list = t.matches.filter((m) => m.pool === pool && m.stage !== "knockout");
  const advance = t.format === "pool_knockout" ? 2 : 1;
  return (
    <section aria-labelledby={`group-${pool ?? "rr"}`} className="flex flex-col gap-4">
      <h2 id={`group-${pool ?? "rr"}`} className="text-xl font-expanded">
        {pool ? `Pool ${pool}` : "Standings"}
      </h2>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <caption className="sr-only">{pool ? `Pool ${pool} standings` : "Standings"}</caption>
          <thead>
            <tr className="border-b-2 border-line text-left text-line-dim">
              <th scope="col" className="w-10 py-2 font-medium">
                #
              </th>
              <th scope="col" className="py-2 font-medium">
                {t.match_type === "doubles" ? "Team" : "Player"}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Played
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Won
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Points
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Diff.
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr
                key={r.id}
                className={cn("border-b border-line-faint", i < advance && r.played > 0 && "bg-field/8")}
              >
                <td className="py-2.5 text-base font-condensed tabular-nums">{i + 1}</td>
                <td className={cn("py-2.5 font-semibold", r.entry.id === t.my_entry_id && "text-ball")}>
                  {r.entry.name}
                  {r.entry.seed && (
                    <span className="ml-1.5 text-xs font-normal text-line-dim">({r.entry.seed})</span>
                  )}
                </td>
                <td className="py-2.5 text-right tabular-nums">{r.played}</td>
                <td className="py-2.5 text-right tabular-nums">{r.wins}</td>
                <td className="py-2.5 text-right text-line-dim tabular-nums">
                  {r.points_for}–{r.points_against}
                </td>
                <td className="py-2.5 text-right tabular-nums">{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="rounded-2xl border border-line-faint p-4">
        <summary className="cursor-pointer font-semibold">
          Matches ({list.filter((m) => m.winner_entry_id).length} of {list.length} played)
        </summary>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {list.map((m) => (
            <li key={m.id}>
              <MatchBox m={m} t={t} />
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** The knockout: one column per round, matches centred against the ones that feed them. */
function Bracket({ t, list }: { t: TournamentDetail; list: TournamentMatchView[] }) {
  const rounds = [...new Set(list.map((m) => m.round))].sort((a, b) => a - b);
  return (
    <section aria-labelledby="bracket-h" className="flex flex-col gap-4">
      <h2 id="bracket-h" className="text-xl font-expanded">
        {t.format === "pool_knockout" ? "Knockout" : "Bracket"}
      </h2>
      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <ol className="flex min-w-max gap-6">
          {rounds.map((r) => {
            const inRound = list.filter((m) => m.round === r);
            return (
              <li key={r} className="flex w-60 flex-col">
                <h3 className="mb-3 text-sm font-semibold text-line-dim">{inRound[0]!.round_name}</h3>
                <ul className="flex flex-1 flex-col justify-around gap-3">
                  {inRound.map((m) => (
                    <li key={m.id}>
                      <MatchBox m={m} t={t} />
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function MatchBox({ m, t }: { m: TournamentMatchView; t: TournamentDetail }) {
  const games = m.match?.score ? m.match.score.split(", ") : [];
  const live = m.match?.status === "in_progress";
  const side = (i: 0 | 1) => {
    const e = m.entries[i];
    const won = !!e && m.winner_entry_id === e.id;
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2",
          i === 1 && "border-t border-line-faint",
        )}
      >
        <span
          className={cn(
            "min-w-0 truncate text-sm",
            won ? "font-semibold text-line" : "text-line-dim",
            e?.id === t.my_entry_id && "text-ball",
          )}
        >
          {e ? (
            <>
              {e.seed && <span className="mr-1.5 text-xs text-line-dim tabular-nums">{e.seed}</span>}
              {e.name}
            </>
          ) : m.bye ? (
            <span className="italic">Bye</span>
          ) : (
            <span className="italic">To be decided</span>
          )}
        </span>
        <span className="flex gap-2 font-condensed tabular-nums">
          {games.map((g, k) => (
            <span key={k} className={cn(won ? "text-line" : "text-line-dim")}>
              {g.split("-")[i]}
            </span>
          ))}
        </span>
      </div>
    );
  };
  const body = (
    <>
      {side(0)}
      {side(1)}
      {m.match && (m.match.status === "scheduled" || live) && (
        <p className="flex items-center gap-1.5 border-t border-line-faint px-3 py-1.5 text-xs text-line-dim">
          {live && <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-signal-red" />}
          {live ? "Live" : "Next"}
          {m.match.court ? ` · ${m.match.court}` : ""}
        </p>
      )}
    </>
  );
  const cls = cn(
    "block overflow-hidden rounded-xl border bg-court-surface",
    live ? "border-signal-red/60" : "border-line-faint",
    m.match && "transition-colors hover:border-line-dim",
  );
  return m.match ? (
    <Link
      to={`/matches/${m.match.id}`}
      className={cls}
      aria-label={`${m.round_name}: ${m.entries.map((e) => e?.name ?? "to be decided").join(" vs ")}`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
