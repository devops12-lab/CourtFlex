import { useEffect, useState } from "react";
import { ArrowUp, Coffee, RotateCcw, UserPlus } from "lucide-react";
import type { QueueGame, QueueState, SessionDetail } from "@courtflex/api";
import { defaultFormat, useCreateMatch, useQueue, useQueueCommand } from "@courtflex/api";
import { Button, cn, EmptyState, ErrorState, Sheet, Skeleton, useOnline, useToast } from "@courtflex/ui";

function useMinuteTick() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const minutesSince = (iso: string, now: number) =>
  Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));

/**
 * The live queue for a session. Courts at the top, drawn as courts with a team
 * on each side; the line underneath. When a game ends, those four go to the
 * back of the line and the next four go on automatically. Hosts can pick
 * players by hand, move someone up, or let them sit out.
 */
/**
 * `openMatch` opens a match's Live Scorer (the player app passes its router;
 * elsewhere it's a page load to /matches/:id).
 */
export function QueueBoard({
  session,
  manage,
  openMatch = (id) => window.location.assign(`/matches/${id}`),
}: {
  session: SessionDetail;
  manage: boolean;
  openMatch?: (matchId: string) => void;
}) {
  const live = session.status === "live" || session.status === "published";
  const queue = useQueue(session.id, live);
  const command = useQueueCommand(session.id);
  const createMatch = useCreateMatch();
  const toast = useToast();
  const online = useOnline();
  const now = useMinuteTick();
  const [picking, setPicking] = useState<string | null>(null);

  if (queue.isPending) return <Skeleton className="h-96" />;
  if (queue.error) return <ErrorState message={queue.error.message} onRetry={() => queue.refetch()} />;
  const q = queue.data;
  const can = manage && online && session.status !== "completed";

  const send = (c: Parameters<typeof command.mutate>[0], done?: string) =>
    command.mutate(c, {
      onSuccess: () => done && toast({ tone: "success", message: done }),
      onError: (e) => {
        toast({ tone: "error", message: e.message });
        queue.refetch();
      },
    });

  const nextFour = q.waiting.slice(0, 4);

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-line-dim" aria-live="polite">
        {session.status === "completed"
          ? "This session has ended. Here's how the courts finished."
          : `Updates every few seconds. ${q.waiting.length} in line, ${q.resting.length} sitting out.`}
      </p>

      <section aria-label="Courts" className="grid gap-4 lg:grid-cols-2">
        {q.courts.map((c) => (
          <CourtTile
            key={c.court_id}
            name={c.court_name}
            game={c.game}
            minutes={c.game ? minutesSince(c.game.started_at, now) : 0}
            manage={can}
            busy={command.isPending}
            onFinish={(winner) =>
              c.game &&
              send(
                { command: "finish", game_id: c.game.id, winner },
                `${c.court_name} finished. ${q.waiting.length >= 4 ? "Next four are on." : "Players are back in line."}`,
              )
            }
            onFill={() =>
              send({ command: "fill", court_id: c.court_id }, `Next game started on ${c.court_name}.`)
            }
            onPick={() => setPicking(c.court_id)}
            onOpenMatch={openMatch}
            scoring={createMatch.isPending}
            onScore={() => {
              const g = c.game;
              if (!g) return;
              createMatch.mutate(
                {
                  match_type: g.team_a.length === 1 ? "singles" : "doubles",
                  category: "casual",
                  format: defaultFormat,
                  team_a: g.team_a.map((p) => p.id),
                  team_b: g.team_b.map((p) => p.id),
                  first_serving: 0,
                  session_id: session.id,
                  queue_game_id: g.id,
                },
                {
                  onSuccess: (m) => openMatch(m.id),
                  onError: (e) => toast({ tone: "error", message: e.message }),
                },
              );
            }}
            canFill={q.waiting.length >= 4}
            waitingCount={q.waiting.length}
          />
        ))}
      </section>

      <section aria-labelledby="line-h">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h3 id="line-h" className="text-lg font-semibold">
            Up next
          </h3>
          <span className="text-sm text-line-dim">Longest wait goes on first</span>
        </div>
        {q.waiting.length === 0 ? (
          <EmptyState
            title="No one is waiting"
            body={
              manage
                ? "Players join the line when they check in, and again after each game."
                : "Everyone is on a court."
            }
          />
        ) : (
          <ol className="border-t-2 border-line">
            {q.waiting.map((w, i) => (
              <li
                key={w.participant_id}
                className={cn(
                  "flex items-center gap-4 border-b court-line py-2.5",
                  i < 4 && "bg-court-surface",
                  i === 3 && "border-b-2 border-b-line",
                )}
              >
                <span className="w-10 shrink-0 text-center text-2xl font-bold font-condensed">
                  {w.position}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{w.player.name}</span>
                  <span className="block text-sm text-line-dim">
                    {w.games_played} {w.games_played === 1 ? "game" : "games"}, waiting{" "}
                    {minutesSince(w.waiting_since, now)} min
                  </span>
                </span>
                {i < 4 && nextFour.length === 4 && i === 0 && (
                  <span className="hidden text-xs font-semibold text-ball sm:inline">Next game</span>
                )}
                {can && (
                  <span className="flex gap-1">
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          send({ command: "move", participant_id: w.participant_id, position: i })
                        }
                        className="grid size-10 place-items-center rounded-sm text-line-dim hover:bg-court-raised hover:text-line"
                        aria-label={`Move ${w.player.name} up one place`}
                      >
                        <ArrowUp className="size-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        send(
                          { command: "rest", participant_id: w.participant_id, resting: true },
                          `${w.player.name} is sitting out.`,
                        )
                      }
                      className="grid size-10 place-items-center rounded-sm text-line-dim hover:bg-court-raised hover:text-line"
                      aria-label={`Let ${w.player.name} sit out`}
                    >
                      <Coffee className="size-4" />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {q.resting.length > 0 && (
        <section aria-labelledby="rest-h">
          <h3 id="rest-h" className="mb-3 text-lg font-semibold">
            Sitting out
          </h3>
          <ul className="flex flex-wrap gap-2">
            {q.resting.map((r) => (
              <li
                key={r.participant_id}
                className="flex items-center gap-2 rounded-sm border border-line-faint py-1 pr-1 pl-3"
              >
                <span className="text-sm">{r.player.name}</span>
                {can && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      send(
                        { command: "rest", participant_id: r.participant_id, resting: false },
                        `${r.player.name} is back in line.`,
                      )
                    }
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    Back in line
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {q.recent_games.length > 0 && (
        <section aria-labelledby="recent-h">
          <h3 id="recent-h" className="mb-3 text-lg font-semibold">
            Recent games
          </h3>
          <ul className="border-t court-line text-sm">
            {q.recent_games.map((g) => (
              <li key={g.id} className="grid gap-1 border-b court-line py-2.5 sm:grid-cols-[6rem_1fr]">
                <span className="text-line-dim">
                  {q.courts.find((c) => c.court_id === g.court_id)?.court_name}
                </span>
                <span>
                  <span className={cn(g.winner === "a" && "font-semibold")}>
                    {g.team_a.map((p) => p.name).join(" & ")}
                  </span>
                  <span className="mx-2 text-line-dim">vs</span>
                  <span className={cn(g.winner === "b" && "font-semibold")}>
                    {g.team_b.map((p) => p.name).join(" & ")}
                  </span>
                  {g.winner && <span className="ml-2 text-line-dim">(bold side won)</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PickPlayersSheet
        queue={q}
        courtId={picking}
        onClose={() => setPicking(null)}
        onStart={(ids) =>
          picking &&
          command.mutate(
            { command: "fill", court_id: picking, participant_ids: ids },
            {
              onSuccess: () => {
                toast({ tone: "success", message: "Game started with your picks." });
                setPicking(null);
              },
              onError: (e) => toast({ tone: "error", message: e.message }),
            },
          )
        }
        pending={command.isPending}
      />
    </div>
  );
}

/** A court seen from above: Team A on the left half, Team B on the right, the net between. */
function CourtTile({
  name,
  game,
  minutes,
  manage,
  busy,
  canFill,
  waitingCount,
  onFinish,
  onFill,
  onPick,
  onScore,
  onOpenMatch,
  scoring,
}: {
  name: string;
  game: QueueGame | null;
  minutes: number;
  manage: boolean;
  busy: boolean;
  canFill: boolean;
  waitingCount: number;
  onFinish: (winner: "a" | "b" | null) => void;
  onFill: () => void;
  onPick: () => void;
  onScore: () => void;
  onOpenMatch: (matchId: string) => void;
  scoring: boolean;
}) {
  return (
    <article className="overflow-hidden rounded-md border-2 border-line" aria-label={name}>
      <header className="flex items-center justify-between bg-court-surface px-4 py-2">
        <h3 className="font-expanded font-bold">{name}</h3>
        <span className="text-sm font-condensed text-line-dim">{game ? `${minutes} min` : "Free"}</span>
      </header>
      {game ? (
        <div className="relative grid grid-cols-2 bg-court-outer">
          <span
            aria-hidden
            className="absolute inset-y-0 left-1/2 w-0 border-l-2 border-dashed border-line"
          />
          {(["a", "b"] as const).map((side) => (
            <div
              key={side}
              className={cn(
                "flex min-h-28 flex-col justify-center gap-1 px-4 py-4",
                side === "b" && "text-right",
              )}
            >
              {(side === "a" ? game.team_a : game.team_b).map((p) => (
                <span key={p.id} className="text-lg leading-tight font-semibold">
                  {p.name}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {game?.match && (
        <button
          type="button"
          onClick={() => onOpenMatch(game.match!.id)}
          className="flex w-full items-center justify-between gap-3 border-t court-line bg-court-deep px-4 py-2 text-left text-sm hover:bg-court-raised"
        >
          <span className="flex items-center gap-2">
            {game.match.status === "in_progress" && (
              <span aria-hidden className="size-2 animate-pulse rounded-full bg-signal-red" />
            )}
            {game.match.status === "scheduled" ? "Scoring set up" : "Live score"}
            <span className="text-lg font-condensed tabular-nums">{game.match.called}</span>
          </span>
          <span className="font-semibold text-ball">Open</span>
        </button>
      )}
      {!game && (
        <div className="grid min-h-28 place-items-center bg-court-deep px-4 py-4 text-center text-line-dim">
          {canFill ? "Ready for the next four" : `Waiting for players. ${waitingCount} in line, 4 needed.`}
        </div>
      )}
      {manage && (
        <footer className="flex flex-wrap gap-2 border-t court-line bg-court-surface p-3">
          {game ? (
            <>
              <Button variant="primary" className="flex-1" onClick={() => onFinish("a")} disabled={busy}>
                Left side won
              </Button>
              <Button variant="primary" className="flex-1" onClick={() => onFinish("b")} disabled={busy}>
                Right side won
              </Button>
              <Button variant="ghost" onClick={() => onFinish(null)} disabled={busy}>
                End, no result
              </Button>
              {!game.match && (
                <Button className="w-full" onClick={onScore} loading={scoring} disabled={busy}>
                  Score this game
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="primary" className="flex-1" onClick={onFill} disabled={busy || !canFill}>
                Start next game
              </Button>
              <Button onClick={onPick} disabled={busy}>
                <UserPlus className="size-4" aria-hidden />
                Pick players
              </Button>
            </>
          )}
        </footer>
      )}
    </article>
  );
}

function PickPlayersSheet({
  queue,
  courtId,
  onClose,
  onStart,
  pending,
}: {
  queue: QueueState;
  courtId: string | null;
  onClose: () => void;
  onStart: (ids: string[]) => void;
  pending: boolean;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const pool = [
    ...queue.waiting.map((w) => ({
      id: w.participant_id,
      name: w.player.name,
      note: `#${w.position} in line`,
    })),
    ...queue.resting.map((r) => ({ id: r.participant_id, name: r.player.name, note: "Sitting out" })),
  ];
  const court = queue.courts.find((c) => c.court_id === courtId)?.court_name;
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 4 ? [...p, id] : p));

  return (
    <Sheet
      open={!!courtId}
      onClose={() => {
        setPicked([]);
        onClose();
      }}
      title={`Pick players for ${court ?? "the court"}`}
      description="Choose 4. The 1st and 4th picked play together against the 2nd and 3rd."
      footer={
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={picked.length !== 4}
          loading={pending}
          onClick={() => onStart(picked)}
        >
          {picked.length === 4 ? "Start game" : `Pick ${4 - picked.length} more`}
        </Button>
      }
    >
      <ul className="border-t court-line">
        {pool.map((p) => {
          const n = picked.indexOf(p.id);
          return (
            <li key={p.id} className="border-b court-line">
              <label className="flex cursor-pointer items-center gap-3 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ball">
                <input type="checkbox" className="sr-only" checked={n >= 0} onChange={() => toggle(p.id)} />
                <span
                  aria-hidden
                  className={cn(
                    "grid size-8 place-items-center rounded-full border-2 font-bold font-condensed",
                    n >= 0 ? "border-ball bg-ball text-ball-ink" : "border-line-faint text-transparent",
                  )}
                >
                  {n >= 0 ? n + 1 : "·"}
                </span>
                <span className="flex-1 font-semibold">{p.name}</span>
                <span className="text-sm text-line-dim">{p.note}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
