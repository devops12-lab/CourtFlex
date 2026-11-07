import { useState, type ReactNode } from "react";
import { CircleCheck, CirclePause, CirclePlay, CircleX } from "lucide-react";
import type { AuditEntry, OrgAction, OrgDecision, OrgKind, OrgStatus } from "@courtflex/api";
import { ApiError, useOrgDecision, usePlatformSettings } from "@courtflex/api";
import { Button, cn, Field, Sheet, Textarea, useToast } from "@courtflex/ui";
import { ago } from "./time";

export const statusLabels: Record<OrgStatus, string> = {
  pending_review: "Waiting for review",
  active: "Active",
  suspended: "Suspended",
  rejected: "Declined",
};

export function OrgStatusBadge({ status }: { status: OrgStatus }) {
  const tone =
    status === "active"
      ? "border-field/60 text-field"
      : status === "pending_review"
        ? "border-dashed border-signal-amber text-signal-amber"
        : "border-signal-red/70 text-signal-red";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap",
        tone,
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

const actionCopy: Record<
  OrgAction,
  {
    label: string;
    icon: typeof CircleCheck;
    done: string;
    needsReason: boolean;
    tone: "primary" | "danger" | "plain";
  }
> = {
  approve: { label: "Approve", icon: CircleCheck, done: "Approved", needsReason: false, tone: "primary" },
  reject: { label: "Decline", icon: CircleX, done: "Declined", needsReason: true, tone: "danger" },
  suspend: { label: "Suspend", icon: CirclePause, done: "Suspended", needsReason: true, tone: "danger" },
  reactivate: {
    label: "Reactivate",
    icon: CirclePlay,
    done: "Reactivated",
    needsReason: false,
    tone: "primary",
  },
};

const actionsFor: Record<OrgStatus, OrgAction[]> = {
  pending_review: ["approve", "reject"],
  active: ["suspend"],
  suspended: ["reactivate"],
  rejected: ["approve"],
};

/** What each decision does, in the owner's terms, shown before confirming. */
function effect(kind: OrgKind, action: OrgAction, trialDays: number) {
  const noun = kind === "venue" ? "venue" : "club";
  switch (action) {
    case "approve":
      return kind === "venue"
        ? `Players can find and book it, and its ${trialDays}-day free trial starts now.`
        : "Players can find and join it.";
    case "reject":
      return `The ${noun} stays hidden and can't be changed. Its owner sees your reason.`;
    case "suspend":
      return kind === "venue"
        ? "Players can't find or book it, and its staff can't make changes. Bookings and payments are kept. Its owner sees your reason."
        : "Players can't find or join it. Members and payments are kept. Its owner sees your reason.";
    case "reactivate":
      return `The ${noun} is listed again and its owner can make changes.`;
  }
}

/** The decision buttons for a venue or club, with a confirm step (and a reason when it's needed). */
export function DecisionPanel({
  kind,
  id,
  name,
  status,
  decision,
}: {
  kind: OrgKind;
  id: string;
  name: string;
  status: OrgStatus;
  decision: OrgDecision | null;
}) {
  const [action, setAction] = useState<OrgAction | null>(null);
  const [reason, setReason] = useState("");
  const decide = useOrgDecision(kind, id);
  const { settings } = usePlatformSettings();
  const toast = useToast();
  const copy = action ? actionCopy[action] : null;
  const reasonError =
    decide.error instanceof ApiError ? (decide.error.field("reason") ?? undefined) : undefined;
  const otherError = decide.error && !reasonError ? decide.error.message : null;

  const close = () => {
    setAction(null);
    setReason("");
    decide.reset();
  };
  const confirm = () => {
    if (!action) return;
    decide.mutate(
      { action, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast({ tone: "success", message: `${actionCopy[action].done} ${name}.` });
          close();
        },
      },
    );
  };

  return (
    <section
      aria-labelledby="decision-h"
      className="rounded-2xl border border-line-faint bg-court-surface p-5"
    >
      <h2 id="decision-h" className="text-lg font-expanded">
        Decision
      </h2>
      {decision ? (
        <p className="mt-1 text-sm text-line-dim">
          {actionCopy[decision.action].done} by {decision.by.name} {ago(decision.at)}.
          {decision.reason && <span className="mt-1 block text-line">Reason: {decision.reason}</span>}
        </p>
      ) : (
        <p className="mt-1 text-sm text-line-dim">
          {status === "pending_review" ? "Not decided yet." : "Approved before the admin portal existed."}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {actionsFor[status].map((a) => {
          const { label, icon: Icon, tone } = actionCopy[a];
          return (
            <Button key={a} variant={tone === "plain" ? "secondary" : tone} onClick={() => setAction(a)}>
              <Icon className="size-4" aria-hidden />
              {label}
            </Button>
          );
        })}
      </div>

      <Sheet
        open={!!action}
        onClose={close}
        title={copy ? `${copy.label} ${name}?` : ""}
        description={action ? effect(kind, action, settings.trial_days) : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={close}>Cancel</Button>
            <Button
              variant={!copy || copy.tone === "plain" ? "secondary" : copy.tone}
              loading={decide.isPending}
              onClick={confirm}
            >
              {copy?.label}
            </Button>
          </div>
        }
      >
        {copy?.needsReason && (
          <Field
            label="Reason"
            hint={`At least 10 characters. The ${kind === "venue" ? "venue" : "club"}'s owner sees this.`}
            error={reasonError}
          >
            {(p) => <Textarea {...p} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
        )}
        {otherError && (
          <p role="alert" className="mt-3 border-l-2 border-signal-red pl-3 text-sm">
            {otherError}
          </p>
        )}
      </Sheet>
    </section>
  );
}

/** Everything the Super Admin did to this venue or club, newest first. */
export function History({ entries }: { entries: AuditEntry[] }) {
  return (
    <section aria-labelledby="history-h">
      <h2 id="history-h" className="text-lg font-expanded">
        History
      </h2>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-line-dim">No Super Admin actions yet.</p>
      ) : (
        <ol className="mt-2 divide-y divide-line-faint border-y border-line-faint">
          {entries.map((a) => (
            <li key={a.id} className="py-3 text-sm">
              <p className="font-semibold">{a.summary}</p>
              <p className="text-line-dim">
                {a.actor.name}, {ago(a.at)}
              </p>
              {a.reason && <p className="mt-0.5">Reason: {a.reason}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** A label and its value, for detail pages. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-line-dim">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}
