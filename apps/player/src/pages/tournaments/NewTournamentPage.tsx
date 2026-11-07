import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import type { MatchFormat, TournamentFormat, TournamentInput } from "@courtflex/api";
import { ApiError, useCourtOptions, useCreateTournament, useMe, useTournamentHosts } from "@courtflex/api";
import { Button, cn, ErrorState, Field, Input, Segmented, Select, Skeleton, Textarea } from "@courtflex/ui";
import { formatLabels } from "./TournamentsPages";

/** "2026-11-14T08:00" (Manila) → ISO. */
const fromLocal = (v: string) => (v ? new Date(`${v}:00+08:00`).toISOString() : "");
/** A date `days` from now at `hour`:00 Manila, for a datetime-local input. */
function localIn(days: number, hour: number) {
  const d = new Date(Date.now() + days * 86_400_000 + 8 * 3_600_000);
  return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
}

const formatHelp: Record<TournamentFormat, string> = {
  single_elimination:
    "Lose once and you're out. Seeded by rating; the top seeds get byes when the draw isn't full.",
  round_robin: "Everyone plays everyone. Most wins takes it, then point difference.",
  pool_knockout: "Pools play a round robin; the top two of each go to a seeded knockout.",
};

/**
 * Run a tournament: for a venue the person owns or manages, or a club they
 * run (the club picks a venue). Per the permissions table.
 */
