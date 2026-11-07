import { useState } from "react";
import { Link, useParams } from "react-router";
import { ChevronLeft } from "lucide-react";
import type { SessionDetail } from "@courtflex/api";
import { ApiError, useRecordCourtFee, useSession, useSessionAction } from "@courtflex/api";
import { Button, ErrorState, Field, Sheet, Skeleton, Textarea, useOnline, useToast } from "@courtflex/ui";
import { FeeForm, SessionConsole, SessionFacts, SessionHeading, pesos } from "@courtflex/features";
import { useClubContext } from "../../app/club-context";

export function OpenPlaySessionPage() {
  const { sessionId } = useParams();
  const session = useSession(sessionId);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        to=".."
        relative="path"
        className="tap inline-flex items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Open play
      </Link>
      <div className="mt-4">
        {session.isPending && <Skeleton className="h-96" />}
        {session.error && <ErrorState message={session.error.message} onRetry={() => session.refetch()} />}
        {session.data && <SessionView session={session.data} />}
      </div>
    </div>
  );
}

function SessionView({ session }: { session: SessionDetail }) {
  const { club, can } = useClubContext();
  const venueOwn = session.organizer.type === "venue";
  const actions = <VenueActions session={session} />;

  // Venue staff run the venue's own sessions. Community sessions are run by the club;
  // the venue sees who's coming, approves, and collects the court fee.
  if (session.can_manage) {
    return (
      <SessionConsole
        session={session}
        canRefund={can("adjustOnsitePayment")}
        actions={actions}
        canEdit={venueOwn && can("manageOpenPlay") && !club.read_only}
        editLink={
          <Link
            to="edit"
            className="inline-flex h-11 items-center rounded-full border border-line/70 px-4 text-sm font-semibold hover:bg-court-raised"
          >
            Edit session
          </Link>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <SessionHeading session={session}>
        <div className="flex flex-wrap gap-3">{actions}</div>
      </SessionHeading>
      <SessionFacts session={session} />
      <section aria-labelledby="roster-h">
        <h2 id="roster-h" className="mb-3 text-lg font-semibold">
          Who's coming
        </h2>
        <ul className="grid gap-x-6 border-t court-line sm:grid-cols-2">
          {session.roster.map((r) => (
            <li key={r.player.id} className="flex justify-between border-b court-line py-2.5">
              <span>{r.player.name}</span>
              <span className="text-sm text-line-dim">
                {r.status === "waitlisted"
                  ? `Waitlist #${r.waitlist_position}`
                  : r.status === "checked_in"
                    ? "Checked in"
                    : "Registered"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** What the venue does with a session on its courts: approve it, or collect the court fee. */
function VenueActions({ session }: { session: SessionDetail }) {
  const { club, can } = useClubContext();
  const [mode, setMode] = useState<"reject" | "fee" | null>(null);
  const action = useSessionAction(session.id);
  const fee = useRecordCourtFee(session.id);
  const toast = useToast();
  const online = useOnline();
  const [reason, setReason] = useState("");
  const owed = Number(session.court_fee) - Number(session.court_fee_paid);
  const community = session.organizer.type === "community";

  const close = () => {
    action.reset();
    fee.reset();
    setMode(null);
    setReason("");
  };

  return (
    <>
      {session.status === "pending_approval" && can("approvePlayerOpenPlay") && !club.read_only && (
        <>
          <Button
            variant="primary"
            loading={action.isPending && !mode}
            disabled={!online}
            onClick={() =>
              action.mutate(
                { action: "approve" },
                {
                  onSuccess: () =>
                    toast({
                      tone: "success",
                      message: `Approved. ${session.title} is now open for registration.`,
                    }),
                  onError: (e) => toast({ tone: "error", message: e.message }),
                },
              )
            }
          >
            Approve session
          </Button>
          <Button variant="danger" onClick={() => setMode("reject")} disabled={!online}>
            Turn down
          </Button>
        </>
      )}
      {community &&
        session.status !== "cancelled" &&
        session.status !== "rejected" &&
        session.status !== "pending_approval" &&
        Number(session.court_fee) > 0 && (
          <span className="inline-flex items-center gap-3">
            <span className="text-sm">
              Court fee {pesos(session.court_fee)}
              {owed <= 0
                ? ", paid"
                : Number(session.court_fee_paid) > 0
                  ? `, ${pesos(owed)} still due`
                  : ", not paid yet"}
            </span>
            {owed > 0 && can("recordOnsitePayment") && !club.read_only && (
              <Button size="sm" onClick={() => setMode("fee")} disabled={!online}>
                Record court fee
              </Button>
            )}
          </span>
        )}

      <Sheet
        open={mode === "reject"}
        onClose={close}
        title="Turn down session"
        description={`${session.organizer.name} sees your reason.`}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate(
              { action: "reject", reason },
              {
                onSuccess: () => {
                  toast({ tone: "success", message: "Session turned down. The courts are free again." });
                  close();
                },
              },
            );
          }}
        >
          <Field
            label="Reason"
            error={action.error instanceof ApiError ? action.error.field("reason") : undefined}
          >
            {(p) => (
              <Textarea
                {...p}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Court 5 is being resurfaced that week"
              />
            )}
          </Field>
          <Button type="submit" variant="danger" size="lg" loading={action.isPending}>
            Turn down
          </Button>
        </form>
      </Sheet>

      <Sheet
        open={mode === "fee"}
        onClose={close}
        title="Court fee"
        description={`${session.organizer.name}, ${session.title}`}
      >
        {mode === "fee" && (
          <FeeForm
            owed={owed}
            payer={session.host.name}
            what={`court rental for ${session.title}`}
            pending={fee.isPending}
            error={fee.error}
            onCancel={close}
            onSubmit={(input) =>
              fee.mutate(input, {
                onSuccess: () => {
                  toast({ tone: "success", message: `Court fee recorded: ${pesos(input.amount)}.` });
                  close();
                },
              })
            }
          />
        )}
      </Sheet>
    </>
  );
}
