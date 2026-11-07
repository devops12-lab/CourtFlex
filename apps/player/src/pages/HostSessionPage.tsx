import { Link, useNavigate, useParams } from "react-router";
import { ChevronLeft } from "lucide-react";
import { useClubDirectory, useCreateSession, useMyClubs, useSession, useUpdateSession } from "@courtflex/api";
import { EmptyState, ErrorState, Skeleton, useToast } from "@courtflex/ui";
import { SessionForm } from "@courtflex/features";

/** Community hosts create sessions at a venue. The venue may approve them first. */
export function HostSessionPage() {
  const { sessionId } = useParams();
  const editing = !!sessionId;
  const existing = useSession(sessionId);
  const myClubs = useMyClubs();
  const venues = useClubDirectory({ type: "venue" });
  const create = useCreateSession();
  const update = useUpdateSession(sessionId ?? "");
  const mutation = editing ? update : create;
  const navigate = useNavigate();
  const toast = useToast();

  const hosts = (myClubs.data ?? [])
    .filter((c) => c.can_host)
    .map((c) => ({ type: c.club.type, id: c.club.id, name: c.club.name }));
  const loading = myClubs.isPending || venues.isPending || (editing && existing.isPending);
  const error = myClubs.error ?? venues.error ?? existing.error;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to={editing ? `/sessions/${sessionId}` : "/sessions"}
        className="tap inline-flex items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {editing ? "Session page" : "Sessions"}
      </Link>
      <h1 className="mt-3 text-2xl font-expanded font-bold sm:text-3xl">
        {editing ? "Edit session" : "Host a session"}
      </h1>
      <p className="mt-1 max-w-prose text-line-dim">
        Courts are held for your club as soon as you save. You pay the court fee to the venue on the day.
      </p>
      <div className="mt-8">
        {loading && <Skeleton className="h-96" />}
        {error && <ErrorState message={error.message} />}
        {!loading && !error && hosts.length === 0 && !editing && (
          <EmptyState
            title="You can't host yet"
            body="Owners and admins of an approved club can host sessions. Start a club, or ask your club's owner to make you an admin."
            action={
              <Link to="/clubs/new" className="font-semibold text-ball underline underline-offset-4">
                Start a club
              </Link>
            }
          />
        )}
        {!loading && !error && (hosts.length > 0 || editing) && (
          <SessionForm
            key={existing.data?.id ?? "new"}
            hosts={editing && existing.data ? [{ ...existing.data.organizer }] : hosts}
            venues={venues.data ?? []}
            existing={existing.data}
            pending={mutation.isPending}
            error={mutation.error}
            submitLabel={editing ? "Save changes" : "Create session"}
            onSubmit={(input) =>
              mutation.mutate(input, {
                onSuccess: (s) => {
                  toast({
                    tone: "success",
                    message:
                      s.status === "pending_approval"
                        ? `Saved. ${s.venue.name} approves sessions before they go public; you'll see it here once they do.`
                        : editing
                          ? "Session saved."
                          : `${s.title} is open for registration.`,
                  });
                  navigate(`/sessions/${s.id}`);
                },
              })
            }
          />
        )}
      </div>
    </div>
  );
}
