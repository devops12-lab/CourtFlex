import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { ExternalLink, Search } from "lucide-react";
import type { AdminDispute, AdminRatingRow, RatingRulesInput } from "@courtflex/api";
import {
  ApiError,
  useAdjustRating,
  useAdminDisputes,
  useAdminRatings,
  useRatingAdjustments,
  useRatingRules,
  useResolveDispute,
  useSaveRatingRules,
} from "@courtflex/api";
import {
  Button,
  cn,
  ErrorState,
  Field,
  Input,
  Segmented,
  Sheet,
  Skeleton,
  Tabs,
  Textarea,
  useToast,
} from "@courtflex/ui";
import { ago } from "../../shared/time";

type Tab = "disputes" | "ratings" | "rules";
const names = (team: Array<{ name: string }>) => team.map((p) => p.name.split(" ")[0]).join(" & ");

/** Disputed results, rating corrections and rating rules: the Super Admin's side of competition. */
export function CompetitionPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") ?? "disputes") as Tab;
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-expanded sm:text-4xl">Competition</h1>
        <p className="mt-1 text-line-dim">
          Settle disputed results, correct ratings, and set how ratings work.
        </p>
      </header>
      <Tabs<Tab>
        className="min-w-0"
        label="Competition"
        value={tab}
        onChange={(t) => setParams({ tab: t })}
        items={[
          { value: "disputes", label: "Disputes" },
          { value: "ratings", label: "Ratings" },
          { value: "rules", label: "Rating rules" },
        ]}
      >
        {(t) => (
          <div className="mt-6">
            {t === "disputes" ? <Disputes /> : t === "ratings" ? <Ratings /> : <Rules />}
          </div>
        )}
      </Tabs>
    </div>
  );
}

// ── Disputes ──────────────────────────────────────────────

