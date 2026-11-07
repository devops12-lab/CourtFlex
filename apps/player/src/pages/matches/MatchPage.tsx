import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, History, RotateCcw, Share2, Trophy, WifiOff } from "lucide-react";
import type { MatchDetail, PersonRef, Side } from "@courtflex/api";
import {
  ApiError,
  newEventId,
  useMatch,
  useMatchEvents,
  useScorePoint,
  useStartMatch,
  useSubmitResult,
  useUndoPoint,
  useChangeScorer,
  useConfirmResult,
  useDisputeResult,
  useVerifyResult,
  useVoidMatch,
} from "@courtflex/api";
import {
  Button,
  cn,
  ErrorState,
  Field,
  Select,
  Sheet,
  Skeleton,
  Textarea,
  useOnline,
  useToast,
} from "@courtflex/ui";

const TZ = "Asia/Manila";
const names = (team: PersonRef[]) => team.map((p) => p.name.split(" ")[0]).join(" & ");
const fullNames = (team: PersonRef[]) => team.map((p) => p.name).join(" and ");

export const statusText: Record<MatchDetail["status"], string> = {
  scheduled: "Not started",
  in_progress: "Live",
  awaiting_confirmation: "Waiting for players to confirm",
  completed: "Final",
  disputed: "Disputed",
  voided: "Void",
};

/** Side A is court green, side B is ball gold, everywhere a match is shown. */
export const sideTone = [
  { text: "text-field", ring: "ring-field/60", bg: "bg-field/12", dot: "bg-field" },
  { text: "text-ball", ring: "ring-ball/60", bg: "bg-ball/12", dot: "bg-ball" },
] as const;

/**
 * A match: the Live Scorer for its scorer, a live scoreboard for everyone else.
 * The server's score is the official one; this screen shows what the server says.
 */
export function MatchPage() {
  const { matchId } = useParams();
  const q = useMatch(matchId);
  if (q.isPending) return <Skeleton className="mx-auto h-[32rem] max-w-3xl rounded-[28px]" />;
  if (q.error)
    return (
      <div className="mx-auto max-w-lg py-10">
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      </div>
    );
  return <Match m={q.data} />;
}

type Pending = { uuid: string; kind: "point"; winner: Side } | { uuid: string; kind: "undo" };