export function NewTournamentPage() {
  const me = useMe();
  const hosts = useTournamentHosts(!!me.data);
  const create = useCreateTournament();
  const navigate = useNavigate();
  const [hostKey, setHostKey] = useState("");
  const host = hosts.data?.find((h) => `${h.type}:${h.id}` === hostKey) ?? hosts.data?.[0];
  const [venueChoice, setVenueChoice] = useState<string | null>(null);
  const venueId = host?.type === "venue" ? host.id : (venueChoice ?? host?.venue_id ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [matchType, setMatchType] = useState<"singles" | "doubles">("doubles");
  const [format, setFormat] = useState<TournamentFormat>("single_elimination");
  const [game, setGame] = useState<MatchFormat>({ target: 11, win_by: 2, best_of: 1, scoring: "side_out" });
  const [startsAt, setStartsAt] = useState(localIn(7, 8));
  const [closesAt, setClosesAt] = useState(localIn(5, 20));
  const [capacity, setCapacity] = useState("8");
  const [fee, setFee] = useState("0");
  const [pools, setPools] = useState("2");
  const [courtIds, setCourtIds] = useState<string[]>([]);
  const err = create.error instanceof ApiError ? create.error : null;

  const startIso = fromLocal(startsAt);
  const endIso = useMemo(
    () => (startIso ? new Date(new Date(startIso).getTime() + 8 * 3_600_000).toISOString() : ""),
    [startIso],
  );
  const courts = useCourtOptions(venueId || undefined, startIso || undefined, endIso || undefined);

  if (me.isPending || hosts.isPending) return <Skeleton className="mx-auto h-96 max-w-2xl rounded-2xl" />;
  if (!me.data) return <Navigate to="/login" state={{ from: "/tournaments/new" }} replace />;
  if (hosts.error) return <ErrorState message={hosts.error.message} onRetry={() => hosts.refetch()} />;
  if (!hosts.data.length)
    return (
      <div className="mx-auto max-w-xl py-10">
        <h1 className="text-3xl font-expanded">Run a tournament</h1>
        <p className="mt-3 text-line-dim">
          Tournaments are run by a venue's owner or managers, or by a club's owner and admins. Start a club,
          or ask your venue to run one.
        </p>
        <Link
          to="/tournaments"
          className="mt-6 inline-block font-semibold text-ball underline underline-offset-4"
        >
          See tournaments
        </Link>
      </div>
    );

  const submit = () => {
    if (!host) return;
    const input: TournamentInput = {
      host: { type: host.type, id: host.id },
      name: name.trim(),
      description: description.trim(),
      match_type: matchType,
      format,
      game,
      venue_id: venueId,
      court_ids: courtIds,
      starts_at: startIso,
      registration_closes_at: fromLocal(closesAt),
      capacity: Number(capacity),
      entry_fee: fee || "0",
      pools: format === "pool_knockout" ? Number(pools) : null,
    };
    create.mutate(input, { onSuccess: (t) => navigate(`/tournaments/${t.slug}`) });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/tournaments"
        className="tap inline-flex items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
      >
        ← Tournaments
      </Link>
      <h1 className="mt-3 text-3xl font-expanded sm:text-4xl">Run a tournament</h1>
      <p className="mt-1 text-line-dim">
        Players register on its page. When you start it, the draw is seeded by rating and every match is
        scored on the Live Scorer.
      </p>
      <form
        noValidate
        className="mt-8 flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Run by" error={err?.field("host")}>
          {(p) => (
            <Select
              {...p}
              value={host ? `${host.type}:${host.id}` : ""}
              onChange={(e) => {
                setHostKey(e.target.value);
                setVenueChoice(null);
                setCourtIds([]);
              }}
            >
              {hosts.data.map((h) => (
                <option key={`${h.type}:${h.id}`} value={`${h.type}:${h.id}`}>
                  {h.name} ({h.type === "venue" ? "venue" : "club"})
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Name" error={err?.field("name")}>
          {(p) => (
            <Input
              {...p}
              maxLength={80}
              placeholder="Mauban Doubles Open"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="About it (optional)">
          {(p) => (
            <Textarea {...p} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          )}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Segmented
            label="Played as"
            value={matchType}
            onChange={setMatchType}
            options={[
              { value: "doubles", label: "Doubles" },
              { value: "singles", label: "Singles" },
            ]}
          />
          <Field label="Format" error={err?.field("format")}>
            {(p) => (
              <Select {...p} value={format} onChange={(e) => setFormat(e.target.value as TournamentFormat)}>
                {(Object.keys(formatLabels) as TournamentFormat[]).map((f) => (
                  <option key={f} value={f}>
                    {formatLabels[f]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <p className="-mt-3 text-sm text-line-dim">{formatHelp[format]}</p>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field
            label={matchType === "doubles" ? "Teams" : "Players"}
            hint="4 to 32."
            error={err?.field("capacity")}
          >
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ""))}
              />
            )}
          </Field>
          {format === "pool_knockout" && (
            <Field label="Pools" error={err?.field("pools")}>
              {(p) => (
                <Select {...p} value={pools} onChange={(e) => setPools(e.target.value)}>
                  {[2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n} pools
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field label="Entry fee (₱)" hint="Paid at the venue. 0 for free." error={err?.field("entry_fee")}>
            {(p) => <Input {...p} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />}
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Games to">
            {(p) => (
              <Select
                {...p}
                value={game.target}
                onChange={(e) => setGame({ ...game, target: Number(e.target.value) as 11 | 15 | 21 })}
              >
                {[11, 15, 21].map((n) => (
                  <option key={n} value={n}>
                    {n}, win by 2
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Games">
            {(p) => (
              <Select
                {...p}
                value={game.best_of}
                onChange={(e) => setGame({ ...game, best_of: Number(e.target.value) as 1 | 3 })}
              >
                <option value={1}>One game</option>
                <option value={3}>Best of 3</option>
              </Select>
            )}
          </Field>
          <Field label="Scoring">
            {(p) => (
              <Select
                {...p}
                value={game.scoring}
                onChange={(e) => setGame({ ...game, scoring: e.target.value as "side_out" | "rally" })}
              >
                <option value="side_out">Side-out</option>
                <option value="rally">Rally</option>
              </Select>
            )}
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Starts" hint="Manila time." error={err?.field("starts_at")}>
            {(p) => (
              <Input
                {...p}
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            )}
          </Field>
          <Field label="Registration closes" error={err?.field("registration_closes_at")}>
            {(p) => (
              <Input
                {...p}
                type="datetime-local"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
              />
            )}
          </Field>
        </div>

        {host?.type === "community" && !host.venue_id && (
          <p className="text-sm text-signal-amber">
            Your club has no home venue. Set one in Manage club first.
          </p>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Courts</legend>
          {courts.isPending ? (
            <Skeleton className="h-20" />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {courts.data?.map((c) => (
                <li key={c.id}>
                  <label
                    className={cn(
                      "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3",
                      courtIds.includes(c.id) ? "border-ball bg-ball/10" : "border-line-faint",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--color-ball)]"
                      checked={courtIds.includes(c.id)}
                      onChange={(e) =>
                        setCourtIds((x) => (e.target.checked ? [...x, c.id] : x.filter((y) => y !== c.id)))
                      }
                    />
                    <span>
                      <span className="block font-semibold">{c.name}</span>
                      <span className="block text-xs text-line-dim">
                        {c.available ? "Free that day" : (c.reason ?? "Busy")}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {err?.field("court_ids") && <p className="text-sm text-signal-red">{err.field("court_ids")}</p>}
          <p className="text-sm text-line-dim">
            Book these courts for the day with the venue; matches are spread across them.
          </p>
        </fieldset>

        {err &&
          ![
            "host",
            "name",
            "format",
            "capacity",
            "pools",
            "entry_fee",
            "starts_at",
            "registration_closes_at",
            "court_ids",
          ].some((k) => err.field(k)) && (
            <p role="alert" className="border-l-2 border-signal-red pl-3 text-sm">
              {err.message}
            </p>
          )}
        <Button type="submit" variant="primary" size="lg" className="w-fit" loading={create.isPending}>
          Open registration
        </Button>
      </form>
    </div>
  );
}
