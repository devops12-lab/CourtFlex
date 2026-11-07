import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, KeyRound, Search, UserCheck, UserX } from "lucide-react";
import type { AdminUserRow, ClubRole, UserRole, UserStatus } from "@courtflex/api";
import {
  ApiError,
  useAdminUser,
  useAdminUsers,
  useMe,
  useSendPasswordReset,
  useUserStatus,
} from "@courtflex/api";
import {
  Button,
  cn,
  DataTable,
  ErrorState,
  Field,
  Input,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  Textarea,
  useToast,
} from "@courtflex/ui";
import { Fact, History } from "../../shared/org";
import { ago } from "../../shared/time";

export const roleLabels: Record<UserRole, string> = {
  super_admin: "Super Admin",
  venue_staff: "Venue owner or staff",
  club_admin: "Club admin",
  player: "Player",
};
const venueRoleLabels: Record<ClubRole, string> = {
  owner: "Owner",
  manager: "Manager",
  front_desk: "Front desk",
  court_attendant: "Court attendant",
  scorer: "Scorer",
};
const statusLabels: Record<UserStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  unverified: "Email not confirmed",
};

function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap",
        status === "active"
          ? "border-field/60 text-field"
          : status === "suspended"
            ? "border-signal-red/70 text-signal-red"
            : "border-dashed border-signal-amber text-signal-amber",
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

/** "Owner at Mauban Pickleball Courts", or the roles in plain words. */
function describe(r: AdminUserRow) {
  const parts = r.venue_roles.map((v) => `${venueRoleLabels[v.role_key]} at ${v.club_name}`);
  for (const role of r.roles) if (role !== "venue_staff") parts.push(roleLabels[role]);
  return parts.join(", ") || "No role yet";
}