function Match({ m }: { m: MatchDetail }) {
  const online = useOnline();
  const toast = useToast();
  const score = useScorePoint(m.id);
  const undo = useUndoPoint(m.id);
  const start = useStartMatch(m.id);
  const submit = useSubmitResult(m.id);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scoring = m.can_score && m.status === "in_progress";
  const over = m.state.winner !== null;

  /** Sends one tap. A dropped connection keeps it and resends the same id until it lands. */
  const send = useCallback(
    (p: Pending) => {
      const attempt = () => {
        const done = {
          onSuccess: () => {
            setPending(null);
            setReconnecting(false);
          },
          onError: (e: Error) => {
            if (e instanceof ApiError && e.kind === "network") {
              setReconnecting(true);
              retry.current = setTimeout(attempt, 2_000);
            } else {
              setPending(null);
              setReconnecting(false);
              setError(e.message);
            }
          },
        };
        if (p.kind === "point") score.mutate({ event_uuid: p.uuid, winner: p.winner }, done);
        else undo.mutate({ event_uuid: p.uuid }, done);
      };
      setPending(p);
      setError(null);
      attempt();
    },
    [score, undo],
  );
  useEffect(() => () => void (retry.current && clearTimeout(retry.current)), []);

  const rally = (winner: Side) => {
    if (!scoring || pending || over) return;
    if ("vibrate" in navigator) navigator.vibrate?.(12);
    send({ uuid: newEventId(), kind: "point", winner });
  };

  const share = async () => {
    const url = window.location.href;
    if (navigator.share)
      await navigator.share({ title: "Live pickleball match", url }).catch(() => undefined);
    else {
      await navigator.clipboard?.writeText(url);
      toast({ tone: "success", message: "Link copied. Anyone with it can watch." });
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/matches"
          className="tap inline-flex items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Matches
        </Link>
        <button
          type="button"
          onClick={share}
          className="tap inline-flex items-center gap-1.5 text-sm font-semibold text-line-dim hover:text-line"
        >
          <Share2 className="size-4" aria-hidden />
          Share to watch
        </button>
      </div>

      <header>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-line-dim">
          <StatusPill status={m.status} />
          <span>
            {m.match_type === "singles" ? "Singles" : "Doubles"}, {m.category}
          </span>
          <span aria-hidden>·</span>
          <span>
            {m.format.best_of === 3 ? "Best of 3, " : ""}to {m.format.target}, win by {m.format.win_by},{" "}
            {m.format.scoring === "rally" ? "rally scoring" : "side-out scoring"}
          </span>
        </p>
        <h1 className="mt-2 text-2xl leading-tight font-expanded sm:text-3xl">
          {names(m.teams[0])} <span className="text-line-dim">vs</span> {names(m.teams[1])}
        </h1>
        <p className="mt-1 text-sm text-line-dim">
          {[
            m.court && m.venue ? `${m.court.name}, ${m.venue.name}` : m.venue?.name,
            m.session?.title,
            `Scorer: ${m.scorer.name}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      {(reconnecting || (!online && scoring)) && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-2xl border border-signal-amber/60 bg-signal-amber/10 p-3 text-sm"
        >
          <WifiOff className="size-4 shrink-0 text-signal-amber" aria-hidden />
          Reconnecting.{" "}
          {pending
            ? "Your last tap is saved and will be sent once you're back online."
            : "Scoring waits until you're back online."}
        </p>
      )}

      <Board m={m} interactive={scoring && !over && !pending && online} pending={pending} onRally={rally} />

      {error && (
        <p role="alert" className="border-l-2 border-signal-red pl-3 text-sm">
          {error}
        </p>
      )}

      {/* Before the first serve */}
      {m.status === "scheduled" &&
        (m.can_score ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-line-faint bg-court-surface p-5 text-center">
            <p>
              <strong>{names(m.teams[m.first_serving])}</strong> serve first. Tap a side when it wins a rally.
            </p>
            <Button
              variant="primary"
              size="lg"
              loading={start.isPending}
              onClick={() => start.mutate({}, { onError: (e) => setError(e.message) })}
            >
              Start match
            </Button>
          </div>
        ) : (
          <p className="text-center text-line-dim">Starts when {m.scorer.name} begins scoring.</p>
        ))}

      {/* Scoring tools */}
      {scoring && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            disabled={!!pending || m.state.rallies === 0 || !online}
            onClick={() => send({ uuid: newEventId(), kind: "undo" })}
          >
            <RotateCcw className="size-4" aria-hidden />
            Undo last rally
          </Button>
          <Button variant="ghost" onClick={() => setHistoryOpen(true)}>
            <History className="size-4" aria-hidden />
            Point history
          </Button>
        </div>
      )}
      {scoring && over && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-ball/50 bg-ball/10 p-5 text-center">
          <Trophy className="size-7 text-ball" aria-hidden />
          <p className="text-lg">
            <strong>{fullNames(m.teams[m.state.winner!])}</strong> win {m.score}.
          </p>
          <p className="text-sm text-line-dim">
            Check the score, then submit it.{" "}
            {m.category === "competitive"
              ? "The other side confirms it before it counts for ratings."
              : "Casual matches don't change ratings."}
          </p>
          <Button
            variant="primary"
            size="lg"
            loading={submit.isPending}
            onClick={() =>
              submit.mutate(
                {},
                {
                  onSuccess: () => toast({ tone: "success", message: "Result submitted." }),
                  onError: (e) => setError(e.message),
                },
              )
            }
          >
            Submit result
          </Button>
        </div>
      )}

      {/* Finished */}
      {(m.status === "awaiting_confirmation" || m.status === "completed" || m.status === "disputed") && (
        <ResultPanel m={m} />
      )}
      {m.status === "voided" && (
        <p className="rounded-2xl border border-line-faint p-5 text-line-dim">
          This match was voided. It doesn't count.
          {m.result?.dispute?.resolution?.decision === "void" && (
            <span className="mt-1 block">
              {m.result.dispute.by.name} disputed it; {m.result.dispute.resolution.by.name} (CourtFlex) voided
              it: {m.result.dispute.resolution.note}
            </span>
          )}
        </p>
      )}

      {!scoring && m.state.rallies > 0 && (
        <Button variant="ghost" className="w-fit" onClick={() => setHistoryOpen(true)}>
          <History className="size-4" aria-hidden />
          Point history
        </Button>
      )}
      {m.can_manage &&
        ["scheduled", "in_progress", "awaiting_confirmation", "disputed"].includes(m.status) && (
          <Organizer m={m} />
        )}

      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="Point history">
        <PointHistory m={m} open={historyOpen} />
      </Sheet>
    </div>
  );
}

function StatusPill({ status }: { status: MatchDetail["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold",
        status === "in_progress" ? "border-signal-red/70 text-line" : "border-line-faint text-line-dim",
      )}
    >
      {status === "in_progress" && (
        <span aria-hidden className="size-2 animate-pulse rounded-full bg-signal-red" />
      )}
      {statusText[status]}
    </span>
  );
}

/**
 * The court: one half per side. For the scorer each half is a big button that
 * gives that side the rally; for everyone else it's the live scoreboard.
 */
function Board({
  m,
  interactive,
  pending,
  onRally,
}: {
  m: MatchDetail;
  interactive: boolean;
  pending: Pending | null;
  onRally: (s: Side) => void;
}) {
  const s = m.state;
  const g = s.games[s.current]!;
  const flag = s.match_point !== null ? "Match point" : s.game_point !== null ? "Game point" : null;
  return (
    <section aria-label="Score" className="relative">
      <div className="grid overflow-hidden rounded-[28px] border-2 border-line/70 bg-court-surface md:grid-cols-2">
        {([0, 1] as const).map((side) => {
          const serving = s.winner === null && m.status === "in_progress" && s.serving === side;
          const label = `${names(m.teams[side])}: ${g.points[side]}${serving ? ", serving" : ""}`;
          const body = (
            <>
              <span className="flex w-full items-center justify-between gap-2">
                <span
                  className={cn("truncate text-left text-base font-semibold sm:text-lg", sideTone[side].text)}
                >
                  {names(m.teams[side])}
                </span>
                {m.format.best_of === 3 && (
                  <span
                    className="shrink-0 text-xs text-line-dim"
                    aria-label={`${s.games_won[side]} games won`}
                  >
                    {Array.from({ length: 2 }, (_, i) => (
                      <span
                        key={i}
                        aria-hidden
                        className={cn(
                          "ml-1 inline-block size-2.5 rounded-full",
                          i < s.games_won[side] ? sideTone[side].dot : "bg-court-raised",
                        )}
                      />
                    ))}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "block text-[7rem] leading-none font-condensed tabular-nums sm:text-[9rem]",
                  s.winner === side && sideTone[side].text,
                )}
              >
                {g.points[side]}
              </span>
              <span className="flex h-6 items-center gap-1.5 text-sm text-line-dim">
                {serving && (
                  <>
                    <span
                      aria-hidden
                      className="size-3 rounded-full bg-ball shadow-[0_0_12px_rgb(252_191_14/0.7)]"
                    />
                    Serving{s.server ? `, server ${s.server}` : ""}
                  </>
                )}
                {pending?.kind === "point" && pending.winner === side && (
                  <span className="text-line">Sending…</span>
                )}
              </span>
            </>
          );
          const cls = cn(
            "flex min-h-52 flex-col items-center justify-between gap-2 p-5 sm:min-h-64",
            side === 1 && "border-t-2 border-line/70 md:border-t-0 md:border-l-2",
            serving && sideTone[side].bg,
          );
          return interactive ? (
            <button
              key={side}
              type="button"
              aria-label={`Rally to ${label}`}
              onClick={() => onRally(side)}
              className={cn(
                cls,
                "transition-[background-color,transform] duration-150 select-none active:scale-[0.98] active:bg-court-raised",
              )}
            >
              {body}
            </button>
          ) : (
            <div key={side} className={cls} aria-label={label}>
              {body}
            </div>
          );
        })}
      </div>
      {/* The called score sits on the net. */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center md:top-auto md:bottom-4 md:translate-y-0">
        <p className="flex items-center gap-2 rounded-full border border-line/70 bg-court-deep px-4 py-1.5 shadow-lg">
          <span className="text-xl font-condensed tabular-nums" aria-label={`Called score ${s.called}`}>
            {s.called}
          </span>
          {m.format.best_of === 3 && <span className="text-xs text-line-dim">Game {s.current + 1}</span>}
          {flag && (
            <span className="rounded-full bg-ball px-2 py-0.5 text-xs font-bold text-ball-ink">{flag}</span>
          )}
        </p>
      </div>
      {m.format.best_of === 3 && s.current > 0 && (
        <p className="mt-2 text-center text-sm text-line-dim">
          Games:{" "}
          {s.games
            .filter((x) => x.winner !== null)
            .map((x) => `${x.points[0]}-${x.points[1]}`)
            .join(", ")}
        </p>
      )}
    </section>
  );
}

function PointHistory({ m, open }: { m: MatchDetail; open: boolean }) {
  const q = useMatchEvents(m.id, open);
  if (q.isPending) return <Skeleton className="h-40" />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  if (q.data.length === 0) return <p className="text-line-dim">No rallies yet.</p>;
  const time = new Intl.DateTimeFormat("en-PH", { timeStyle: "short", timeZone: TZ });
  return (
    <ol className="divide-y divide-line-faint">
      {q.data.map((e) => (
        <li key={e.seq} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span className="flex items-center gap-2">
            {e.type === "undo" ? (
              <span className="text-line-dim">Undo</span>
            ) : (
              <>
                <span aria-hidden className={cn("size-2.5 rounded-full", sideTone[e.winner!].dot)} />
                Rally to {names(m.teams[e.winner!])}
              </>
            )}
          </span>
          <span className="flex items-center gap-3 text-line-dim">
            <span className="text-base font-condensed text-line tabular-nums">{e.called_after}</span>
            {m.format.best_of === 3 && <span>G{e.game}</span>}
            <time dateTime={e.at}>{time.format(new Date(e.at))}</time>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** For the match's organizer: hand scoring to someone else, or void the match. */
function Organizer({ m }: { m: MatchDetail }) {
  const changeScorer = useChangeScorer(m.id);
  const voidMatch = useVoidMatch(m.id);
  const toast = useToast();
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const people = [...m.teams[0], ...m.teams[1], m.created_by].filter(
    (p, i, all) => all.findIndex((x) => x.id === p.id) === i,
  );
  const voidErr = voidMatch.error instanceof ApiError ? voidMatch.error : null;
  return (
    <section aria-labelledby="org-h" className="rounded-2xl border border-line-faint p-5">
      <h2 id="org-h" className="text-lg font-expanded">
        Organizer
      </h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Field label="Keeps score" className="min-w-56 flex-1">
          {(p) => (
            <Select
              {...p}
              value={m.scorer.id}
              disabled={changeScorer.isPending}
              onChange={(e) =>
                changeScorer.mutate(
                  { scorer_id: e.target.value },
                  {
                    onSuccess: (r) =>
                      toast({ tone: "success", message: `${r.scorer.name} keeps score now.` }),
                    onError: (er) => toast({ tone: "error", message: er.message }),
                  },
                )
              }
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {!people.some((p) => p.id === m.scorer.id) && (
                <option value={m.scorer.id}>{m.scorer.name}</option>
              )}
            </Select>
          )}
        </Field>
        <Button variant="danger" onClick={() => setVoiding(true)}>
          Void match
        </Button>
      </div>
      <Sheet
        open={voiding}
        onClose={() => setVoiding(false)}
        title="Void this match?"
        description="It stays on record, marked void, and never counts for anyone."
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setVoiding(false)}>Keep it</Button>
            <Button
              variant="danger"
              loading={voidMatch.isPending}
              onClick={() =>
                voidMatch.mutate(
                  { reason: reason.trim() },
                  {
                    onSuccess: () => {
                      setVoiding(false);
                      toast({ tone: "success", message: "Match voided." });
                    },
                  },
                )
              }
            >
              Void match
            </Button>
          </div>
        }
      >
        <Field label="Reason" hint="At least 10 characters." error={voidErr?.field("reason")}>
          {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        {voidErr && !voidErr.field("reason") && (
          <p className="mt-2 text-sm text-signal-red">{voidErr.message}</p>
        )}
      </Sheet>
    </section>
  );
}

const when = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: TZ });

/**
 * The result: who won, whether it's official yet, and what the viewer can do
 * about it (confirm, dispute, or, for an organizer, make it official).
 */
function ResultPanel({ m }: { m: MatchDetail }) {
  const confirm = useConfirmResult(m.id);
  const dispute = useDisputeResult(m.id);
  const verify = useVerifyResult(m.id);
  const toast = useToast();
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const r = m.result;
  const winner = m.winner ?? m.state.winner ?? 0;
  const disputeErr = dispute.error instanceof ApiError ? dispute.error : null;
  const other =
    r?.awaiting_side !== null && r?.awaiting_side !== undefined ? names(m.teams[r.awaiting_side]) : null;

  let status: ReactNode;
  if (m.status === "awaiting_confirmation") {
    status = (
      <>
        Waiting for {other ?? "the players"} to confirm. If no one disputes it, it's official{" "}
        {r?.auto_verify_at ? when.format(new Date(r.auto_verify_at)) : "in 48 hours"}.
      </>
    );
  } else if (m.status === "disputed" && r?.dispute) {
    status = (
      <>
        <strong className="text-signal-amber">Disputed by {r.dispute.by.name}:</strong> "{r.dispute.reason}"
        It doesn't count until an organizer decides.
      </>
    );
  } else if (m.category === "casual") {
    status = "Casual match: it's in everyone's history but doesn't change ratings.";
  } else if (r?.verified_at) {
    status = (
      <>
        Official {when.format(new Date(r.verified_at))}
        {r.verified_by
          ? r.confirmations.some((c) => c.player.id === r.verified_by!.id)
            ? `, confirmed by ${r.verified_by.name}.`
            : `, by ${r.verified_by.name}.`
          : ", automatically after 48 hours with no dispute."}
      </>
    );
  }

  const settled = r?.dispute?.resolution;
  return (
    <section
      aria-label="Result"
      className="flex flex-col gap-4 rounded-2xl border border-line-faint bg-court-surface p-5"
    >
      {settled && (
        <p className="rounded-xl border border-line-faint bg-court-deep/50 p-3 text-sm">
          <strong>{r!.dispute!.by.name} disputed this result.</strong> {settled.by.name} (CourtFlex) kept it:{" "}
          {settled.note}
        </p>
      )}
      <div>
        <p className="text-lg">
          <strong className={sideTone[winner].text}>{fullNames(m.teams[winner])}</strong> won {m.score}.
        </p>
        <p className="mt-1 text-sm text-line-dim">{status}</p>
      </div>

      {(m.can_confirm || m.can_dispute || m.can_verify) && (
        <div className="flex flex-wrap gap-2">
          {m.can_confirm && (
            <Button
              variant="primary"
              loading={confirm.isPending}
              onClick={() =>
                confirm.mutate(
                  {},
                  {
                    onSuccess: () => toast({ tone: "success", message: "Result confirmed. It's official." }),
                    onError: (e) => toast({ tone: "error", message: e.message }),
                  },
                )
              }
            >
              Confirm result
            </Button>
          )}
          {m.can_verify && (
            <Button
              variant={m.can_confirm ? "secondary" : "primary"}
              loading={verify.isPending}
              onClick={() =>
                verify.mutate(
                  {},
                  {
                    onSuccess: () => toast({ tone: "success", message: "The result is official." }),
                    onError: (e) => toast({ tone: "error", message: e.message }),
                  },
                )
              }
            >
              Make result official
            </Button>
          )}
          {m.can_dispute && (
            <Button variant="danger" onClick={() => setDisputing(true)}>
              Dispute
            </Button>
          )}
        </div>
      )}

      {m.ratings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Rating changes ({m.match_type})</h3>
          <ul className="mt-2 divide-y divide-line-faint border-y border-line-faint">
            {m.ratings.map((x) => (
              <li key={x.player.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link to={`/players/${x.player.id}`} className="font-semibold hover:text-ball">
                  {x.player.name}
                </Link>
                <span className="flex items-center gap-3 text-base font-condensed tabular-nums">
                  <span className="text-line-dim">
                    {x.old} → {x.new}
                  </span>
                  <span className={cn("w-12 text-right", x.change >= 0 ? "text-field" : "text-signal-red")}>
                    {x.change >= 0 ? `+${x.change}` : x.change}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Sheet
        open={disputing}
        onClose={() => setDisputing(false)}
        title="Dispute this result?"
        description="It won't count for ratings until an organizer or the Super Admin looks at it."
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDisputing(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={dispute.isPending}
              onClick={() =>
                dispute.mutate(
                  { reason: reason.trim() },
                  {
                    onSuccess: () => {
                      setDisputing(false);
                      toast({ tone: "success", message: "Result disputed. An organizer will look at it." });
                    },
                  },
                )
              }
            >
              Dispute result
            </Button>
          </div>
        }
      >
        <Field
          label="What's wrong?"
          hint="At least 10 characters. Everyone in the match sees it."
          error={disputeErr?.field("reason")}
        >
          {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        {disputeErr && !disputeErr.field("reason") && (
          <p className="mt-2 text-sm text-signal-red">{disputeErr.message}</p>
        )}
      </Sheet>
    </section>
  );
}
