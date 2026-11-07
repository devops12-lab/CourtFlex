import { useMemo, useState } from "react";
import type { Booking } from "@courtflex/api";
import {
  ApiError,
  formatMoney,
  formatTime,
  formatTimeRange,
  todayIn,
  useAvailability,
  useCourts,
  useCreateWalkIn,
  usePlayerSearch,
} from "@courtflex/api";
import {
  Button,
  cn,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Segmented,
  Sheet,
  Skeleton,
  Textarea,
  useOnline,
  useToast,
} from "@courtflex/ui";
import { useClubContext } from "../../app/club-context";

export interface WalkInPreset {
  courtId?: string;
  startsAt?: string;
  date: string;
}

type Who = "player" | "guest";

/**
 * Front-desk booking for someone at the counter. Uses the same availability
 * and pricing endpoints as player bookings; the server makes the final call.
 */
export function WalkInSheet({
  preset,
  onClose,
  onCreated,
}: {
  preset: WalkInPreset | null;
  onClose: () => void;
  onCreated: (booking: Booking) => void;
}) {
  return (
    <Sheet
      open={!!preset}
      onClose={onClose}
      title="New walk-in"
      description="For players at the front desk. Payment is recorded after the booking is made."
    >
      {preset && (
        <WalkInForm
          key={`${preset.courtId}-${preset.startsAt}-${preset.date}`}
          preset={preset}
          onCreated={onCreated}
        />
      )}
    </Sheet>
  );
}