export function UsersPage() {
  const [params, setParams] = useSearchParams();
  const role = (params.get("role") ?? "") as UserRole | "";
  const status = (params.get("status") ?? "") as UserStatus | "";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [search, setSearch] = useState(q);
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
      return p;
    });

  const list = useAdminUsers({ q: search, role, status });
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-expanded sm:text-4xl">Users</h1>
        <p className="mt-1 text-line-dim">
          Every account on CourtFlex: players, venue owners and staff, club admins.
        </p>
      </header>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="relative lg:w-80">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-line-dim"
            aria-hidden
          />
          <Input
            type="search"
            className="pl-9"
            aria-label="Search users"
            placeholder="Name, email or mobile number"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Field label="Role" className="lg:w-56">
          {(p) => (
            <Select {...p} value={role} onChange={(e) => set("role", e.target.value)}>
              <option value="">Everyone</option>
              {(Object.keys(roleLabels) as UserRole[]).map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Segmented
          label="Status"
          value={status}
          onChange={(v) => set("status", v)}
          options={[
            { value: "", label: "All" },
            { value: "active", label: "Active" },
            { value: "suspended", label: "Suspended" },
            { value: "unverified", label: "Unconfirmed" },
          ]}
          className="lg:flex-1"
        />
      </div>
      {list.error ? (
        <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
      ) : (
        <DataTable<AdminUserRow>
          caption="Users"
          rows={list.data}
          loading={list.isPending}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/users/${r.id}`)}
          rowActionLabel={(r) => `Open ${r.name}`}
          empty="No accounts match. Try another name, email or filter."
          columns={[
            {
              key: "name",
              header: "Name",
              cell: (r) => (
                <span>
                  <span className="block font-semibold">{r.name}</span>
                  <span className="block text-sm break-all text-line-dim">{r.email}</span>
                </span>
              ),
            },
            {
              key: "what",
              header: "On CourtFlex as",
              cell: (r) => <span className="text-sm">{describe(r)}</span>,
            },
            { key: "phone", header: "Mobile", hideOnMobile: true, cell: (r) => r.phone ?? "None" },
            { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      )}
    </div>
  );
}

export function UserDetailPage() {
  const { id } = useParams();
  const q = useAdminUser(id);
  const me = useMe();
  const back = (
    <Link
      to="/users"
      className="tap inline-flex w-fit items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Users
    </Link>
  );
  if (q.isPending)
    return (
      <div className="flex flex-col gap-6">
        {back}
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  if (q.error)
    return (
      <div className="flex flex-col gap-6">
        {back}
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      </div>
    );
  const u = q.data;
  const isSelf = me.data?.id === u.id;
  const protectedAccount = u.roles.includes("super_admin");
  return (
    <div className="flex flex-col gap-6">
      {back}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-expanded break-words sm:text-4xl">{u.name}</h1>
          <p className="mt-1 break-all text-line-dim">{u.email}</p>
        </div>
        <StatusBadge status={u.status} />
      </header>

      {u.suspension && (
        <p role="status" className="rounded-2xl border border-signal-red/60 bg-signal-red/10 p-4 text-sm">
          <strong className="font-semibold">Suspended {ago(u.suspension.at)}</strong> by{" "}
          {u.suspension.by.name}. They can't sign in.
          <span className="mt-1 block">Reason: {u.suspension.reason}</span>
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-8">
          <dl className="grid gap-x-6 gap-y-4 rounded-2xl border border-line-faint bg-court-surface p-5 sm:grid-cols-2">
            <Fact label="On CourtFlex as">
              {u.roles.map((r) => roleLabels[r]).join(", ") || "No role yet"}
            </Fact>
            <Fact label="Mobile">{u.phone ?? "None"}</Fact>
            <Fact label="Home city">{u.home_city ?? "Not set"}</Fact>
            <Fact label="Player">
              {u.player
                ? `${u.player.skill[0]!.toUpperCase()}${u.player.skill.slice(1)}${u.player.location ? `, ${u.player.location}` : ""}`
                : "No player profile"}
            </Fact>
            <Fact label="Court bookings">
              {u.bookings.upcoming} upcoming, {u.bookings.total} in all
            </Fact>
          </dl>

          <section aria-labelledby="venues-h">
            <h2 id="venues-h" className="text-lg font-expanded">
              Venues
            </h2>
            {u.venue_roles.length === 0 ? (
              <p className="mt-2 text-sm text-line-dim">Not on any venue's staff.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line-faint border-y border-line-faint">
                {u.venue_roles.map((v) => (
                  <li key={v.club_id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <Link to={`/venues/${v.club_id}`} className="font-semibold hover:text-ball">
                      {v.club_name}
                    </Link>
                    <span className="text-line-dim">{venueRoleLabels[v.role_key]}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="clubs-h">
            <h2 id="clubs-h" className="text-lg font-expanded">
              Clubs
            </h2>
            {u.clubs.length === 0 ? (
              <p className="mt-2 text-sm text-line-dim">Not in any club.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line-faint border-y border-line-faint">
                {u.clubs.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <Link to={`/clubs/${c.id}`} className="font-semibold hover:text-ball">
                      {c.name}
                    </Link>
                    <span className="text-line-dim">
                      {c.role[0]!.toUpperCase() + c.role.slice(1)}, {c.status.replace("_", " ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <AccountActions
            id={u.id}
            name={u.name}
            suspended={u.status === "suspended"}
            locked={
              isSelf
                ? "This is your account."
                : protectedAccount
                  ? "Super Admin accounts can't be suspended."
                  : null
            }
          />
          <History entries={u.history} />
        </aside>
      </div>
    </div>
  );
}

function AccountActions({
  id,
  name,
  suspended,
  locked,
}: {
  id: string;
  name: string;
  suspended: boolean;
  locked: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const status = useUserStatus(id);
  const reset = useSendPasswordReset(id);
  const toast = useToast();
  const reasonError = status.error instanceof ApiError ? status.error.field("reason") : undefined;
  const otherError = status.error && !reasonError ? status.error.message : null;
  const close = () => {
    setOpen(false);
    setReason("");
    status.reset();
  };
  const submit = () =>
    status.mutate(suspended ? { status: "active" } : { status: "suspended", reason: reason.trim() }, {
      onSuccess: () => {
        toast({
          tone: "success",
          message: suspended ? `Reactivated ${name}'s account.` : `Suspended ${name}'s account.`,
        });
        close();
      },
    });

  return (
    <section
      aria-labelledby="account-h"
      className="rounded-2xl border border-line-faint bg-court-surface p-5"
    >
      <h2 id="account-h" className="text-lg font-expanded">
        Account
      </h2>
      <div className="mt-4 flex flex-col items-start gap-3">
        <Button
          loading={reset.isPending}
          disabled={suspended}
          onClick={() =>
            reset.mutate(undefined, {
              onSuccess: () => toast({ tone: "success", message: `Password reset link sent to ${name}.` }),
            })
          }
        >
          <KeyRound className="size-4" aria-hidden />
          Send password reset link
        </Button>
        {reset.data?.mock_reset_url && (
          <p className="text-xs text-line-dim">
            Mock API, instead of the email:{" "}
            <a href={reset.data.mock_reset_url} className="break-all text-line underline underline-offset-4">
              {reset.data.mock_reset_url}
            </a>
          </p>
        )}
        {reset.error && <p className="text-sm text-signal-red">{reset.error.message}</p>}
        {locked ? (
          <p className="text-sm text-line-dim">{locked}</p>
        ) : (
          <Button variant={suspended ? "primary" : "danger"} onClick={() => setOpen(true)}>
            {suspended ? (
              <UserCheck className="size-4" aria-hidden />
            ) : (
              <UserX className="size-4" aria-hidden />
            )}
            {suspended ? "Reactivate account" : "Suspend account"}
          </Button>
        )}
      </div>

      <Sheet
        open={open}
        onClose={close}
        title={suspended ? `Reactivate ${name}'s account?` : `Suspend ${name}'s account?`}
        description={
          suspended
            ? "They can sign in again. Nothing else changes."
            : "They're signed out and can't sign in. Their bookings, payments, venues and clubs are kept. They see your reason when they try to sign in."
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={close}>Cancel</Button>
            <Button variant={suspended ? "primary" : "danger"} loading={status.isPending} onClick={submit}>
              {suspended ? "Reactivate" : "Suspend"}
            </Button>
          </div>
        }
      >
        {!suspended && (
          <Field
            label="Reason"
            hint="At least 10 characters. They see this when they try to sign in."
            error={reasonError}
          >
            {(p) => <Textarea {...p} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
        )}
        {otherError && (
          <p role="alert" className="mt-3 border-l-2 border-signal-red pl-3 text-sm">
            {otherError}
          </p>
        )}
      </Sheet>
    </section>
  );
}
