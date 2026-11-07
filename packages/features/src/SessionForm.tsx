import { useMemo, useState } from "react";
import type {
  ClubListing,
  OrganizerType,
  SessionDetail,
  SessionInput,
  SessionType,
  SkillLevel,
} from "@courtflex/api";
import { ApiError, shiftDate, todayIn, useCourtOptions } from "@courtflex/api";
import { Button, cn, Field, Input, Select, Textarea, useOnline } from "@courtflex/ui";
import { pesos, sessionTypeLabels, skillLabels } from "./labels";

const TZ = "Asia/Manila";
const toInstant = (date: string, time: string) => new Date(`${date}T${time}:00+08:00`).toISOString();
const localDate = (iso: string) => todayIn(TZ, new Date(iso));
const localTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: TZ,
  }).format(new Date(iso));

const times = Array.from({ length: 36 }, (_, i) => {
  const h = 5 + Math.floor(i / 2);
  const m = i % 2 ? "30" : "00";
  return {
    value: `${String(h).padStart(2, "0")}:${m}`,
    label: `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "AM" : "PM"}`,
  };
});

const deadlines = [
  { hours: 0, label: "When it starts" },
  { hours: 1, label: "1 hour before" },
  { hours: 3, label: "3 hours before" },
  { hours: 12, label: "12 hours before" },
  { hours: 24, label: "The day before" },
];

export interface HostOption {
  type: OrganizerType;
  id: string;
  name: string;
}

/**
 * Create or edit a session. Courts are checked live against the venue's schedule;
 * the server checks again when saving, so two hosts can't take the same court.
 */
