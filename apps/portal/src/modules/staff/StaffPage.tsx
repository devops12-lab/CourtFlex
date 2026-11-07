import { useState } from "react";
import { Plus } from "lucide-react";
import type { ClubRole, StaffInviteInput, StaffMember } from "@courtflex/api";
import {
  formatDateShort,
  useInviteStaff,
  useRemoveStaff,
  useStaff,
  useSubscription,
  useUpdateStaffRole,
} from "@courtflex/api";
import { Button, cn, DataTable, ErrorState, Field, Input, Sheet, useOnline, useToast } from "@courtflex/ui";
import { roleLabels, useClubContext } from "../../app/club-context";
import { NotFoundPage } from "../clubs/NotFoundPage";
import { FormError, ReadOnlyNote, fieldError } from "../../shared/FormFeedback";

type AssignableRole = StaffInviteInput["role_key"];

/** What each role can do, in the words staff use. The server enforces the real permissions. */
export const roleDescriptions: Record<ClubRole, string> = {
  owner: "Everything, including the plan, staff and venue settings.",
  manager:
    "Runs the venue day to day: bookings, payments and refunds, courts, hours, rates and open play. Can't change staff or the plan.",
  front_desk: "Books walk-ins, records payments at the counter and cancels bookings.",
  court_attendant: "Sees the schedule and books walk-ins at the courts.",
  scorer: "Sees the schedule. Match scoring arrives with the Live Scorer.",
};

const assignable: AssignableRole[] = ["manager", "front_desk", "court_attendant", "scorer"];

