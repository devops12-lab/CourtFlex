import { useState } from "react";
import { Plus } from "lucide-react";
import {
  formatDateShort,
  formatTimeRange,
  todayIn,
  useClosures,
  useCourts,
  useCreateClosure,
  useDeleteClosure,
} from "@courtflex/api";
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Sheet,
  Skeleton,
  Textarea,
  useOnline,
  useToast,
} from "@courtflex/ui";
import { useClubContext } from "../../app/club-context";
import { FormError, fieldError } from "../../shared/FormFeedback";
import { halfHours } from "../../shared/time-options";

/** Club-local date and time to an instant. Manila has no daylight saving, so the offset is fixed. */
const toInstant = (date: string, time: string) => new Date(`${date}T${time}:00+08:00`).toISOString();

/** One-off closures: holidays, repairs, typhoons. */
export function ClosuresSection() {
  const { club, can } = useClubContext();
  const closures = useClosures(club.id);
  const courts = useCourts(club.id);
  const remove = useDeleteClosure(club.id);
  const toast = useToast();
  const online = useOnline();
  const [adding, setAdding] = useState(false);
  const canEdit = can("manageCourtSchedules") && !club.read_only;
  const courtName = (id: string) => courts.data?.find((c) => c.id === id)?.name ?? "Court";

  return (
    <section className="mt-12 border-t-2 border-line pt-6" aria-labelledby="closures-h">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="closures-h" className="text-xl font-expanded font-bold">
            Closures
          </h2>
          <p className="mt-1 max-w-prose text-line-dim">
            Holidays, repairs or bad weather. Closed time can't be booked and shows on the calendar.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            Add closure
          </Button>
        )}
      </div>

      <div className="mt-5">
        {closures.isPending && <Skeleton className="h-24" />}
        {closures.error && <ErrorState message={closures.error.message} onRetry={() => closures.refetch()} />}
        {closures.data?.length === 0 && (
          <EmptyState title="No closures coming up" body="Every court follows its regular hours." />
        )}
        {closures.data && closures.data.length > 0 && (
          <ul className="border-t court-line">
            {closures.data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b court-line py-3">
                <span className="w-28 font-semibold">{courtName(c.court_id)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block">{c.reason}</span>
                  <span className="block text-sm font-condensed text-line-dim">
                    {formatDateShort(c.starts_at, club.timezone)},{" "}
                    {formatTimeRange(c.starts_at, c.ends_at, club.timezone)}
                  </span>
                </span>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!online || remove.isPending}
                    onClick={() =>
                      remove.mutate(c.id, {
                        onSuccess: () =>
                          toast({
                            tone: "success",
                            message: `Closure removed. ${courtName(c.court_id)} can be booked again then.`,
                          }),
                        onError: (e) => toast({ tone: "error", message: e.message }),
                      })
                    }
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <AddClosureSheet open={adding} onClose={() => setAdding(false)} />
    </section>
  );
}

function AddClosureSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { club } = useClubContext();
  const courts = useCourts(club.id);
  const create = useCreateClosure(club.id);
  const toast = useToast();
  const online = useOnline();
  const today = todayIn(club.timezone);
  const [courtId, setCourtId] = useState("");
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState("06:00");
  const [to, setTo] = useState("22:00");
  const [reason, setReason] = useState("");
  const chosenCourt = courtId || courts.data?.[0]?.id || "";

  const close = () => {
    create.reset();
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Add closure"
      description="Bookings already in that time must be moved or cancelled first."
    >
      {open && (
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              {
                court_id: chosenCourt,
                starts_at: toInstant(date, from),
                ends_at: toInstant(date, to),
                reason,
              },
              {
                onSuccess: () => {
                  toast({ tone: "success", message: "Closure added. That time is no longer bookable." });
                  close();
                },
              },
            );
          }}
        >
          <Field label="Court" error={fieldError(create.error, "court_id")}>
            {(p) => (
              <Select {...p} value={chosenCourt} onChange={(e) => setCourtId(e.target.value)}>
                {courts.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Date">
            {(p) => (
              <Input
                {...p}
                type="date"
                min={today}
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="From">
              {(p) => (
                <Select {...p} value={from} onChange={(e) => setFrom(e.target.value)}>
                  {halfHours.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Until" error={fieldError(create.error, "ends_at")}>
              {(p) => (
                <Select {...p} value={to} onChange={(e) => setTo(e.target.value)}>
                  {halfHours.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field
            label="Reason"
            hint="Staff see it on the calendar."
            error={fieldError(create.error, "reason")}
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
          <FormError error={create.error} fields={["court_id", "ends_at", "reason"]} />
          <div>
            <Button type="submit" variant="primary" size="lg" loading={create.isPending} disabled={!online}>
              Add closure
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
