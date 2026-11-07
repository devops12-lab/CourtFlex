import { ApiError } from "@courtflex/api";
import { useClubContext } from "../app/club-context";

/**
 * The server's message for a failed save. Field errors are shown under their
 * inputs, so only list what isn't tied to a field, plus any bookings that block
 * the change (409 conflicts).
 */
export function FormError({ error, fields = [] }: { error: Error | null; fields?: string[] }) {
  if (!error) return null;
  const api = error instanceof ApiError ? error : null;
  const conflicts = api?.errors.conflicts ?? [];
  const onlyFieldErrors =
    api?.status === 422 &&
    Object.keys(api.errors).length > 0 &&
    Object.keys(api.errors).every((k) => fields.includes(k));
  if (onlyFieldErrors) return null;

  return (
    <div role="alert" className="border-l-2 border-signal-red pl-3 text-sm">
      <p>
        {api?.status === 422 && !conflicts.length ? (firstFieldError(api) ?? error.message) : error.message}
      </p>
      {conflicts.length > 0 && (
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-line-dim">
          {conflicts.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function firstFieldError(error: ApiError) {
  return Object.values(error.errors)[0]?.[0];
}

/** Explains why a form is locked when the club's subscription has ended. */
export function ReadOnlyNote() {
  const { club } = useClubContext();
  if (!club.read_only) return null;
  return (
    <p className="border-l-2 border-signal-red pl-3 text-sm">
      Viewing only. {club.name}'s subscription has ended, so changes are paused until the plan is renewed.
    </p>
  );
}

/** Reads a field error from a failed mutation. */
export function fieldError(error: Error | null, field: string) {
  return error instanceof ApiError ? error.field(field) : undefined;
}
