import { Link, useParams, useNavigate } from "react-router";
import { ChevronLeft } from "lucide-react";
import { useSession } from "@courtflex/api";
import { ErrorState, Skeleton } from "@courtflex/ui";
import { SessionConsole } from "@courtflex/features";
import { NotFound } from "./NotFound";

/** The host's view: check-in, fees, and the live court queue. */
export function RunSessionPage() {
  const { sessionId } = useParams();
  const session = useSession(sessionId);
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-5xl">
      <Link
        to=".."
        relative="path"
        className="tap inline-flex items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Session page
      </Link>
      <div className="mt-4">
        {session.isPending && <Skeleton className="h-96" />}
        {session.error && <ErrorState message={session.error.message} onRetry={() => session.refetch()} />}
        {session.data && !session.data.can_manage && (
          <NotFound message="Only the session's host and club admins can run it." />
        )}
        {session.data?.can_manage && (
          <SessionConsole
            openMatch={(id) => navigate(`/matches/${id}`)}
            session={session.data}
            canRefund={session.data.organizer.type === "community"}
            canEdit
            editLink={
              <Link
                to="../edit"
                relative="path"
                className="inline-flex h-11 items-center rounded-full border border-line/70 px-4 text-sm font-semibold hover:bg-court-raised"
              >
                Edit session
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}
