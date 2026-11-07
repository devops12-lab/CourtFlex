import { useState } from "react";
import { Plus, Search, X } from "lucide-react";
import type {
  ClubMember,
  JoinApplication,
  MemberPayment,
  MemberStatus,
  MembershipPlan,
  OrganizerType,
  PlanInput,
  PlanPerk,
} from "@courtflex/api";
import {
  ApiError,
  formatDateShort,
  useMember,
  useMemberAction,
  useMembers,
  usePlans,
  useRecordDues,
  useSavePlan,
  type MemberAction,
} from "@courtflex/api";
import {
  Button,
  cn,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  Tabs,
  Textarea,
  useOnline,
  useToast,
} from "@courtflex/ui";
import { FeeForm } from "./FeeForm";
import {
  durationLabel,
  focusLabels,
  genderLabels,
  handLabels,
  joinTimeLabels,
  memberPaymentLabels,
  memberStatusLabels,
  payMethodLabels,
  pesos,
  skillLabels,
} from "./labels";

const TZ = "Asia/Manila";
type Filter = "pending" | "active" | "expired" | "suspended" | "";

const statusTone: Record<MemberStatus, string> = {
  pending: "text-signal-amber",
  active: "text-field",
  expired: "text-line-dim",
  suspended: "text-signal-red",
  rejected: "text-line-dim",
};

const eventLabels: Record<string, string> = {
  requested: "Asked to join",
  approved: "Approved",
  rejected: "Turned down",
  suspended: "Suspended",
  reactivated: "Reactivated",
  renewed: "Renewed",
  expired: "Expired",
  role_changed: "Role changed",
  dues_paid: "Dues paid",
  payment_submitted: "Sent a receipt",
  payment_confirmed: "Payment confirmed",
  payment_rejected: "Receipt turned down",
};

/** Member directory with join requests first, plus each member's history and dues. */
export function MembersPanel({
  type,
  id,
  canChooseAdmins,
  readOnly,
}: {
  type: OrganizerType;
  id: string;
  /** Community owners can make members admins. */
  canChooseAdmins: boolean;
  readOnly: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("");
  const [search, setSearch] = useState("");
  const all = useMembers(type, id, {});
  const list = useMembers(type, id, { status: filter, search });
  const [open, setOpen] = useState<string | null>(null);
  const count = (s: MemberStatus) => all.data?.filter((m) => m.status === s).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-line-dim"
          aria-hidden
        />
        <Input
          aria-label="Search members"
          placeholder="Search members"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <Tabs
        label="Members by status"
        value={filter}
        onChange={setFilter}
        items={[
          { value: "", label: "Everyone", count: all.data?.length },
          { value: "pending", label: "Requests", count: count("pending") },
          { value: "active", label: "Active", count: count("active") },
          { value: "expired", label: "Expired", count: count("expired") },
          { value: "suspended", label: "Suspended", count: count("suspended") },
        ]}
      >
        {() =>
          list.error ? (
            <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
          ) : (
            <DataTable<ClubMember>
              caption="Members"
              rows={list.data}
              loading={list.isPending}
              rowKey={(m) => m.id}
              onRowClick={(m) => setOpen(m.id)}
              rowActionLabel={(m) => `Open ${m.player.name}`}
              minWidth={360}
              empty={
                <EmptyState
                  title={
                    filter === "pending"
                      ? "No requests waiting"
                      : search
                        ? "No member by that name"
                        : "No members here yet"
                  }
                  body={filter === "pending" ? "New join requests show up here for approval." : undefined}
                />
              }
              columns={[
                {
                  key: "name",
                  header: "Member",
                  cell: (m) => (
                    <span>
                      <span className="block">
                        {m.player.name}
                        {m.role !== "member" && (
                          <span className="ml-2 text-xs font-normal text-line-dim capitalize">{m.role}</span>
                        )}
                      </span>
                      <span className="block text-xs font-normal text-line-dim">
                        {skillLabels[m.player.skill_level]}
                        {m.player.home_city ? `, ${m.player.home_city}` : ""}
                      </span>
                    </span>
                  ),
                },
                { key: "plan", header: "Plan", cell: (m) => m.plan?.name ?? "None", hideOnMobile: true },
                {
                  key: "status",
                  header: "Status",
                  cell: (m) => <span className={statusTone[m.status]}>{memberStatusLabels[m.status]}</span>,
                },
                {
                  key: "until",
                  header: "Until",
                  hideOnMobile: true,
                  cell: (m) =>
                    m.expires_at
                      ? formatDateShort(m.expires_at, TZ)
                      : m.status === "active"
                        ? "No expiry"
                        : "",
                },
                {
                  key: "dues",
                  header: "Dues",
                  numeric: true,
                  cell: (m) =>
                    m.payment?.status === "in_review" ? (
                      <span className="font-semibold text-signal-amber">Receipt to check</span>
                    ) : m.dues.status === "not_required" ? (
                      <span className="text-line-dim">None</span>
                    ) : m.dues.status === "paid" ? (
                      <span className="text-field">Paid</span>
                    ) : (
                      `Owes ${pesos(Number(m.dues.amount_due) - Number(m.dues.amount_paid))}`
                    ),
                },
              ]}
            />
          )
        }
      </Tabs>
      <MemberSheet
        type={type}
        id={id}
        memberId={open}
        onClose={() => setOpen(null)}
        canChooseAdmins={canChooseAdmins}
        readOnly={readOnly}
      />
    </div>
  );
}

