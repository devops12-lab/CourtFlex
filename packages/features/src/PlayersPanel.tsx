import { useMemo, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import type { SessionDetail, SessionParticipant } from "@courtflex/api";
import {
  ApiError,
  formatTime,
  useAddParticipant,
  useParticipantAction,
  usePlayerDirectory,
  useRecordSessionFee,
  useRefundSessionFee,
} from "@courtflex/api";
import {
  Button,
  cn,
  EmptyState,
  Field,
  Input,
  Sheet,
  Tabs,
  Textarea,
  useOnline,
  useToast,
} from "@courtflex/ui";
import { FeeForm } from "./FeeForm";
import { participantStatusLabels, pesos, skillLabels } from "./labels";

type Filter = "here" | "expected" | "waitlist" | "out";

const queueLabels = { waiting: "In line", playing: "On court", resting: "Sitting out" } as const;

/**
 * The host's list for a session: check players in as they arrive, take fees,
 * add walk-ins, and handle no-shows. Big tap targets for a phone or tablet at the gate.
 */
export function PlayersPanel({ session, canRefund }: { session: SessionDetail; canRefund: boolean }) {
  const action = useParticipantAction(session.id);
  const toast = useToast();
  const online = useOnline();
  const [filter, setFilter] = useState<Filter>("expected");
  const [query, setQuery] = useState("");
  const [paying, setPaying] = useState<SessionParticipant | null>(null);
  const [refunding, setRefunding] = useState<SessionParticipant | null>(null);
  const [adding, setAdding] = useState(false);
  const started = new Date(session.starts_at) <= new Date();
  const open = session.status === "published" || session.status === "live";

  const groups = useMemo(() => {
    const by = (f: Filter) =>
      session.participants.filter((p) =>
        f === "here"
          ? p.status === "checked_in" || p.status === "completed"
          : f === "expected"
            ? p.status === "registered"
            : f === "waitlist"
              ? p.status === "waitlisted"
              : p.status === "cancelled" || p.status === "no_show",
      );
    return { here: by("here"), expected: by("expected"), waitlist: by("waitlist"), out: by("out") };
  }, [session.participants]);

  const visible = groups[filter]
    .filter((p) => !query || p.player.name.toLowerCase().includes(query.toLowerCase()))
    .sort(
      (a, b) =>
        (a.waitlist_position ?? 0) - (b.waitlist_position ?? 0) || a.player.name.localeCompare(b.player.name),
    );

  const run = (p: SessionParticipant, act: Parameters<typeof action.mutate>[0]["action"], done: string) =>
    action.mutate(
      { participantId: p.id, action: act },
      {
        onSuccess: () => toast({ tone: "success", message: done }),
        onError: (e) => toast({ tone: "error", message: e.message }),
      },
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-line-dim"
            aria-hidden
          />
          <Input
            aria-label="Find a player"
            placeholder="Find a player"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {open && (
          <Button onClick={() => setAdding(true)} disabled={!online}>
            <Plus className="size-4" aria-hidden />
            Add player
          </Button>
        )}
      </div>

      <Tabs
        label="Players"
        value={filter}
        onChange={setFilter}
        items={[
          { value: "expected", label: "Not here yet", count: groups.expected.length },
          { value: "here", label: "Checked in", count: groups.here.length },
          { value: "waitlist", label: "Waitlist", count: groups.waitlist.length },
          { value: "out", label: "Cancelled and no-show", count: groups.out.length },
        ]}
      >
        {() =>
          visible.length === 0 ? (
            <EmptyState
              title={
                query
                  ? "No one by that name here"
                  : filter === "expected"
                    ? "Everyone's checked in"
                    : "No one here yet"
              }
              body={
                filter === "expected" && !query ? "Players who register show up in this list." : undefined
              }
            />
          ) : (
            <ul className="border-t court-line">
              {visible.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b court-line py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {p.waitlist_position ? (
                        <span className="mr-2 font-condensed text-line-dim">#{p.waitlist_position}</span>
                      ) : null}
                      {p.player.name}
                    </p>
                    <p className="flex flex-wrap gap-x-3 text-sm text-line-dim">
                      <span>{skillLabels[p.player.skill_level]}</span>
                      {p.is_member && <span>Member</span>}
                      {p.queue_state && <span className="text-line">{queueLabels[p.queue_state]}</span>}
                      {p.checked_in_at && <span>In at {formatTime(p.checked_in_at, "Asia/Manila")}</span>}
                      {p.games_played > 0 && <span>{p.games_played} games</span>}
                      {(p.status === "cancelled" || p.status === "no_show") && (
                        <span>{participantStatusLabels[p.status]}</span>
                      )}
                    </p>
                  </div>
                  {!(p.fee_status === "unpaid" && p.status !== "waitlisted" && p.status !== "cancelled") && (
                    <FeeBadge p={p} />
                  )}
                  <div className="flex flex-wrap gap-2">
                    {p.fee_status === "unpaid" && p.status !== "waitlisted" && p.status !== "cancelled" && (
                      <Button size="sm" onClick={() => setPaying(p)} disabled={!online}>
                        Take {pesos(Number(p.fee_due) - Number(p.fee_paid))}
                      </Button>
                    )}
                    {canRefund &&
                      Number(p.fee_paid) > 0 &&
                      (p.status === "cancelled" || p.status === "no_show") && (
                        <Button size="sm" variant="ghost" onClick={() => setRefunding(p)} disabled={!online}>
                          Refund
                        </Button>
                      )}
                    {p.status === "registered" && open && (
                      <>
                        <Button
                          size="md"
                          variant="primary"
                          onClick={() =>
                            run(p, "check-in", `${p.player.name} checked in and added to the line.`)
                          }
                          disabled={!online || action.isPending}
                        >
                          <Check className="size-4" aria-hidden />
                          Check in
                        </Button>
                        {started && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => run(p, "no-show", `${p.player.name} marked no-show.`)}
                            disabled={!online}
                          >
                            No-show
                          </Button>
                        )}
                      </>
                    )}
                    {p.status === "checked_in" && p.queue_state !== "playing" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => run(p, "undo-check-in", `Check-in undone for ${p.player.name}.`)}
                        disabled={!online}
                      >
                        Undo check-in
                      </Button>
                    )}
                    {(p.status === "registered" || p.status === "waitlisted") && open && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => run(p, "remove", `${p.player.name} removed from the session.`)}
                        disabled={!online}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </Tabs>

      <PayFeeSheet session={session} participant={paying} onClose={() => setPaying(null)} />
      <RefundSheet session={session} participant={refunding} onClose={() => setRefunding(null)} />
      <AddPlayerSheet session={session} open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function FeeBadge({ p }: { p: SessionParticipant }) {
  if (p.status === "waitlisted") return null;
  const tone =
    p.fee_status === "paid" ? "text-field" : p.fee_status === "unpaid" ? "text-line" : "text-line-dim";
  const label =
    p.fee_status === "free"
      ? "No fee"
      : p.fee_status === "paid"
        ? `Paid ${pesos(p.fee_paid)}`
        : p.fee_status === "refunded"
          ? "Refunded"
          : `Owes ${pesos(Number(p.fee_due) - Number(p.fee_paid))}`;
  return <span className={cn("text-sm font-semibold font-condensed", tone)}>{label}</span>;
}

function PayFeeSheet({
  session,
  participant,
  onClose,
}: {
  session: SessionDetail;
  participant: SessionParticipant | null;
  onClose: () => void;
}) {
  const record = useRecordSessionFee(session.id);
  const toast = useToast();
  const close = () => {
    record.reset();
    onClose();
  };
  return (
    <Sheet
      open={!!participant}
      onClose={close}
      title="Session fee"
      description={participant ? `${participant.player.name}, ${session.title}` : undefined}
    >
      {participant && (
        <FeeForm
          key={participant.id}
          owed={Number(participant.fee_due) - Number(participant.fee_paid)}
          payer={participant.player.name}
          what={session.title}
          pending={record.isPending}
          error={record.error}
          onCancel={close}
          onSubmit={(input) =>
            record.mutate(
              { participantId: participant.id, ...input },
              {
                onSuccess: () => {
                  toast({
                    tone: "success",
                    message: `Fee recorded: ${pesos(input.amount)} from ${participant.player.name}.`,
                  });
                  close();
                },
              },
            )
          }
        />
      )}
    </Sheet>
  );
}

function RefundSheet({
  session,
  participant,
  onClose,
}: {
  session: SessionDetail;
  participant: SessionParticipant | null;
  onClose: () => void;
}) {
  const refund = useRefundSessionFee(session.id);
  const toast = useToast();
  const online = useOnline();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const close = () => {
    refund.reset();
    setAmount("");
    setReason("");
    onClose();
  };
  const err = (f: string) => (refund.error instanceof ApiError ? refund.error.field(f) : undefined);
  return (
    <Sheet
      open={!!participant}
      onClose={close}
      title="Refund session fee"
      description={participant?.player.name}
    >
      {participant && (
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            refund.mutate(
              { participantId: participant.id, amount: amount || participant.fee_paid, reason },
              {
                onSuccess: () => {
                  toast({ tone: "success", message: `Refund recorded for ${participant.player.name}.` });
                  close();
                },
              },
            );
          }}
        >
          <p className="text-line-dim">
            {pesos(participant.fee_paid)} was collected. Give the money back first, then record it here. The
            original payment stays in the history.
          </p>
          <Field label="Amount" error={err("amount")}>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                className="font-condensed"
                placeholder={participant.fee_paid}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
          <Field label="Reason" error={err("reason")}>
            {(p) => (
              <Textarea
                {...p}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Session moved, player couldn't make it"
              />
            )}
          </Field>
          {refund.error && !err("amount") && !err("reason") && (
            <p className="text-sm text-signal-red">{refund.error.message}</p>
          )}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={refund.isPending}
            disabled={!online || !reason.trim()}
          >
            Record refund
          </Button>
        </form>
      )}
    </Sheet>
  );
}