function WalkInForm({ preset, onCreated }: { preset: WalkInPreset; onCreated: (b: Booking) => void }) {
  const { club } = useClubContext();
  const tz = club.timezone;
  const courts = useCourts(club.id);
  const online = useOnline();
  const toast = useToast();
  const create = useCreateWalkIn(club.id);

  const activeCourts = useMemo(() => (courts.data ?? []).filter((c) => c.status === "active"), [courts.data]);
  const [chosenCourtId, setCourtId] = useState(preset.courtId);
  const courtId = chosenCourtId ?? activeCourts[0]?.id;
  const [date, setDate] = useState(preset.date);
  const [minutes, setMinutes] = useState<"60" | "90" | "120">("60");
  const [chosenStart, setStartsAt] = useState<string | undefined>(preset.startsAt);
  const [who, setWho] = useState<Who>("player");
  const [query, setQuery] = useState("");
  const [playerId, setPlayerId] = useState<string>();
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [notes, setNotes] = useState("");

  const slots = useAvailability(club.id, courtId, date, Number(minutes));
  // A chosen time drops out when the court, length or date changes, or someone else books it.
  const startsAt =
    !slots.data || slots.data.some((s) => s.starts_at === chosenStart && s.available)
      ? chosenStart
      : undefined;
  const players = usePlayerSearch(club.id, query);
  const selected = slots.data?.find((s) => s.starts_at === startsAt);
  // Past times can't be booked, so they aren't offered at all.
  const upcomingSlots = (slots.data ?? []).filter((s) => new Date(s.starts_at) > new Date());

  const apiError = create.error instanceof ApiError ? create.error : null;
  const today = todayIn(tz);
  const court = activeCourts.find((c) => c.id === courtId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!courtId || !selected) return;
    create.mutate(
      {
        court_id: courtId,
        starts_at: selected.starts_at,
        ends_at: selected.ends_at,
        ...(who === "player" ? { player_id: playerId } : { guest_name: guestName, guest_phone: guestPhone }),
        notes: notes || undefined,
      },
      {
        onSuccess: (booking) => {
          toast({
            tone: "success",
            message: `Booked ${court?.name ?? "court"}, ${formatTimeRange(booking.starts_at, booking.ends_at, tz)}. Code ${booking.booking_code}.`,
          });
          onCreated(booking);
        },
      },
    );
  };

  if (courts.isPending) return <Skeleton className="h-40" />;
  if (courts.error) return <ErrorState message={courts.error.message} onRetry={() => courts.refetch()} />;
  if (activeCourts.length === 0) {
    return (
      <EmptyState
        title="No courts are open for booking"
        body="Every court is inactive or under maintenance."
      />
    );
  }

  const playerChosen = who === "player" ? !!playerId : guestName.trim().length > 0;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <Segmented
        label="Court"
        value={courtId ?? ""}
        onChange={(v) => setCourtId(v)}
        options={activeCourts.map((c) => ({ value: c.id, label: c.name }))}
      />

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
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
        <Segmented
          label="Length"
          value={minutes}
          onChange={setMinutes}
          options={[
            { value: "60", label: "1 h" },
            { value: "90", label: "1.5 h" },
            { value: "120", label: "2 h" },
          ]}
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Start time</legend>
        {apiError?.field("starts_at") && (
          <p role="alert" className="mb-3 border-l-2 border-signal-red pl-3 text-sm">
            {apiError.field("starts_at")}
          </p>
        )}
        {slots.isPending && <Skeleton className="h-36" />}
        {slots.error && <ErrorState message={slots.error.message} onRetry={() => slots.refetch()} />}
        {slots.data && upcomingSlots.every((s) => !s.available) && (
          <p className="text-line-dim">Nothing free on {court?.name} that day. Try another court or date.</p>
        )}
        {slots.data && upcomingSlots.some((s) => s.available) && (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {upcomingSlots.map((s) => {
              const isSel = s.starts_at === startsAt;
              return (
                <label
                  key={s.starts_at}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center rounded-sm border text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ball",
                    !s.available && "cursor-not-allowed border-transparent text-line-faint line-through",
                    s.available && !isSel && "cursor-pointer border-line-faint hover:border-line",
                    isSel && "border-ball bg-ball text-ball-ink",
                  )}
                >
                  <input
                    type="radio"
                    name="slot"
                    className="sr-only"
                    disabled={!s.available}
                    checked={isSel}
                    onChange={() => setStartsAt(s.starts_at)}
                  />
                  <span className="font-semibold font-condensed">{formatTime(s.starts_at, tz)}</span>
                  {s.available && (
                    <span
                      className={cn("text-xs font-condensed", isSel ? "text-ball-ink/80" : "text-line-dim")}
                    >
                      {formatMoney(s.price)}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      <div className="flex flex-col gap-4 border-t court-line pt-6">
        <Segmented
          label="Who's playing"
          value={who}
          onChange={setWho}
          options={[
            { value: "player", label: "CourtFlex player" },
            { value: "guest", label: "Guest" },
          ]}
        />
        {apiError?.field("player") && <p className="text-sm text-signal-red">{apiError.field("player")}</p>}

        {who === "player" ? (
          <div className="flex flex-col gap-2">
            <Field label="Find player" hint="Search by name or phone number.">
              {(p) => (
                <Input
                  {...p}
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPlayerId(undefined);
                  }}
                  placeholder="Jamie or 0917…"
                  autoComplete="off"
                />
              )}
            </Field>
            {players.isFetching && <Skeleton className="h-12" />}
            {players.data && players.data.length === 0 && (
              <p className="text-sm text-line-dim">No player found. Book them as a guest instead.</p>
            )}
            {players.data && players.data.length > 0 && (
              <ul
                className="flex flex-col border-y court-line"
                role="radiogroup"
                aria-label="Matching players"
              >
                {players.data.map((pl) => (
                  <li key={pl.id} className="court-line not-first:border-t">
                    <label
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-3 px-2 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ball",
                        playerId === pl.id && "bg-court-raised",
                      )}
                    >
                      <input
                        type="radio"
                        name="player"
                        className="sr-only"
                        checked={playerId === pl.id}
                        onChange={() => setPlayerId(pl.id)}
                      />
                      <span>
                        <span className="block font-semibold">{pl.name}</span>
                        <span className="block text-xs text-line-dim">
                          {pl.home_city ?? "No home city"}
                          {pl.phone_last4 ? `, phone ending ${pl.phone_last4}` : ""}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "size-4 rounded-full border-2",
                          playerId === pl.id ? "border-ball bg-ball" : "border-line-faint",
                        )}
                        aria-hidden
                      />
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Guest name">
              {(p) => (
                <Input
                  {...p}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  autoComplete="off"
                />
              )}
            </Field>
            <Field label="Phone (optional)">
              {(p) => (
                <Input
                  {...p}
                  type="tel"
                  inputMode="tel"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  autoComplete="off"
                />
              )}
            </Field>
          </div>
        )}

        <Field label="Notes (optional)">
          {(p) => (
            <Textarea
              {...p}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Renting 2 paddles"
            />
          )}
        </Field>
      </div>

      {create.error && !apiError?.field("starts_at") && !apiError?.field("player") && (
        <p role="alert" className="text-sm text-signal-red">
          {create.error.message}
        </p>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center gap-4 border-t court-line bg-court-surface px-5 py-4">
        <div className="min-w-0 flex-1 text-sm">
          {selected ? (
            <>
              <p className="font-semibold">
                {court?.name}, {formatTimeRange(selected.starts_at, selected.ends_at, tz)}
              </p>
              <p className="font-condensed text-line-dim">{formatMoney(selected.price)} due at the venue</p>
            </>
          ) : (
            <p className="text-line-dim">Pick a start time</p>
          )}
        </div>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={!selected || !playerChosen || !online}
          loading={create.isPending}
        >
          Create booking
        </Button>
      </div>
    </form>
  );
}