function Disputes() {
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const q = useAdminDisputes(status);
  return (
    <div className="flex flex-col gap-5">
      <Segmented
        label="Show"
        value={status}
        onChange={setStatus}
        options={[
          { value: "open", label: "Waiting" },
          { value: "resolved", label: "Settled" },
        ]}
        className="max-w-xs"
      />
      {q.isPending ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <p className="rounded-2xl border border-line-faint p-5 text-line-dim">
          {status === "open"
            ? "No disputed results waiting. Players dispute a result from its match page."
            : "No disputes settled yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {q.data.map((d) => (
            <li key={d.match.id}>
              <DisputeCard d={d} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DisputeCard({ d }: { d: AdminDispute }) {
  const [deciding, setDeciding] = useState<"keep" | "void" | null>(null);
  const [note, setNote] = useState("");
  const resolve = useResolveDispute(d.match.id);
  const toast = useToast();
  const err = resolve.error instanceof ApiError ? resolve.error : null;
  const m = d.match;
  const where = [m.court && m.venue ? `${m.court.name}, ${m.venue.name}` : m.venue?.name, d.tournament?.name]
    .filter(Boolean)
    .join(" · ");
  return (
    <article className="rounded-2xl border border-line-faint bg-court-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-line-dim">
            {m.match_type === "singles" ? "Singles" : "Doubles"}, {m.category}
            {where ? ` · ${where}` : ""}
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            {names(m.teams[0])} <span className="text-line-dim">vs</span> {names(m.teams[1])}
            <span className="ml-3 text-xl font-condensed tabular-nums">{m.score}</span>
          </h2>
          <p className="mt-1 text-sm text-line-dim">
            Submitted by {d.submitted_by.name}. Disputed by {d.dispute.by.name} {ago(d.dispute.at)}.
          </p>
        </div>
        <a
          href={`/matches/${m.id}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-ball underline underline-offset-4"
        >
          Open the match
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
      <blockquote className="mt-3 border-l-2 border-signal-amber pl-3">"{d.dispute.reason}"</blockquote>

      {d.resolution ? (
        <p className="mt-4 text-sm">
          <strong>{d.resolution.decision === "keep" ? "Result kept" : "Match voided"}</strong> by{" "}
          {d.resolution.by.name} {ago(d.resolution.at)}: {d.resolution.note}
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setDeciding("keep")}>
            Keep the result
          </Button>
          <Button variant="danger" onClick={() => setDeciding("void")}>
            Void the match
          </Button>
        </div>
      )}

      <Sheet
        open={!!deciding}
        onClose={() => setDeciding(null)}
        title={deciding === "keep" ? "Keep this result?" : "Void this match?"}
        description={
          deciding === "keep"
            ? `It becomes official${m.category === "casual" ? "" : " and ratings change"}. ${d.tournament ? "The winner moves on in the tournament. " : ""}The players see your note.`
            : `It never counts for anyone.${d.tournament ? " The tournament gets a fresh match for this pairing." : ""} The players see your note.`
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDeciding(null)}>Cancel</Button>
            <Button
              variant={deciding === "keep" ? "primary" : "danger"}
              loading={resolve.isPending}
              onClick={() =>
                resolve.mutate(
                  { decision: deciding!, note: note.trim() },
                  {
                    onSuccess: () => {
                      toast({
                        tone: "success",
                        message: deciding === "keep" ? "Result kept." : "Match voided.",
                      });
                      setDeciding(null);
                    },
                  },
                )
              }
            >
              {deciding === "keep" ? "Keep the result" : "Void the match"}
            </Button>
          </div>
        }
      >
        <Field label="Note to the players" hint="At least 10 characters." error={err?.field("note")}>
          {(p) => <Textarea {...p} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {err && !err.field("note") && <p className="mt-2 text-sm text-signal-red">{err.message}</p>}
      </Sheet>
    </article>
  );
}

// ── Ratings ───────────────────────────────────────────────

function Ratings() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const list = useAdminRatings(search);
  const recent = useRatingAdjustments();
  const [editing, setEditing] = useState<AdminRatingRow | null>(null);
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-line-dim"
          aria-hidden
        />
        <Input
          type="search"
          aria-label="Find a player"
          className="pl-9"
          placeholder="Player name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {list.isPending ? (
        <Skeleton className="h-48" />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
      ) : (
        <div className="relative min-w-0 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <caption className="sr-only">Players' ratings</caption>
            <thead>
              <tr className="border-b-2 border-line text-left text-line-dim">
                <th scope="col" className="py-2 font-medium">
                  Player
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Doubles
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Singles
                </th>
                <th scope="col" className="py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((r) => (
                <tr key={r.player.id} className="border-b border-line-faint">
                  <td className="py-2.5">
                    <span className="block font-semibold">{r.player.name}</span>
                    <span className="block text-line-dim">{r.player.city ?? r.player.email}</span>
                  </td>
                  {(["doubles", "singles"] as const).map((k) => (
                    <td key={k} className="py-2.5 text-right">
                      <span className="text-base font-condensed tabular-nums">{r[k].rating}</span>
                      <span className="block text-xs text-line-dim">
                        {r[k].games} rated{r[k].provisional ? ", provisional" : ""}
                      </span>
                    </td>
                  ))}
                  <td className="py-2.5 text-right">
                    <Button size="sm" onClick={() => setEditing(r)}>
                      Correct
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section aria-labelledby="adj-h">
        <h2 id="adj-h" className="text-lg font-expanded">
          Recent corrections
        </h2>
        {recent.data?.length ? (
          <ol className="mt-2 divide-y divide-line-faint border-y border-line-faint">
            {recent.data.map((a) => (
              <li key={a.id} className="py-3 text-sm">
                <p>
                  <strong>{a.player.name}</strong> {a.type}: {a.old} → {a.new}
                </p>
                <p className="text-line-dim">
                  {a.by.name}, {ago(a.at)}. Reason: {a.reason}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-line-dim">No corrections yet.</p>
        )}
      </section>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Correct ${editing.player.name}'s rating` : ""}
      >
        {editing && <AdjustForm row={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

function AdjustForm({ row, onDone }: { row: AdminRatingRow; onDone: () => void }) {
  const [type, setType] = useState<"doubles" | "singles">("doubles");
  const [rating, setRating] = useState(String(row.doubles.rating));
  const [reason, setReason] = useState("");
  const adjust = useAdjustRating();
  const toast = useToast();
  const err = adjust.error instanceof ApiError ? adjust.error : null;
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        adjust.mutate(
          { player_id: row.player.id, type, rating: Number(rating), reason: reason.trim() },
          {
            onSuccess: () => {
              toast({ tone: "success", message: `${row.player.name}'s ${type} rating is now ${rating}.` });
              onDone();
            },
          },
        );
      }}
    >
      <Segmented
        label="Rating"
        value={type}
        onChange={(t) => {
          setType(t);
          setRating(String(row[t].rating));
        }}
        options={[
          { value: "doubles", label: `Doubles (${row.doubles.rating})` },
          { value: "singles", label: `Singles (${row.singles.rating})` },
        ]}
      />
      <Field label="New rating" error={err?.field("rating")}>
        {(p) => (
          <Input
            {...p}
            inputMode="numeric"
            className="max-w-40 font-condensed"
            value={rating}
            onChange={(e) => setRating(e.target.value.replace(/\D/g, ""))}
          />
        )}
      </Field>
      <Field
        label="Reason"
        hint="At least 10 characters. Recorded in the audit log."
        error={err?.field("reason")}
      >
        {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
      </Field>
      <p className="-mt-2 text-sm text-line-dim">
        It's added to the player's rating history as a correction. Their record and rated matches don't
        change.
      </p>
      {err && !err.field("rating") && !err.field("reason") && (
        <p className="text-sm text-signal-red">{err.message}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={adjust.isPending}>
          Save rating
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

// ── Rules ─────────────────────────────────────────────────

function Rules() {
  const q = useRatingRules();
  if (q.isPending) return <Skeleton className="h-64 max-w-xl" />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  return <RulesForm key={JSON.stringify(q.data)} initial={q.data} />;
}

function RulesForm({ initial }: { initial: RatingRulesInput }) {
  const save = useSaveRatingRules();
  const toast = useToast();
  const [v, setV] = useState(
    () =>
      Object.fromEntries(Object.entries(initial).map(([k, x]) => [k, String(x)])) as Record<
        keyof RatingRulesInput,
        string
      >,
  );
  const err = save.error instanceof ApiError ? save.error : null;
  const field = (k: keyof RatingRulesInput, label: string, hint: string) => (
    <Field label={label} hint={hint} error={err?.field(k)}>
      {(p) => (
        <Input
          {...p}
          inputMode="numeric"
          className={cn("max-w-32 font-condensed")}
          value={v[k]}
          onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/\D/g, "") })}
        />
      )}
    </Field>
  );
  return (
    <form
      noValidate
      className="flex max-w-xl flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(
          {
            initial: Number(v.initial),
            provisional_matches: Number(v.provisional_matches),
            k_provisional: Number(v.k_provisional),
            k_established: Number(v.k_established),
          },
          { onSuccess: () => toast({ tone: "success", message: "Rating rules saved." }) },
        );
      }}
    >
      <p className="text-sm text-line-dim">
        Ratings use ELO (version elo-v1): a win against a stronger side earns more. Changes apply to matches
        made official from now on; past rating changes stay as they were. Who's ranked updates straight away.
      </p>
      {field("initial", "Starting rating", "800 to 2,000. Every new player starts here.")}
      {field(
        "provisional_matches",
        "Matches to be ranked",
        "1 to 20. Players are provisional, and not ranked, until then.",
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        {field("k_provisional", "K-factor while provisional", "8 to 64. Higher moves new players faster.")}
        {field("k_established", "K-factor after", "8 to 64, no higher than provisional.")}
      </div>
      {err &&
        !["initial", "provisional_matches", "k_provisional", "k_established"].some((k) => err.field(k)) && (
          <p className="text-sm text-signal-red">{err.message}</p>
        )}
      <Button type="submit" variant="primary" className="w-fit" loading={save.isPending}>
        Save rating rules
      </Button>
    </form>
  );
}
