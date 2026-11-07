import { useState } from "react";
import { Info, Megaphone, TriangleAlert } from "lucide-react";
import type { Announcement, AnnouncementAudience, AnnouncementInput } from "@courtflex/api";
import { ApiError, useAdminAnnouncements, useEndAnnouncement, useSaveAnnouncement } from "@courtflex/api";
import {
  Button,
  cn,
  ErrorState,
  Field,
  Input,
  Segmented,
  Sheet,
  Skeleton,
  Textarea,
  useToast,
} from "@courtflex/ui";
import { TZ } from "../../shared/time";

const audienceLabels: Record<AnnouncementAudience, string> = {
  players: "Players",
  owners: "Venue owners and staff",
  everyone: "Everyone",
};
const statusLabels: Record<Announcement["status"], string> = {
  live: "Showing now",
  scheduled: "Scheduled",
  ended: "Ended",
};
const when = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: TZ });

/** "2026-11-06T09:30" in Manila time, for a datetime-local input. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
/** A datetime-local value, read as Manila time (UTC+8, no daylight saving). */
const fromLocalInput = (v: string) => (v ? new Date(`${v}:00+08:00`).toISOString() : null);

export function AnnouncementsPage() {
  const list = useAdminAnnouncements();
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-expanded sm:text-4xl">Announcements</h1>
          <p className="mt-1 text-line-dim">
            A banner at the top of the player app, the owner portal, or both. People can dismiss it on their
            device.
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditing("new")}>
          <Megaphone className="size-4" aria-hidden />
          New announcement
        </Button>
      </header>
      {list.isPending ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <p className="rounded-2xl border border-line-faint p-5 text-line-dim">No announcements yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {list.data.map((a) => (
            <AnnouncementItem key={a.id} a={a} onEdit={() => setEditing(a)} />
          ))}
        </ul>
      )}
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New announcement" : editing ? `Edit "${editing.title}"` : ""}
      >
        {editing && (
          <AnnouncementForm
            key={editing === "new" ? "new" : editing.id}
            a={editing === "new" ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

function AnnouncementItem({ a, onEdit }: { a: Announcement; onEdit: () => void }) {
  const end = useEndAnnouncement();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const Icon = a.tone === "warning" ? TriangleAlert : Info;
  return (
    <li
      className={cn(
        "rounded-2xl border bg-court-surface p-5",
        a.status === "live"
          ? a.tone === "warning"
            ? "border-signal-amber/60"
            : "border-field/50"
          : "border-line-faint",
        a.status === "ended" && "opacity-75",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <Icon
            className={cn("mt-1 size-5 shrink-0", a.tone === "warning" ? "text-signal-amber" : "text-field")}
            aria-hidden
          />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold break-words">{a.title}</h2>
            <p className="mt-1 text-line-dim">{a.message}</p>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
            a.status === "live" ? "border-field/60 text-field" : "border-line-faint text-line-dim",
          )}
        >
          {statusLabels[a.status]}
        </span>
      </div>
      <p className="mt-3 text-sm text-line-dim">
        For {audienceLabels[a.audience].toLowerCase()}. From {when.format(new Date(a.starts_at))}
        {a.ends_at ? ` to ${when.format(new Date(a.ends_at))}` : " until ended"}. Posted by{" "}
        {a.created_by.name}.
      </p>
      {a.status !== "ended" && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onEdit}>
            Edit
          </Button>
          {confirming ? (
            <>
              <span className="text-sm">End it now? It disappears for everyone.</span>
              <Button
                size="sm"
                variant="danger"
                loading={end.isPending}
                onClick={() =>
                  end.mutate(a.id, {
                    onSuccess: () => {
                      setConfirming(false);
                      toast({ tone: "success", message: `Ended "${a.title}".` });
                    },
                  })
                }
              >
                End it
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
              End now
            </Button>
          )}
        </div>
      )}
      {end.error && <p className="mt-2 text-sm text-signal-red">{end.error.message}</p>}
    </li>
  );
}

function AnnouncementForm({ a, onDone }: { a?: Announcement; onDone: () => void }) {
  const save = useSaveAnnouncement(a?.id);
  const toast = useToast();
  const [v, setV] = useState({
    title: a?.title ?? "",
    message: a?.message ?? "",
    audience: a?.audience ?? ("everyone" as AnnouncementAudience),
    tone: a?.tone ?? ("info" as "info" | "warning"),
    starts: a ? toLocalInput(a.starts_at) : "",
    ends: a ? toLocalInput(a.ends_at) : "",
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const fieldErrors = ["title", "message", "audience", "tone", "starts_at", "ends_at"];
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const input: AnnouncementInput = {
          title: v.title.trim(),
          message: v.message.trim(),
          audience: v.audience,
          tone: v.tone,
          starts_at: fromLocalInput(v.starts),
          ends_at: fromLocalInput(v.ends),
        };
        save.mutate(input, {
          onSuccess: (r) => {
            toast({ tone: "success", message: a ? `Saved "${r.title}".` : `Posted "${r.title}".` });
            onDone();
          },
        });
      }}
    >
      <Field label="Title" hint="Up to 80 characters." error={err?.field("title")}>
        {(p) => (
          <Input
            {...p}
            maxLength={80}
            value={v.title}
            onChange={(e) => setV({ ...v, title: e.target.value })}
          />
        )}
      </Field>
      <Field
        label="Message"
        hint={`${v.message.trim().length} of 280 characters.`}
        error={err?.field("message")}
      >
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            maxLength={280}
            value={v.message}
            onChange={(e) => setV({ ...v, message: e.target.value })}
          />
        )}
      </Field>
      <Segmented<AnnouncementAudience>
        label="Who sees it"
        value={v.audience}
        onChange={(audience) => setV({ ...v, audience })}
        options={(Object.keys(audienceLabels) as AnnouncementAudience[]).map((x) => ({
          value: x,
          label: x === "owners" ? "Venues" : audienceLabels[x],
        }))}
      />
      <Segmented<"info" | "warning">
        label="Kind"
        value={v.tone}
        onChange={(tone) => setV({ ...v, tone })}
        options={[
          { value: "info", label: "Information" },
          { value: "warning", label: "Warning" },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts" hint="Manila time. Empty: now." error={err?.field("starts_at")}>
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={v.starts}
              onChange={(e) => setV({ ...v, starts: e.target.value })}
            />
          )}
        </Field>
        <Field label="Ends" hint="Empty: until you end it." error={err?.field("ends_at")}>
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={v.ends}
              onChange={(e) => setV({ ...v, ends: e.target.value })}
            />
          )}
        </Field>
      </div>
      {err && !fieldErrors.some((k) => err.field(k)) && (
        <p role="alert" className="text-sm text-signal-red">
          {err.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={save.isPending}>
          {a ? "Save" : "Post announcement"}
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}
