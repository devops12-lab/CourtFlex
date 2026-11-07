import { Link, useNavigate, useParams } from "react-router";
import { ChevronLeft } from "lucide-react";
import { useCreateSession, useSession, useUpdateSession } from "@courtflex/api";
import { ErrorState, Skeleton, useToast } from "@courtflex/ui";
import { SessionForm } from "@courtflex/features";
import { useClubContext } from "../../app/club-context";
import { NotFoundPage } from "../clubs/NotFoundPage";

/** Create a venue session, or edit one. The venue's own courts only. */
export function SessionEditorPage() {
  const { sessionId } = useParams();
  const { club, can } = useClubContext();
  const existing = useSession(sessionId);
  const create = useCreateSession();
  const update = useUpdateSession(sessionId ?? "");
  const navigate = useNavigate();
  const toast = useToast();
  const editing = !!sessionId;
  const mutation = editing ? update : create;

  if (!can("manageOpenPlay"))
    return <NotFoundPage message="Your role can't create or edit open play sessions." />;
  if (club.read_only)
    return <NotFoundPage message="This venue is read-only, so new sessions can't be created." />;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to=".."
        relative="path"
        className="tap inline-flex items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {editing ? "Back to session" : "Open play"}
      </Link>
      <h1 className="mt-3 text-2xl font-expanded font-bold sm:text-3xl">
        {editing ? "Edit session" : "New open play session"}
      </h1>
      <p className="mt-1 max-w-prose text-line-dim">
        Courts are reserved as soon as you save, so they can't be booked by anyone else.
      </p>
      <div className="mt-8">
        {editing && existing.isPending && <Skeleton className="h-96" />}
        {editing && existing.error && (
          <ErrorState message={existing.error.message} onRetry={() => existing.refetch()} />
        )}
        {(!editing || existing.data) && (
          <SessionForm
            key={existing.data?.id ?? "new"}
            hosts={[{ type: "venue", id: club.id, name: club.name }]}
            venues={[]}
            existing={existing.data}
            pending={mutation.isPending}
            error={mutation.error}
            submitLabel={editing ? "Save changes" : "Create session"}
            onSubmit={(input) =>
              mutation.mutate(input, {
                onSuccess: (s) => {
                  toast({
                    tone: "success",
                    message: editing ? "Session saved." : `${s.title} is open for registration.`,
                  });
                  navigate(editing ? ".." : `../${s.id}`, { relative: "path" });
                },
              })
            }
          />
        )}
      </div>
    </div>
  );
}