function AddPlayerSheet({
  session,
  open,
  onClose,
}: {
  session: SessionDetail;
  open: boolean;
  onClose: () => void;
}) {
  const add = useAddParticipant(session.id);
  const toast = useToast();
  const [query, setQuery] = useState("");
  const players = usePlayerDirectory(query);
  const close = () => {
    add.reset();
    setQuery("");
    onClose();
  };
  const onList = new Set(
    session.participants.filter((p) => p.status !== "cancelled").map((p) => p.player.id),
  );
  return (
    <Sheet
      open={open}
      onClose={close}
      title="Add a player"
      description="For someone who turns up without registering. Capacity still applies."
    >
      <div className="flex flex-col gap-3">
        <Field label="Player's name">
          {(p) => (
            <Input
              {...p}
              type="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="At least 2 letters"
            />
          )}
        </Field>
        {add.error && (
          <p className="text-sm text-signal-red">
            {(add.error instanceof ApiError && add.error.field("player_id")) || add.error.message}
          </p>
        )}
        {players.data?.length === 0 && (
          <p className="text-sm text-line-dim">
            No player by that name. They need a CourtFlex account first.
          </p>
        )}
        <ul className="border-t court-line">
          {players.data?.map((pl) => (
            <li key={pl.id} className="flex items-center justify-between gap-3 border-b court-line py-3">
              <span>
                <span className="block font-semibold">{pl.name}</span>
                <span className="block text-sm text-line-dim">{pl.home_city}</span>
              </span>
              {onList.has(pl.id) ? (
                <span className="text-sm text-line-dim">On the list</span>
              ) : (
                <Button
                  size="sm"
                  loading={add.isPending && add.variables?.player_id === pl.id}
                  onClick={() =>
                    add.mutate(
                      { player_id: pl.id },
                      {
                        onSuccess: () => {
                          toast({
                            tone: "success",
                            message: `${pl.name} added. Check them in when they're ready.`,
                          });
                          close();
                        },
                      },
                    )
                  }
                >
                  Add
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
