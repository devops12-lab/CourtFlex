import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { AuditEntry } from "@courtflex/api";
import { useAuditLog } from "@courtflex/api";
import { Button, ErrorState, Field, Input, Select, Skeleton } from "@courtflex/ui";
import { ago, TZ } from "../../shared/time";

const types: Array<{ value: string; label: string }> = [
  { value: "", label: "Everything" },
  { value: "venue", label: "Venues" },
  { value: "club", label: "Clubs" },
  { value: "user", label: "Users" },
  { value: "billing", label: "Billing" },
  { value: "competition", label: "Competition" },
  { value: "plan", label: "Plans" },
  { value: "announcement", label: "Announcements" },
  { value: "settings", label: "Settings" },
];

/** Where an entry's subject lives in the admin portal. */
function linkFor(a: AuditEntry): string | null {
  switch (a.target.type) {
    case "venue":
      return `/venues/${a.target.id}`;
    case "club":
      return `/clubs/${a.target.id}`;
    case "user":
      return `/users/${a.target.id}`;
    case "plan":
      return "/billing?tab=plans";
    case "announcement":
      return "/announcements";
    case "settings":
      return "/settings";
    default:
      return null;
  }
}

const when = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: TZ });

export function AuditLogPage() {
  const [params, setParams] = useSearchParams();
  const type = params.get("type") ?? "";
  const page = Number(params.get("page") ?? 1) || 1;
  const [q, setQ] = useState(params.get("q") ?? "");
  const [search, setSearch] = useState(q.trim());
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const current = params.get("q") ?? "";
  useEffect(() => {
    if (search === current) return;
    setParams(
      () => {
        // From the address as it is now, so quick changes in a row don't undo each other.
        const p = new URLSearchParams(window.location.search);
        if (search) p.set("q", search);
        else p.delete("q");
        p.delete("page");
        return p;
      },
      { replace: true },
    );
  }, [search, current, setParams]);
  const set = (key: string, value: string) =>
    setParams(() => {
      // From the address as it is now, so quick changes in a row don't undo each other.
      const p = new URLSearchParams(window.location.search);
      if (value) p.set(key, value);
      else p.delete(key);
      if (key !== "page") p.delete("page");
      return p;
    });

  const log = useAuditLog({ q: search, type, page });
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-expanded sm:text-4xl">Audit log</h1>
        <p className="mt-1 text-line-dim">
          Every change a Super Admin made, newest first. Entries can't be edited or removed.
        </p>
      </header>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="relative sm:w-80">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-line-dim"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search the audit log"
            className="pl-9"
            placeholder="What, who or why"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Field label="Show" className="sm:w-56">
          {(p) => (
            <Select {...p} value={type} onChange={(e) => set("type", e.target.value)}>
              {types.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {log.isPending ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : log.error ? (
        <ErrorState message={log.error.message} onRetry={() => log.refetch()} />
      ) : log.data.entries.length === 0 ? (
        <p className="rounded-2xl border border-line-faint p-5 text-line-dim">
          No entries match. Try other words or show everything.
        </p>
      ) : (
        <>
          <p className="text-sm text-line-dim" aria-live="polite">
            {log.data.total} {log.data.total === 1 ? "entry" : "entries"}
          </p>
          <ol className="divide-y divide-line-faint border-y border-line-faint">
            {log.data.entries.map((a) => {
              const to = linkFor(a);
              return (
                <li key={a.id} className="grid gap-1 py-4 sm:grid-cols-[1fr_12rem] sm:gap-6">
                  <div className="min-w-0">
                    <p className="font-semibold break-words">
                      {to ? (
                        <Link to={to} className="hover:text-ball">
                          {a.summary}
                        </Link>
                      ) : (
                        a.summary
                      )}
                    </p>
                    {a.reason && <p className="mt-0.5 text-sm">Reason: {a.reason}</p>}
                  </div>
                  <p className="text-sm text-line-dim sm:text-right">
                    {a.actor.name}
                    <span className="block">
                      <time dateTime={a.at} title={ago(a.at)}>
                        {when.format(new Date(a.at))}
                      </time>
                    </span>
                  </p>
                </li>
              );
            })}
          </ol>
          {log.data.pages > 1 && (
            <nav aria-label="Audit log pages" className="flex items-center justify-between gap-3">
              <Button
                size="sm"
                disabled={log.data.page <= 1}
                onClick={() => set("page", String(log.data.page - 1))}
              >
                <ChevronLeft className="size-4" aria-hidden />
                Newer
              </Button>
              <span className="text-sm text-line-dim">
                Page {log.data.page} of {log.data.pages}
              </span>
              <Button
                size="sm"
                disabled={log.data.page >= log.data.pages}
                onClick={() => set("page", String(log.data.page + 1))}
              >
                Older
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
