import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Search } from "lucide-react";
import type { AdminClubRow, AdminVenueRow, OrgStatus } from "@courtflex/api";
import { useAdminClubs, useAdminVenues } from "@courtflex/api";
import { DataTable, ErrorState, Input, Segmented } from "@courtflex/ui";
import { OrgStatusBadge } from "../../shared/org";
import { ago } from "../../shared/time";

type StatusFilter = "" | OrgStatus;
const filters: Array<{ value: StatusFilter; label: string }> = [
  { value: "", label: "All" },
  { value: "pending_review", label: "Waiting" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "rejected", label: "Declined" },
];

/** Search text and status live in the address, so a filtered list can be shared or revisited. */
function useFilters() {
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") ?? "") as StatusFilter;
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const current = params.get("q") ?? "";
  useEffect(() => {
    if (debounced === current) return;
    setParams(
      () => {
        // From the address as it is now, so quick changes in a row don't undo each other.
        const p = new URLSearchParams(window.location.search);
        if (debounced) p.set("q", debounced);
        else p.delete("q");
        return p;
      },
      { replace: true },
    );
  }, [debounced, current, setParams]);
  const setStatus = (s: StatusFilter) =>
    setParams(() => {
      // From the address as it is now, so quick changes in a row don't undo each other.
      const p = new URLSearchParams(window.location.search);
      if (s) p.set("status", s);
      else p.delete("status");
      return p;
    });
  return { q, setQ, search: debounced, status, setStatus };
}

function FilterBar({
  label,
  placeholder,
  f,
}: {
  label: string;
  placeholder: string;
  f: ReturnType<typeof useFilters>;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
      <label className="relative block lg:w-80">
        <span className="sr-only">{label}</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-line-dim"
          aria-hidden
        />
        <Input
          type="search"
          className="pl-9"
          placeholder={placeholder}
          value={f.q}
          onChange={(e) => f.setQ(e.target.value)}
        />
      </label>
      <Segmented
        label="Status"
        value={f.status}
        onChange={f.setStatus}
        options={filters}
        className="lg:flex-1"
      />
    </div>
  );
}

export function VenuesPage() {
  const f = useFilters();
  const q = useAdminVenues({ q: f.search, status: f.status });
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-expanded sm:text-4xl">Venues</h1>
        <p className="mt-1 text-line-dim">
          Court businesses on CourtFlex. Waiting sign-ups are listed first.
        </p>
      </header>
      <FilterBar label="Search venues" placeholder="Name, city or owner" f={f} />
      {q.error ? (
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      ) : (
        <DataTable<AdminVenueRow>
          caption="Venues"
          rows={q.data}
          loading={q.isPending}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/venues/${r.id}`)}
          rowActionLabel={(r) => `Open ${r.name}`}
          empty="No venues match. Try another name or status."
          columns={[
            {
              key: "name",
              header: "Venue",
              cell: (r) => (
                <span>
                  <span className="block font-semibold">{r.name}</span>
                  <span className="block text-sm text-line-dim">
                    {r.city}, {r.province}
                  </span>
                </span>
              ),
            },
            {
              key: "owner",
              header: "Owner",
              cell: (r) =>
                r.owner ? (
                  <span>
                    <span className="block">{r.owner.name}</span>
                    <span className="block text-sm text-line-dim">{r.owner.email}</span>
                  </span>
                ) : (
                  "None"
                ),
            },
            { key: "courts", header: "Courts", numeric: true, cell: (r) => r.courts },
            { key: "plan", header: "Plan", hideOnMobile: true, cell: (r) => r.plan },
            {
              key: "status",
              header: "Status",
              cell: (r) => (
                <span className="flex flex-col items-start gap-1">
                  <OrgStatusBadge status={r.status} />
                  {r.status === "pending_review" && r.submitted_at && (
                    <span className="text-xs text-line-dim">Sent {ago(r.submitted_at)}</span>
                  )}
                </span>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

export function ClubsPage() {
  const f = useFilters();
  const q = useAdminClubs({ q: f.search, status: f.status });
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-expanded sm:text-4xl">Clubs</h1>
        <p className="mt-1 text-line-dim">Player communities. Waiting sign-ups are listed first.</p>
      </header>
      <FilterBar label="Search clubs" placeholder="Name, city or creator" f={f} />
      {q.error ? (
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      ) : (
        <DataTable<AdminClubRow>
          caption="Clubs"
          rows={q.data}
          loading={q.isPending}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/clubs/${r.id}`)}
          rowActionLabel={(r) => `Open ${r.name}`}
          empty="No clubs match. Try another name or status."
          columns={[
            {
              key: "name",
              header: "Club",
              cell: (r) => (
                <span>
                  <span className="block font-semibold">{r.name}</span>
                  <span className="block text-sm text-line-dim">
                    {r.city}, {r.province}
                  </span>
                </span>
              ),
            },
            {
              key: "by",
              header: "Created by",
              cell: (r) =>
                r.created_by ? (
                  <span>
                    <span className="block">{r.created_by.name}</span>
                    <span className="block text-sm text-line-dim">{r.created_by.email}</span>
                  </span>
                ) : (
                  "Unknown"
                ),
            },
            { key: "members", header: "Members", numeric: true, cell: (r) => r.members },
            {
              key: "status",
              header: "Status",
              cell: (r) => (
                <span className="flex flex-col items-start gap-1">
                  <OrgStatusBadge status={r.status} />
                  {r.status === "pending_review" && (
                    <span className="text-xs text-line-dim">Sent {ago(r.submitted_at)}</span>
                  )}
                </span>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