export function StaffPage() {
  const { club, can } = useClubContext();
  const allowed = can("manageClubStaff");
  const staff = useStaff(club.id);
  const [inviting, setInviting] = useState(false);
  const [selected, setSelected] = useState<StaffMember | null>(null);

  if (!allowed) return <NotFoundPage message="Only the venue owner can manage staff." />;
  const editable = (m: StaffMember) => m.role_key !== "owner" && !m.is_you && !club.read_only;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-expanded font-bold sm:text-3xl">Staff</h1>
          <p className="mt-1 max-w-prose text-line-dim">
            Everyone who works at {club.name}. Each person signs in with their own CourtFlex account.
          </p>
        </div>
        {!club.read_only && (
          <Button variant="primary" onClick={() => setInviting(true)}>
            <Plus className="size-4" aria-hidden />
            Invite staff
          </Button>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <ReadOnlyNote />
        <StaffUsage />
      </div>

      <div className="mt-6">
        {staff.error ? (
          <ErrorState message={staff.error.message} onRetry={() => staff.refetch()} />
        ) : (
          <DataTable<StaffMember>
            caption={`Staff at ${club.name}`}
            rows={staff.data}
            loading={staff.isPending}
            rowKey={(m) => m.membership_id}
            onRowClick={setSelected}
            isRowClickable={editable}
            rowActionLabel={(m) => `Manage ${m.user.name}`}
            minWidth={360}
            columns={[
              {
                key: "name",
                header: "Name",
                cell: (m) => (
                  <span>
                    <span className="block">
                      {m.user.name}
                      {m.is_you && <span className="font-normal text-line-dim"> (you)</span>}
                    </span>
                    <span className="block text-xs font-normal text-line-dim">{m.user.email}</span>
                  </span>
                ),
              },
              { key: "role", header: "Role", cell: (m) => roleLabels[m.role_key] },
              {
                key: "status",
                header: "Status",
                cell: (m) =>
                  m.status === "invited" ? (
                    <span className="text-signal-amber">Invite sent</span>
                  ) : (
                    <span>Active</span>
                  ),
              },
              {
                key: "joined",
                header: "Joined",
                hideOnMobile: true,
                cell: (m) => (m.joined_at ? formatDateShort(m.joined_at, club.timezone) : "Not yet"),
              },
            ]}
          />
        )}
      </div>

      <section className="mt-12 border-t-2 border-line pt-6" aria-labelledby="roles-h">
        <h2 id="roles-h" className="text-xl font-expanded font-bold">
          What each role can do
        </h2>
        <dl className="mt-4 border-t court-line">
          {(Object.keys(roleDescriptions) as ClubRole[]).map((r) => (
            <div key={r} className="grid gap-1 border-b court-line py-3 sm:grid-cols-[10rem_1fr] sm:gap-6">
              <dt className="font-semibold">{roleLabels[r]}</dt>
              <dd className="text-line-dim">{roleDescriptions[r]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <InviteSheet open={inviting} onClose={() => setInviting(false)} />
      <MemberSheet member={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function StaffUsage() {
  const { club, can } = useClubContext();
  const sub = useSubscription(club.id, can("manageClubSubscription"));
  const e = sub.data?.entitlements.find((x) => x.feature_key === "staff");
  if (!e || e.usage === undefined || !Number.isFinite(Number(e.limit_value))) return null;
  const full = e.usage >= Number(e.limit_value);
  return (
    <p className={cn("text-sm", full ? "text-signal-amber" : "text-line-dim")}>
      {e.usage} of {e.limit_value} staff accounts on the {sub.data!.plan.name} plan, including invites and
      you.
    </p>
  );
}

function RolePicker({
  value,
  onChange,
  name,
}: {
  value: AssignableRole;
  onChange: (r: AssignableRole) => void;
  name: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">Role</legend>
      <div className="flex flex-col border-y court-line">
        {assignable.map((r) => (
          <label
            key={r}
            className={cn(
              "flex cursor-pointer gap-3 border-b court-line px-2 py-3 last:border-b-0 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ball",
              value === r && "bg-court-raised",
            )}
          >
            <input
              type="radio"
              name={name}
              checked={value === r}
              onChange={() => onChange(r)}
              className="mt-1 size-4 accent-[var(--color-ball)]"
            />
            <span>
              <span className="block font-semibold">{roleLabels[r]}</span>
              <span className="block text-sm text-line-dim">{roleDescriptions[r]}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { club } = useClubContext();
  const invite = useInviteStaff(club.id);
  const toast = useToast();
  const online = useOnline();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<AssignableRole>("front_desk");
  const close = () => {
    invite.reset();
    setEmail("");
    setName("");
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Invite staff"
      description="They get access once they sign in with this email."
    >
      {open && (
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate(
              { email, name, role_key: role },
              {
                onSuccess: (m) => {
                  toast({
                    tone: "success",
                    message: `Invite sent to ${m.user.email} as ${roleLabels[m.role_key].toLowerCase()}.`,
                  });
                  close();
                },
              },
            );
          }}
        >
          <Field label="Email" error={fieldError(invite.error, "email")}>
            {(p) => (
              <Input
                {...p}
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Name"
            hint="Needed if they don't have a CourtFlex account yet."
            error={fieldError(invite.error, "name")}
          >
            {(p) => (
              <Input {...p} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
            )}
          </Field>
          <RolePicker value={role} onChange={setRole} name="invite-role" />
          <FormError error={invite.error} fields={["email", "name", "role_key"]} />
          <div>
            <Button type="submit" variant="primary" size="lg" loading={invite.isPending} disabled={!online}>
              Send invite
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

function MemberSheet({ member, onClose }: { member: StaffMember | null; onClose: () => void }) {
  const { club } = useClubContext();
  const updateRole = useUpdateStaffRole(club.id);
  const remove = useRemoveStaff(club.id);
  const toast = useToast();
  const online = useOnline();
  const [role, setRole] = useState<AssignableRole | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const current = (role ?? member?.role_key) as AssignableRole;
  const close = () => {
    updateRole.reset();
    remove.reset();
    setRole(null);
    setConfirmRemove(false);
    onClose();
  };

  return (
    <Sheet
      open={!!member}
      onClose={close}
      title={member?.user.name ?? ""}
      description={
        member
          ? `${member.user.email}. ${member.status === "invited" ? "Invite sent, not signed in yet." : "Active."}`
          : undefined
      }
    >
      {member && !confirmRemove && (
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            updateRole.mutate(
              { membershipId: member.membership_id, role_key: current },
              {
                onSuccess: (m) => {
                  toast({
                    tone: "success",
                    message: `${m.user.name} is now ${roleLabels[m.role_key].toLowerCase()}.`,
                  });
                  close();
                },
              },
            );
          }}
        >
          <RolePicker value={current} onChange={setRole} name="member-role" />
          <FormError error={updateRole.error} />
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={updateRole.isPending}
              disabled={!online || current === member.role_key}
            >
              Save role
            </Button>
            <Button variant="danger" size="lg" onClick={() => setConfirmRemove(true)}>
              Remove from venue
            </Button>
          </div>
        </form>
      )}
      {member && confirmRemove && (
        <div className="flex flex-col gap-5">
          <p>
            {member.user.name} loses access to {club.name} straight away. Bookings and payments they recorded
            keep their name.
          </p>
          <FormError error={remove.error} />
          <div className="flex flex-wrap gap-3">
            <Button
              variant="danger"
              size="lg"
              loading={remove.isPending}
              disabled={!online}
              onClick={() =>
                remove.mutate(member.membership_id, {
                  onSuccess: () => {
                    toast({ tone: "success", message: `${member.user.name} removed from ${club.name}.` });
                    close();
                  },
                })
              }
            >
              Remove {member.user.name.split(" ")[0]}
            </Button>
            <Button size="lg" onClick={() => setConfirmRemove(false)}>
              Keep them
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