export function SessionForm({
  hosts,
  venues,
  existing,
  pending,
  error,
  submitLabel,
  onSubmit,
}: {
  /** Clubs the person can host for. */
  hosts: HostOption[];
  /** Venues a community session can be held at. Venue sessions use the venue itself. */
  venues: ClubListing[];
  existing?: SessionDetail;
  pending: boolean;
  error: Error | null;
  submitLabel: string;
  onSubmit: (input: SessionInput) => void;
}) {
  const online = useOnline();
  const tomorrow = shiftDate(todayIn(TZ), 1);
  const [host, setHost] = useState(
    existing
      ? `${existing.organizer.type}:${existing.organizer.id}`
      : hosts[0]
        ? `${hosts[0].type}:${hosts[0].id}`
        : "",
  );
  const [hostType, hostId] = host.split(":") as [OrganizerType, string];
  const clubHost = hostType === "community";
  const [venueId, setVenueId] = useState(existing?.venue.id ?? "");
  const [date, setDate] = useState(existing ? localDate(existing.starts_at) : tomorrow);
  const [from, setFrom] = useState(existing ? localTime(existing.starts_at) : "18:00");
  const [to, setTo] = useState(existing ? localTime(existing.ends_at) : "21:00");
  const [courtIds, setCourtIds] = useState<string[]>(existing?.courts.map((c) => c.id) ?? []);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [type, setType] = useState<SessionType>(existing?.session_type ?? "open_play");
  const [level, setLevel] = useState<SkillLevel>(existing?.skill_level ?? "all");
  const [capacity, setCapacity] = useState(String(existing?.capacity ?? 12));
  const [fee, setFee] = useState(existing ? String(Number(existing.fee)) : "150");
  const [memberFee, setMemberFee] = useState(existing ? String(Number(existing.member_fee)) : "100");
  const [deadline, setDeadline] = useState(() => {
    if (!existing) return 1;
    const h = Math.round(
      (new Date(existing.starts_at).getTime() - new Date(existing.registration_deadline).getTime()) /
        3_600_000,
    );
    return deadlines.reduce((best, d) => (Math.abs(d.hours - h) < Math.abs(best - h) ? d.hours : best), 0);
  });
  const [membersOnly, setMembersOnly] = useState(existing?.members_only ?? false);

  const venue = hostType === "venue" ? hostId : venueId;
  const startsAt = toInstant(date, from);
  const endsAt = toInstant(date, to);
  const options = useCourtOptions(venue || undefined, startsAt, endsAt, existing?.id);
  const err = (f: string) => (error instanceof ApiError ? error.field(f) : undefined);
  const courtErrors = error instanceof ApiError ? (error.errors.court_ids ?? []) : [];
  const courtFee = useMemo(
    () =>
      (options.data ?? []).filter((c) => courtIds.includes(c.id)).reduce((s, c) => s + Number(c.price), 0),
    [options.data, courtIds],
  );
  const hostVenues = venues.filter((v) => v.accepts_community_sessions);

  return (
    <form
      noValidate
      className="flex flex-col gap-10"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          organizer_type: hostType,
          organizer_id: hostId,
          venue_id: venue,
          court_ids: courtIds,
          title,
          description,
          session_type: type,
          skill_level: level,
          starts_at: startsAt,
          ends_at: endsAt,
          registration_deadline: new Date(new Date(startsAt).getTime() - deadline * 3_600_000).toISOString(),
          capacity: Number(capacity),
          fee: fee.trim() || "0",
          // Only clubs have members. A venue's session charges everyone the same.
          member_fee: clubHost ? memberFee.trim() || "0" : fee.trim() || "0",
          members_only: clubHost && membersOnly,
        });
      }}
    >
      <Section title="Who and where">
        {hosts.length > 1 && !existing ? (
          <Field label="Host as" error={err("organizer_id")}>
            {(p) => (
              <Select {...p} value={host} onChange={(e) => (setHost(e.target.value), setCourtIds([]))}>
                {hosts.map((h) => (
                  <option key={`${h.type}:${h.id}`} value={`${h.type}:${h.id}`}>
                    {h.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <p>
            Hosted by{" "}
            <strong className="font-semibold">
              {hosts.find((h) => `${h.type}:${h.id}` === host)?.name ?? existing?.organizer.name}
            </strong>
          </p>
        )}
        {hostType === "community" && (
          <Field
            label="Venue"
            hint="Only venues that host community sessions are listed. Some approve sessions before they go public."
            error={err("venue_id")}
          >
            {(p) => (
              <Select
                {...p}
                value={venueId}
                disabled={!!existing}
                onChange={(e) => (setVenueId(e.target.value), setCourtIds([]))}
              >
                <option value="">Choose a venue</option>
                {hostVenues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}, {v.city}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </Section>

      <Section title="When and which courts">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date" error={err("starts_at")}>
            {(p) => (
              <Input
                {...p}
                type="date"
                min={todayIn(TZ)}
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
              />
            )}
          </Field>
          <Field label="Starts">
            {(p) => (
              <Select {...p} value={from} onChange={(e) => setFrom(e.target.value)}>
                {times.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Ends" error={err("ends_at")}>
            {(p) => (
              <Select {...p} value={to} onChange={(e) => setTo(e.target.value)}>
                {times.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Courts</legend>
          {!venue && <p className="text-sm text-line-dim">Choose a venue to see its courts.</p>}
          {venue && options.isPending && <p className="text-sm text-line-dim">Checking courts…</p>}
          {options.data && (
            <div className="grid gap-2 sm:grid-cols-2">
              {options.data.map((c) => {
                const on = courtIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-sm border px-3 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ball",
                      !c.available &&
                        !on &&
                        "cursor-not-allowed border-transparent bg-court-surface text-line-dim",
                      c.available && !on && "cursor-pointer border-line-faint hover:border-line",
                      on && "cursor-pointer border-ball bg-ball/10",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      disabled={!c.available && !on}
                      onChange={() =>
                        setCourtIds((ids) => (on ? ids.filter((x) => x !== c.id) : [...ids, c.id]))
                      }
                    />
                    <span>
                      <span className="block font-semibold">{c.name}</span>
                      <span className="block text-xs capitalize">
                        {c.available ? c.indoor_outdoor : c.reason}
                      </span>
                    </span>
                    {c.available && hostType === "community" && (
                      <span className="text-sm font-condensed">{pesos(c.price)}</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
          {courtErrors.map((m) => (
            <p key={m} className="mt-2 text-sm text-signal-red">
              {m}
            </p>
          ))}
          {hostType === "community" && courtIds.length > 0 && (
            <p className="mt-3 text-sm">
              Court fee: <strong className="font-semibold font-condensed">{pesos(courtFee)}</strong>, paid to
              the venue on the day.
            </p>
          )}
        </fieldset>
      </Section>

      <Section title="The session">
        <Field label="Name" error={err("title")}>
          {(p) => (
            <Input
              {...p}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Friday Night Rally"
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            {(p) => (
              <Select {...p} value={type} onChange={(e) => setType(e.target.value as SessionType)}>
                {(Object.keys(sessionTypeLabels) as SessionType[]).map((t) => (
                  <option key={t} value={t}>
                    {sessionTypeLabels[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Skill level">
            {(p) => (
              <Select {...p} value={level} onChange={(e) => setLevel(e.target.value as SkillLevel)}>
                {(Object.keys(skillLabels) as SkillLevel[]).map((l) => (
                  <option key={l} value={l}>
                    {skillLabels[l]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Description (optional)">
          {(p) => (
            <Textarea
              {...p}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Paddle stack rotation. Beginners welcome."
            />
          )}
        </Field>
      </Section>

      <Section title="Players and fees">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Most players" hint={`About 4 to 6 per court.`} error={err("capacity")}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={4}
                max={64}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="font-condensed"
              />
            )}
          </Field>
          <Field label="Fee" hint="0 for free." error={err("fee")}>
            {(p) => <Money {...p} value={fee} onChange={setFee} />}
          </Field>
          {clubHost && (
            <Field label="Member fee" hint="What club members pay." error={err("member_fee")}>
              {(p) => <Money {...p} value={memberFee} onChange={setMemberFee} />}
            </Field>
          )}
        </div>
        <Field label="Registration closes" error={err("registration_deadline")}>
          {(p) => (
            <Select
              {...p}
              value={deadline}
              onChange={(e) => setDeadline(Number(e.target.value))}
              className="sm:w-60"
            >
              {deadlines.map((d) => (
                <option key={d.hours} value={d.hours}>
                  {d.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {clubHost && (
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={membersOnly}
              onChange={(e) => setMembersOnly(e.target.checked)}
              className="mt-1 size-4 accent-[var(--color-ball)]"
            />
            <span>
              <span className="block font-semibold">Members only</span>
              <span className="block text-sm text-line-dim">
                Only active members of the club can register.
              </span>
            </span>
          </label>
        )}
      </Section>

      {error && !(error instanceof ApiError && error.status === 422) && (
        <p role="alert" className="border-l-2 border-signal-red pl-3 text-sm">
          {error.message}
        </p>
      )}
      <div>
        <Button type="submit" variant="primary" size="lg" loading={pending} disabled={!online || !host}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t-2 border-line pt-5">
      <h2 className="text-xl font-expanded font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Money({ value, onChange, ...rest }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-line-dim">₱</span>
      <Input
        {...rest}
        inputMode="decimal"
        className="pl-7 font-condensed"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