function MemberSheet({
  type,
  id,
  memberId,
  onClose,
  canChooseAdmins,
  readOnly,
}: {
  type: OrganizerType;
  id: string;
  memberId: string | null;
  onClose: () => void;
  canChooseAdmins: boolean;
  readOnly: boolean;
}) {
  const member = useMember(type, id, memberId);
  const act = useMemberAction(type, id);
  const dues = useRecordDues(type, id);
  const toast = useToast();
  const online = useOnline();
  const [mode, setMode] = useState<"view" | "suspend" | "reject" | "dues" | "reject-payment">("view");
  const [reason, setReason] = useState("");
  const m = member.data;
  const close = () => {
    act.reset();
    dues.reset();
    setMode("view");
    setReason("");
    onClose();
  };
  const run = (action: MemberAction, message: string) =>
    act.mutate(
      { memberId: memberId!, action, reason: reason || undefined },
      {
        onSuccess: () => {
          toast({ tone: "success", message });
          setMode("view");
          setReason("");
        },
      },
    );
  const owed = m ? Number(m.dues.amount_due) - Number(m.dues.amount_paid) : 0;
  // GCash and Maya receipts are checked first; confirming one approves the member.
  const waitingOnReceipt =
    m?.payment?.status === "awaiting_receipt" ||
    m?.payment?.status === "in_review" ||
    m?.payment?.status === "rejected";
  const reasonError = act.error instanceof ApiError ? act.error.field("reason") : undefined;

  return (
    <Sheet
      open={!!memberId}
      onClose={close}
      title={m?.player.name ?? "Member"}
      description={m ? memberStatusLabels[m.status] : undefined}
    >
      {member.isPending && <Skeleton className="h-48" />}
      {member.error && <ErrorState message={member.error.message} onRetry={() => member.refetch()} />}
      {m && mode === "dues" && (
        <FeeForm
          owed={owed}
          payer={m.player.name}
          what={`${m.plan?.name ?? "membership"} dues`}
          pending={dues.isPending}
          error={dues.error}
          onCancel={() => setMode("view")}
          onSubmit={(input) =>
            dues.mutate(
              { memberId: m.id, ...input },
              {
                onSuccess: () => {
                  toast({ tone: "success", message: `Dues recorded for ${m.player.name}.` });
                  setMode("view");
                },
              },
            )
          }
        />
      )}
      {m && mode === "reject-payment" && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run("reject-payment", `Receipt turned down. ${m.player.name} can send another.`);
          }}
        >
          <p>{m.player.name} sees your reason and can send another receipt. Their request stays open.</p>
          <Field label="What's wrong with it (they see this)" error={reasonError}>
            {(p) => (
              <Textarea
                {...p}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="The amount is ₱100, but the plan is ₱200."
              />
            )}
          </Field>
          <div className="flex gap-3">
            <Button
              type="submit"
              variant="danger"
              size="lg"
              className="flex-1"
              loading={act.isPending}
              disabled={!online}
            >
              Turn down receipt
            </Button>
            <Button size="lg" onClick={() => setMode("view")}>
              Back
            </Button>
          </div>
        </form>
      )}
      {m && (mode === "suspend" || mode === "reject") && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              mode,
              mode === "suspend"
                ? `${m.player.name} is suspended.`
                : `Request from ${m.player.name} turned down.`,
            );
          }}
        >
          <p>
            {mode === "suspend"
              ? `${m.player.name} can't register for sessions until reactivated. Their history stays.`
              : `${m.player.name} can ask again later.`}
          </p>
          <Field
            label={mode === "suspend" ? "Reason (the member sees it)" : "Reason (optional)"}
            error={reasonError}
          >
            {(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <div className="flex gap-3">
            <Button
              type="submit"
              variant="danger"
              size="lg"
              className="flex-1"
              loading={act.isPending}
              disabled={!online}
            >
              {mode === "suspend" ? "Suspend" : "Turn down"}
            </Button>
            <Button size="lg" onClick={() => setMode("view")}>
              Back
            </Button>
          </div>
        </form>
      )}
      {m && mode === "view" && (
        <div className="flex flex-col gap-6">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-line-dim">Plan</dt>
              <dd>{m.plan?.name ?? "None"}</dd>
            </div>
            <div>
              <dt className="text-line-dim">Level</dt>
              <dd>{skillLabels[m.player.skill_level]}</dd>
            </div>
            <div>
              <dt className="text-line-dim">Member since</dt>
              <dd>{m.starts_at ? formatDateShort(m.starts_at, TZ) : "Not yet"}</dd>
            </div>
            <div>
              <dt className="text-line-dim">Expires</dt>
              <dd>{m.expires_at ? formatDateShort(m.expires_at, TZ) : "No expiry"}</dd>
            </div>
            <div>
              <dt className="text-line-dim">Sessions played</dt>
              <dd className="font-condensed">{m.sessions_attended}</dd>
            </div>
            <div>
              <dt className="text-line-dim">Dues</dt>
              <dd className="font-condensed">
                {m.dues.status === "not_required"
                  ? "None"
                  : `${pesos(m.dues.amount_paid)} of ${pesos(m.dues.amount_due)} paid`}
              </dd>
            </div>
          </dl>

          {m.payment && <PaymentReview payment={m.payment} name={m.player.name} />}

          {act.error && !reasonError && <p className="text-sm text-signal-red">{act.error.message}</p>}
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              {m.status === "pending" && m.payment?.status === "in_review" && (
                <>
                  <Button
                    variant="primary"
                    loading={act.isPending}
                    disabled={!online}
                    onClick={() =>
                      run("confirm-payment", `Payment confirmed. ${m.player.name} is now a member.`)
                    }
                  >
                    Confirm payment and approve
                  </Button>
                  <Button variant="danger" onClick={() => setMode("reject-payment")}>
                    Turn down receipt
                  </Button>
                </>
              )}
              {m.status === "pending" && (
                <>
                  {!waitingOnReceipt && (
                    <Button
                      variant={m.payment?.status === "pay_in_person" ? "secondary" : "primary"}
                      loading={act.isPending}
                      disabled={!online}
                      onClick={() => run("approve", `${m.player.name} is now a member.`)}
                    >
                      {m.payment?.status === "pay_in_person" && owed > 0 ? "Approve, pay later" : "Approve"}
                    </Button>
                  )}
                  {m.payment?.status === "pay_in_person" && owed > 0 && (
                    <Button variant="primary" onClick={() => setMode("dues")} disabled={!online}>
                      Record payment and approve
                    </Button>
                  )}
                  <Button variant="danger" onClick={() => setMode("reject")}>
                    Turn down request
                  </Button>
                </>
              )}
              {owed > 0 && m.status !== "pending" && m.status !== "rejected" && (
                <Button variant="primary" onClick={() => setMode("dues")} disabled={!online}>
                  Record dues
                </Button>
              )}
              {(m.status === "active" || m.status === "expired") && m.expires_at && (
                <Button
                  onClick={() => run("renew", `${m.player.name}'s membership renewed.`)}
                  disabled={!online}
                >
                  Renew
                </Button>
              )}
              {m.status === "suspended" && (
                <Button
                  onClick={() => run("reactivate", `${m.player.name} is active again.`)}
                  disabled={!online}
                >
                  Reactivate
                </Button>
              )}
              {canChooseAdmins && m.status === "active" && m.role !== "owner" && (
                <Button
                  onClick={() =>
                    run(
                      m.role === "admin" ? "remove-admin" : "make-admin",
                      m.role === "admin"
                        ? `${m.player.name} is no longer an admin.`
                        : `${m.player.name} can now run the club.`,
                    )
                  }
                >
                  {m.role === "admin" ? "Remove admin" : "Make admin"}
                </Button>
              )}
              {(m.status === "active" || m.status === "expired") && m.role !== "owner" && (
                <Button variant="danger" onClick={() => setMode("suspend")}>
                  Suspend
                </Button>
              )}
            </div>
          )}

          {m.application && <ApplicationDetails application={m.application} />}

          <section aria-labelledby="hist-h">
            <h3 id="hist-h" className="text-sm font-semibold">
              History
            </h3>
            <ol className="mt-3 flex flex-col gap-3 border-l court-line pl-4 text-sm">
              {m.history.map((h) => (
                <li key={h.id}>
                  <p>
                    {eventLabels[h.event_type]} by {h.actor.name}
                    {h.reason ? `: ${h.reason}` : ""}
                  </p>
                  <p className="text-line-dim">{formatDateShort(h.occurred_at, TZ)}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </Sheet>
  );
}

// ── Membership plans ──────────────────────────────────────

const durations: Array<{ value: string; label: string }> = [
  { value: "none", label: "No expiry" },
  { value: "30", label: "1 month" },
  { value: "90", label: "3 months" },
  { value: "180", label: "6 months" },
  { value: "365", label: "12 months" },
];

export function PlansEditor({ type, id, readOnly }: { type: OrganizerType; id: string; readOnly: boolean }) {
  const plans = usePlans(type, id);
  const [editing, setEditing] = useState<MembershipPlan | "new" | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-prose text-line-dim">
          What people can join as. Changes apply to new members and renewals; current members keep their
          terms.
        </p>
        {!readOnly && (
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden />
            Add plan
          </Button>
        )}
      </div>
      {plans.isPending && <Skeleton className="h-32" />}
      {plans.error && <ErrorState message={plans.error.message} onRetry={() => plans.refetch()} />}
      {plans.data?.length === 0 && <EmptyState title="No plans yet" body="Add one so players can join." />}
      {plans.data && plans.data.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {plans.data.map((p) => (
            <li
              key={p.id}
              className={cn("rounded-md border border-line-faint p-4", !p.is_active && "opacity-60")}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">{p.name}</h3>
                  <p className="text-sm text-line-dim">{p.description}</p>
                </div>
                <span className="text-xl font-bold font-condensed">{pesos(p.price)}</span>
              </div>
              <p className="mt-3 text-sm">
                {durationLabel(p.duration_days)}
                {p.session_discount_percent > 0 ? `, ${p.session_discount_percent}% off sessions` : ""}
                {!p.is_active ? ". Not offered to new members" : ""}
              </p>
              {!readOnly && (
                <Button size="sm" variant="ghost" className="mt-2 -ml-3" onClick={() => setEditing(p)}>
                  Edit
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <PlanSheet type={type} id={id} plan={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function PlanSheet({
  type,
  id,
  plan,
  onClose,
}: {
  type: OrganizerType;
  id: string;
  plan: MembershipPlan | "new" | null;
  onClose: () => void;
}) {
  const save = useSavePlan(type, id);
  const toast = useToast();
  const existing = plan && plan !== "new" ? plan : null;
  return (
    <Sheet
      open={!!plan}
      onClose={() => (save.reset(), onClose())}
      title={existing ? `Edit ${existing.name}` : "Add plan"}
    >
      {plan && (
        <PlanForm
          key={existing?.id ?? "new"}
          initial={existing}
          pending={save.isPending}
          error={save.error}
          onSubmit={(input) =>
            save.mutate(
              { ...input, planId: existing?.id },
              {
                onSuccess: (p) => {
                  toast({ tone: "success", message: `${p.name} saved.` });
                  onClose();
                },
              },
            )
          }
        />
      )}
    </Sheet>
  );
}

function PlanForm({
  initial,
  pending,
  error,
  onSubmit,
}: {
  initial: MembershipPlan | null;
  pending: boolean;
  error: Error | null;
  onSubmit: (input: PlanInput) => void;
}) {
  const online = useOnline();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(initial ? String(Number(initial.price)) : "");
  const [duration, setDuration] = useState(
    initial ? (initial.duration_days === null ? "none" : String(initial.duration_days)) : "30",
  );
  const [discount, setDiscount] = useState(String(initial?.session_discount_percent ?? 0));
  const [active, setActive] = useState<"yes" | "no">(initial && !initial.is_active ? "no" : "yes");
  const [perks, setPerks] = useState<PlanPerk[]>(initial?.perks ?? []);
  const [recommended, setRecommended] = useState(initial?.recommended ?? false);
  const setPerk = (i: number, next: Partial<PlanPerk>) =>
    setPerks((list) => list.map((x, j) => (j === i ? { ...x, ...next } : x)));
  const err = (f: string) => (error instanceof ApiError ? error.field(f) : undefined);
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name,
          description,
          price: price || "0",
          duration_days: duration === "none" ? null : Number(duration),
          session_discount_percent: Number(discount) || 0,
          perks: perks.filter((x) => x.text.trim()),
          recommended,
          is_active: active === "yes",
        });
      }}
    >
      <Field label="Name" error={err("name")}>
        {(p) => (
          <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Monthly member" />
        )}
      </Field>
      <Field label="What members get">
        {(p) => <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Price" hint="0 for free." error={err("price")}>
          {(p) => (
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-line-dim">
                ₱
              </span>
              <Input
                {...p}
                inputMode="decimal"
                className="pl-7 font-condensed"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          )}
        </Field>
        <Field label="Lasts" error={err("duration_days")}>
          {(p) => (
            <Select {...p} value={duration} onChange={(e) => setDuration(e.target.value)}>
              {durations.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Discount on session fees (%)" error={err("session_discount_percent")}>
        {(p) => (
          <Input
            {...p}
            type="number"
            min={0}
            max={100}
            className="font-condensed sm:w-32"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
        )}
      </Field>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">What's included</legend>
        <p className="-mt-1 text-sm text-line-dim">
          Shown on the plan card when players join. Add things other plans have but this one doesn't, and
          untick them, so players can compare.
        </p>
        {perks.map((perk, i) => (
          <div key={i} className="flex items-center gap-2">
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={perk.included}
                onChange={(e) => setPerk(i, { included: e.target.checked })}
                className="size-4 accent-[var(--color-ball)]"
              />
              <span className="sr-only">Included</span>
            </label>
            <Input
              aria-label={`Perk ${i + 1}`}
              maxLength={60}
              value={perk.text}
              onChange={(e) => setPerk(i, { text: e.target.value })}
              placeholder="Half price on sessions"
              className={cn(!perk.included && "text-line-dim line-through")}
            />
            <button
              type="button"
              onClick={() => setPerks((list) => list.filter((_, j) => j !== i))}
              className="grid size-10 shrink-0 place-items-center rounded-full text-line-dim hover:bg-court-raised hover:text-line"
              aria-label={`Remove perk ${i + 1}`}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
        {err("perks") && <p className="text-sm text-signal-red">{err("perks")}</p>}
        {perks.length < 8 && (
          <div>
            <Button size="sm" onClick={() => setPerks((list) => [...list, { text: "", included: true }])}>
              Add a perk
            </Button>
          </div>
        )}
      </fieldset>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={recommended}
          onChange={(e) => setRecommended(e.target.checked)}
          className="mt-1 size-4 accent-[var(--color-ball)]"
        />
        <span>
          <span className="block font-semibold">Mark as recommended</span>
          <span className="block text-sm text-line-dim">
            Highlights this plan when players join. Only one plan can be recommended.
          </span>
        </span>
      </label>
      <Segmented
        label="Offer to new members"
        value={active}
        onChange={setActive}
        options={[
          { value: "yes", label: "Yes" },
          { value: "no", label: "No, keep for current members" },
        ]}
      />
      {error && !(error instanceof ApiError && error.status === 422) && (
        <p className="text-sm text-signal-red">{error.message}</p>
      )}
      <div>
        <Button type="submit" variant="primary" size="lg" loading={pending} disabled={!online}>
          Save plan
        </Button>
      </div>
    </form>
  );
}

/** The member's GCash or Maya receipt, or how they said they'd pay. */
function PaymentReview({ payment, name }: { payment: MemberPayment; name: string }) {
  return (
    <section aria-labelledby="pay-h" className="rounded-md border border-line-faint p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="pay-h" className="font-semibold">
          Payment: {payMethodLabels[payment.method]}, {pesos(payment.amount)}
        </h3>
        <span
          className={cn(
            "rounded-full border px-3 py-0.5 text-xs font-semibold",
            payment.status === "confirmed"
              ? "border-court-outer-bright text-field"
              : payment.status === "rejected"
                ? "border-signal-red/60 text-signal-red"
                : "border-dashed border-signal-amber text-signal-amber",
          )}
        >
          {memberPaymentLabels[payment.status]}
        </span>
      </div>
      {payment.status === "awaiting_receipt" && (
        <p className="mt-2 text-sm text-line-dim">{name} hasn't sent a receipt yet.</p>
      )}
      {payment.status === "pay_in_person" && (
        <p className="mt-2 text-sm text-line-dim">
          {name} will pay a club admin in person. Record it when they do.
        </p>
      )}
      {payment.rejection_reason && payment.status === "rejected" && (
        <p className="mt-2 text-sm">You turned down their last receipt: {payment.rejection_reason}</p>
      )}
      {payment.receipt_url && (
        <div className="mt-3 flex flex-wrap items-start gap-4">
          <a
            href={payment.receipt_url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-sm border border-line-faint"
          >
            <img
              src={payment.receipt_url}
              alt={`Receipt from ${name}`}
              className="max-h-72 w-auto bg-white object-contain"
            />
          </a>
          <dl className="text-sm">
            <dt className="text-line-dim">Reference number</dt>
            <dd className="font-condensed">{payment.reference_number ?? "Not given"}</dd>
            <dt className="mt-2 text-line-dim">Sent</dt>
            <dd>{payment.submitted_at ? formatDateShort(payment.submitted_at, TZ) : "Not yet"}</dd>
          </dl>
        </div>
      )}
      {payment.status === "in_review" && (
        <p className="mt-3 text-sm text-line-dim">
          Check the amount and reference against your {payMethodLabels[payment.method]} app before you
          confirm. Confirming records the payment and approves {name}.
        </p>
      )}
    </section>
  );
}

/** What they filled in on the join form, with their signature. */
function ApplicationDetails({ application: a }: { application: JoinApplication }) {
  const rows: Array<[string, string]> = [
    ["Full name", a.full_name],
    ["Email", a.email],
    ["Mobile", a.phone],
    ["Date of birth", a.birth_date],
    ["Gender", genderLabels[a.gender]],
    ["Emergency contact", `${a.emergency_contact_name}, ${a.emergency_contact_phone}`],
    ["Level", skillLabels[a.skill_level]],
    ["Plays", handLabels[a.dominant_hand]],
    ["Plays for", focusLabels[a.play_focus]],
    ["Usually plays", a.preferred_times.map((t) => joinTimeLabels[t]).join(", ")],
  ];
  return (
    <details className="group rounded-md border border-line-faint">
      <summary className="cursor-pointer list-none px-4 py-3 font-semibold marker:hidden">
        Join form and signature
        <span className="ml-2 text-sm font-normal text-line-dim">
          Signed {formatDateShort(a.waiver_accepted_at, TZ)}
        </span>
      </summary>
      <div className="border-t court-line px-4 py-4">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-line-dim">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-line-dim">Agreed to the membership agreement and signed:</p>
        {a.signature.kind === "drawn" ? (
          <img
            src={a.signature.image}
            alt={`Signature of ${a.full_name}`}
            className="mt-2 h-20 w-auto rounded-sm border border-line-faint bg-court-deep p-2"
          />
        ) : (
          <p className="mt-2 inline-block border-b border-line-dim px-1 text-2xl italic">
            {a.signature.name}
          </p>
        )}
      </div>
    </details>
  );
}
