import { useState, type ReactNode } from "react";
import type { SessionDetail } from "@courtflex/api";
import { ApiError, formatDateShort, formatTime, formatTimeRange, useSessionAction } from "@courtflex/api";
import { Button, Field, Sheet, Tabs, Textarea, useOnline, useToast } from "@courtflex/ui";
import { CapacityPips } from "./SessionCard";
import { PlayersPanel } from "./PlayersPanel";
import { QueueBoard } from "./QueueBoard";
import { pesos, sessionStatusLabels, sessionTypeLabels, shortDay, skillLabels } from "./labels";

type Tab = "players" | "queue" | "details";

/** The header every session page shares: what, when, where, how full. */
export function SessionHeading({ session: s, children }: { session: SessionDetail; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      <p className="text-sm text-line-dim">
        {s.organizer.name}
        {s.organizer.type === "community" ? `, playing at ${s.venue.name}` : ""}
      </p>
      <h1 className="text-2xl leading-tight font-expanded font-bold sm:text-3xl">{s.title}</h1>
      <p className="text-2xl font-semibold font-condensed">
        {formatTimeRange(s.starts_at, s.ends_at, "Asia/Manila")}
        <span className="ml-3 text-lg font-normal text-line-dim">{shortDay(s.starts_at)}</span>
      </p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <CapacityPips taken={s.registered_count} capacity={s.capacity} waitlist={s.waitlist_count} />
        <span className="text-sm text-line-dim">{sessionStatusLabels[s.status]}</span>
      </div>
      {s.status_reason && (s.status === "cancelled" || s.status === "rejected") && (
        <p className="border-l-2 border-signal-red pl-3 text-sm">{s.status_reason}</p>
      )}
      {children}
    </header>
  );
}

export function SessionFacts({ session: s }: { session: SessionDetail }) {
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      <Fact label="Courts" value={`${s.venue.name}: ${s.courts.map((c) => c.name).join(", ")}`} />
      <Fact label="Level" value={skillLabels[s.skill_level]} />
      <Fact label="Type" value={sessionTypeLabels[s.session_type]} />
      <Fact
        label="Fee"
        value={
          Number(s.member_fee) < Number(s.fee)
            ? `${pesos(s.fee)}, members ${pesos(s.member_fee)}`
            : pesos(s.fee)
        }
      />
      <Fact
        label="Registration closes"
        value={`${shortDay(s.registration_deadline)}, ${formatTime(s.registration_deadline, "Asia/Manila")}`}
      />
      <Fact label="Cancelling" value={`Free until ${s.cancellation_hours} hours before the start`} />
      <Fact label="Host" value={s.host.name} />
      {s.members_only && <Fact label="Who can join" value={`${s.organizer.name} members only`} />}
      {s.description && (
        <div className="sm:col-span-2">
          <dt className="text-sm text-line-dim">About</dt>
          <dd className="mt-1 max-w-prose">{s.description}</dd>
        </div>
      )}
    </dl>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-line-dim">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

/**
 * Everything a host needs while a session runs: who's here, the live queue,
 * and the session details. Used by venue staff and community hosts alike.
 */
export function SessionConsole({
  session,
  canRefund,
  actions,
  canEdit,
  editLink,
  openMatch,
}: {
  session: SessionDetail;
  /** Opens a match's Live Scorer; defaults to a page load to /matches/:id. */
  openMatch?: (matchId: string) => void;
  canRefund: boolean;
  /** Extra controls for the header, such as venue approval. */
  actions?: ReactNode;
  canEdit: boolean;
  editLink?: ReactNode;
}) {
  const started = session.status === "live" || session.status === "completed";
  const [tab, setTab] = useState<Tab>(started ? "queue" : "players");
  const upcoming = session.status === "published" || session.status === "pending_approval";

  return (
    <div className="flex flex-col gap-6">
      <SessionHeading session={session}>
        <div className="flex flex-wrap gap-3">
          {actions}
          {canEdit && upcoming && editLink}
          {canEdit && upcoming && <CancelSessionButton session={session} />}
        </div>
      </SessionHeading>
      <Tabs
        label="Run this session"
        value={tab}
        onChange={setTab}
        items={[
          { value: "players", label: "Players", count: session.registered_count },
          {
            value: "queue",
            label: "Courts and queue",
            disabled:
              session.status === "pending_approval" ||
              session.status === "cancelled" ||
              session.status === "rejected",
          },
          { value: "details", label: "Details" },
        ]}
      >
        {(t) =>
          t === "players" ? (
            <PlayersPanel session={session} canRefund={canRefund} />
          ) : t === "queue" ? (
            <QueueBoard session={session} manage={session.can_manage} openMatch={openMatch} />
          ) : (
            <SessionFacts session={session} />
          )
        }
      </Tabs>
    </div>
  );
}

function CancelSessionButton({ session }: { session: SessionDetail }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const cancel = useSessionAction(session.id);
  const toast = useToast();
  const online = useOnline();
  const close = () => {
    cancel.reset();
    setOpen(false);
  };
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)} disabled={!online}>
        Cancel session
      </Button>
      <Sheet
        open={open}
        onClose={close}
        title="Cancel session"
        description={`${session.title}, ${formatDateShort(session.starts_at, "Asia/Manila")}`}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            cancel.mutate(
              { action: "cancel", reason },
              {
                onSuccess: () => {
                  toast({
                    tone: "success",
                    message: "Session cancelled. The courts are free and registered players see your reason.",
                  });
                  close();
                },
              },
            );
          }}
        >
          <p>
            {session.registered_count} registered{" "}
            {session.registered_count === 1 ? "player sees" : "players see"} the reason. The courts are
            released for other bookings. Fees already collected stay on record; refund them from the player
            list.
          </p>
          <Field
            label="Reason"
            error={cancel.error instanceof ApiError ? cancel.error.field("reason") : undefined}
          >
            {(p) => (
              <Textarea
                {...p}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Typhoon signal no. 2"
              />
            )}
          </Field>
          {cancel.error && !(cancel.error instanceof ApiError && cancel.error.field("reason")) && (
            <p className="text-sm text-signal-red">{cancel.error.message}</p>
          )}
          <div className="flex gap-3">
            <Button type="submit" variant="danger" size="lg" className="flex-1" loading={cancel.isPending}>
              Cancel session
            </Button>
            <Button size="lg" onClick={close}>
              Keep it
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
