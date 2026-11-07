import { Link, useParams } from "react-router";
import { ChevronLeft } from "lucide-react";
import type { SessionDetail } from "@courtflex/api";
import { formatDateShort, formatTime, useSession, useSessionAction } from "@courtflex/api";
import { Button, cn, ErrorState, Skeleton, useOnline, useToast } from "@courtflex/ui";
import { ClubLogo, SessionFacts, SessionHeading, participantStatusLabels, pesos } from "@courtflex/features";

const TZ = "Asia/Manila";

export function SessionPage() {
  const { sessionId } = useParams();
  const session = useSession(sessionId);
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/sessions"
        className="tap inline-flex items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Sessions
      </Link>
      <div className="mt-4">
        {session.isPending && <Skeleton className="h-96" />}
        {session.error && <ErrorState message={session.error.message} onRetry={() => session.refetch()} />}
        {session.data && <View session={session.data} />}
      </div>
    </div>
  );
}

function View({ session: s }: { session: SessionDetail }) {
  return (
    <div className="flex flex-col gap-8">
      <SessionHeading session={s}>
        <Link
          to={`/clubs/${s.organizer.type}/${s.organizer.slug}`}
          className="inline-flex items-center gap-2 self-start text-sm font-semibold text-line-dim hover:text-line"
        >
          <ClubLogo name={s.organizer.name} url={s.organizer.logo_url} size="sm" />
          About {s.organizer.name}
        </Link>
      </SessionHeading>

      <RegistrationBox session={s} />

      {s.can_manage && (
        <div className="flex flex-wrap gap-3 rounded-md border border-line-faint p-4">
          <p className="w-full text-sm text-line-dim">You're running this session.</p>
          <Link
            to="run"
            className="inline-flex h-11 items-center rounded-full bg-line px-4 text-sm font-semibold text-court-deep"
          >
            {s.status === "live" ? "Open courts and queue" : "Check-in and players"}
          </Link>
          {(s.status === "published" || s.status === "pending_approval") && (
            <Link
              to="edit"
              className="inline-flex h-11 items-center rounded-full border border-line/70 px-4 text-sm font-semibold hover:bg-court-raised"
            >
              Edit session
            </Link>
          )}
        </div>
      )}

      <SessionFacts session={s} />

      <section aria-labelledby="who-h">
        <h2 id="who-h" className="mb-3 text-lg font-semibold">
          Who's coming
        </h2>
        {s.roster.length === 0 ? (
          <p className="text-line-dim">No one yet. Be the first.</p>
        ) : (
          <ul className="grid gap-x-6 border-t court-line sm:grid-cols-2">
            {s.roster.map((r) => (
              <li key={r.player.id} className="flex justify-between gap-3 border-b court-line py-2.5">
                <span>{r.player.name}</span>
                <span className="text-sm text-line-dim">
                  {r.status === "waitlisted"
                    ? `Waitlist #${r.waitlist_position}`
                    : r.status === "checked_in"
                      ? "Here"
                      : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Register, join the waitlist, or cancel, with the rules shown before you commit. */
function RegistrationBox({ session: s }: { session: SessionDetail }) {
  const action = useSessionAction(s.id);
  const toast = useToast();
  const online = useOnline();
  const mine = s.my_registration;
  const open =
    (s.status === "published" || s.status === "live") && new Date() < new Date(s.registration_deadline);
  const full = s.registered_count >= s.capacity;
  const canCancelFree = mine && new Date() < new Date(mine.cancel_until);

  const run = (a: "join" | "waitlist" | "leave", ok: string) =>
    action.mutate({ action: a }, { onSuccess: () => toast({ tone: "success", message: ok }) });

  let body: React.ReactNode;
  if (mine && mine.status !== "cancelled") {
    const waitlisted = mine.status === "waitlisted";
    body = (
      <>
        <p className="text-xl font-bold">
          {waitlisted
            ? `You're number ${mine.waitlist_position} on the waitlist`
            : `You're ${participantStatusLabels[mine.status].toLowerCase()}`}
        </p>
        <p className="text-line-dim">
          {waitlisted
            ? "If a spot opens, you're moved in automatically and it shows here."
            : mine.fee_status === "free"
              ? "No fee for you."
              : mine.fee_status === "paid"
                ? `Fee paid: ${pesos(mine.fee_due)}.`
                : `Pay ${pesos(mine.fee_due)} to the host at check-in.`}
        </p>
        {(mine.status === "registered" || waitlisted) &&
          (waitlisted || canCancelFree ? (
            <div>
              <p className="mb-2 text-sm text-line-dim">
                {waitlisted
                  ? "You can leave the waitlist any time."
                  : `Free to cancel until ${formatDateShort(mine.cancel_until, TZ)}, ${formatTime(mine.cancel_until, TZ)}.`}
              </p>
              <Button
                variant="danger"
                loading={action.isPending}
                disabled={!online}
                onClick={() =>
                  run("leave", waitlisted ? "You left the waitlist." : "Registration cancelled.")
                }
              >
                {waitlisted ? "Leave waitlist" : "Cancel registration"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-line-dim">
              Cancellations have closed. Message the host, {s.host.name}, if you can't come.
            </p>
          ))}
      </>
    );
  } else if (!open) {
    body = (
      <p className="text-line-dim">
        {s.status === "completed"
          ? "This session has ended."
          : s.status === "cancelled"
            ? "This session was cancelled."
            : s.status === "pending_approval"
              ? "This session is waiting for the venue's approval. Registration opens once it's approved."
              : "Registration has closed."}
      </p>
    );
  } else {
    body = (
      <>
        <p className="text-xl font-bold">
          {full ? "This session is full" : `${s.capacity - s.registered_count} spots left`}
        </p>
        <p className="text-line-dim">
          {Number(s.fee) === 0
            ? "Free to play."
            : Number(s.member_fee) < Number(s.fee)
              ? `${pesos(s.fee)}, or ${pesos(s.member_fee)} for ${s.organizer.name} members. Pay at check-in.`
              : `${pesos(s.fee)}, paid at check-in.`}{" "}
          Free to cancel until {s.cancellation_hours} hours before the start.
        </p>
        <div>
          {full ? (
            <Button
              variant="primary"
              size="lg"
              loading={action.isPending}
              disabled={!online}
              onClick={() => run("waitlist", "You're on the waitlist.")}
            >
              Join waitlist
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              loading={action.isPending}
              disabled={!online}
              onClick={() => run("join", `You're in. See you at ${s.venue.name}.`)}
            >
              Register
            </Button>
          )}
        </div>
      </>
    );
  }

  return (
    <section
      aria-label="Your registration"
      className={cn(
        "flex flex-col gap-3 rounded-md border-2 p-5",
        mine?.status === "registered" || mine?.status === "checked_in"
          ? "border-court-outer-bright bg-court-outer/40"
          : "border-line-faint",
      )}
    >
      {body}
      {action.error && (
        <p role="alert" className="text-sm text-signal-red">
          {action.error.message}
        </p>
      )}
    </section>
  );
}
