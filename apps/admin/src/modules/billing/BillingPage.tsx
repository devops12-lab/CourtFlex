import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Plus, Search } from "lucide-react";
import type {
  AdminInvoiceRow,
  AdminPlan,
  AdminSubscriptionRow,
  InvoicePaymentMethod,
  SubscriptionPlanInput,
} from "@courtflex/api";
import {
  ApiError,
  formatDateShort,
  formatMoney,
  useAdminInvoices,
  useAdminPlans,
  useAdminSubscriptions,
  useChangePlan,
  useExtendTrial,
  useMarkInvoicePaid,
  useSaveSubscriptionPlan,
  useVoidInvoice,
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
  SubscriptionStatusBadge,
  Tabs,
  Textarea,
  useToast,
} from "@courtflex/ui";
import { TZ } from "../../shared/time";

type Tab = "subscriptions" | "invoices" | "plans";

export function BillingPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") ?? "subscriptions") as Tab;
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-expanded sm:text-4xl">Billing</h1>
        <p className="mt-1 text-line-dim">
          What every venue pays CourtFlex: their plan, trial, invoices and payments.
        </p>
      </header>
      <Tabs<Tab>
        label="Billing"
        value={tab}
        onChange={(t) => setParams({ tab: t })}
        items={[
          { value: "subscriptions", label: "Subscriptions" },
          { value: "invoices", label: "Invoices" },
          { value: "plans", label: "Plans" },
        ]}
      >
        {(t) =>
          t === "subscriptions" ? <SubscriptionsTab /> : t === "invoices" ? <InvoicesTab /> : <PlansTab />
        }
      </Tabs>
    </div>
  );
}

/** Search box whose text is kept in the address (?q=), debounced. */
function useSearch() {
  const [params, setParams] = useSearchParams();
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
        return p;
      },
      { replace: true },
    );
  }, [search, current, setParams]);
  const status = params.get("status") ?? "";
  const setStatus = (s: string) =>
    setParams(() => {
      // From the address as it is now, so quick changes in a row don't undo each other.
      const p = new URLSearchParams(window.location.search);
      if (s) p.set("status", s);
      else p.delete("status");
      return p;
    });
  return { q, setQ, search, status, setStatus };
}

function SearchBox({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative lg:w-80">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-line-dim"
        aria-hidden
      />
      <Input
        type="search"
        aria-label={label}
        className="pl-9"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ── Subscriptions ─────────────────────────────────────────

function SubscriptionsTab() {
  const f = useSearch();
  const list = useAdminSubscriptions({ q: f.search, status: f.status });
  const [open, setOpen] = useState<AdminSubscriptionRow | null>(null);
  // Keep the open panel in step with the list after a change.
  // Stay open after a change, even if the change moves it out of a filtered list.
  const current = open && (list.data?.find((s) => s.id === open.id) ?? open);
  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <SearchBox
          label="Search subscriptions"
          placeholder="Venue or owner email"
          value={f.q}
          onChange={f.setQ}
        />
        <Segmented
          label="Status"
          value={f.status}
          onChange={f.setStatus}
          options={[
            { value: "", label: "All" },
            { value: "trialing", label: "Trial" },
            { value: "active", label: "Active" },
            { value: "expired", label: "Expired" },
          ]}
          className="lg:flex-1"
        />
      </div>
      {list.error ? (
        <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
      ) : (
        <DataTable<AdminSubscriptionRow>
          caption="Subscriptions"
          rows={list.data}
          loading={list.isPending}
          rowKey={(r) => r.id}
          onRowClick={setOpen}
          rowActionLabel={(r) => `Manage ${r.club_name}'s subscription`}
          empty="No subscriptions match."
          columns={[
            {
              key: "venue",
              header: "Venue",
              cell: (r) => (
                <span>
                  <span className="block font-semibold">{r.club_name}</span>
                  <span className="block text-sm break-all text-line-dim">
                    {r.owner?.email ?? "No owner"}
                  </span>
                </span>
              ),
            },
            {
              key: "plan",
              header: "Plan",
              cell: (r) => (
                <span>
                  <span className="block">{r.plan.name}</span>
                  <span className="block text-sm text-line-dim">{formatMoney(r.plan.price)} a month</span>
                </span>
              ),
            },
            { key: "status", header: "Status", cell: (r) => <SubscriptionStatusBadge status={r.status} /> },
            {
              key: "when",
              header: "Trial or period",
              hideOnMobile: true,
              cell: (r) => <span className="text-sm">{periodText(r)}</span>,
            },
            {
              key: "due",
              header: "Owed",
              numeric: true,
              cell: (r) => (
                <span className={cn(r.overdue && "text-signal-amber")}>
                  {Number(r.amount_due) > 0 ? formatMoney(r.amount_due) : "Nothing"}
                  {r.overdue && <span className="block text-xs">Overdue</span>}
                </span>
              ),
            },
          ]}
        />
      )}
      <Sheet
        open={!!current}
        onClose={() => setOpen(null)}
        title={current ? `${current.club_name}: subscription` : ""}
      >
        {current && <SubscriptionPanel sub={current} onChanged={setOpen} />}
      </Sheet>
    </div>
  );
}

function periodText(r: AdminSubscriptionRow) {
  if (r.status === "trialing")
    return r.trial_ends_at
      ? `Trial ends ${formatDateShort(r.trial_ends_at, TZ)} (${r.trial_days_left} ${r.trial_days_left === 1 ? "day" : "days"} left)`
      : "Trial starts when the venue is approved";
  if (r.current_period_ends_at)
    return r.status === "active"
      ? `Renews ${formatDateShort(r.current_period_ends_at, TZ)}`
      : `Ended ${formatDateShort(r.current_period_ends_at, TZ)}`;
  return "None";
}

function SubscriptionPanel({
  sub,
  onChanged,
}: {
  sub: AdminSubscriptionRow;
  onChanged: (s: AdminSubscriptionRow) => void;
}) {
  const toast = useToast();
  const plans = useAdminPlans();
  const extend = useExtendTrial(sub.id);
  const change = useChangePlan(sub.id);
  const [days, setDays] = useState("7");
  const [reason, setReason] = useState("");
  const [plan, setPlan] = useState("");
  const [planReason, setPlanReason] = useState("");
  const extendErr = extend.error instanceof ApiError ? extend.error : null;
  const changeErr = change.error instanceof ApiError ? change.error : null;
  const canExtend = sub.status === "trialing" && !!sub.trial_ends_at;
  return (
    <div className="flex flex-col gap-8">
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-line-dim">Plan</dt>
          <dd className="mt-0.5 font-semibold">
            {sub.plan.name}, {formatMoney(sub.plan.price)} a month
          </dd>
        </div>
        <div>
          <dt className="text-line-dim">Status</dt>
          <dd className="mt-0.5">
            <SubscriptionStatusBadge status={sub.status} />
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-line-dim">Trial or period</dt>
          <dd className="mt-0.5">{periodText(sub)}</dd>
        </div>
      </dl>
      <Link
        to={`/venues/${sub.club_id}`}
        className="-mt-4 w-fit text-sm font-semibold text-ball underline underline-offset-4"
      >
        Open the venue
      </Link>

      <form
        noValidate
        className="flex flex-col gap-4 border-t court-line pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          extend.mutate(
            { days: Number(days), reason: reason.trim() },
            {
              onSuccess: (r) => {
                onChanged(r);
                toast({ tone: "success", message: `Extended ${sub.club_name}'s trial by ${days} days.` });
                setReason("");
              },
            },
          );
        }}
      >
        <h3 className="text-lg font-expanded">Extend the trial</h3>
        {canExtend ? (
          <>
            <Field label="Extend by" error={extendErr?.field("days")}>
              {(p) => (
                <Select {...p} value={days} onChange={(e) => setDays(e.target.value)}>
                  {[3, 7, 14, 30].map((d) => (
                    <option key={d} value={d}>
                      {d} days
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label="Reason"
              hint="At least 10 characters. Recorded in the audit log."
              error={extendErr?.field("reason")}
            >
              {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
            </Field>
            {extendErr && !extendErr.field("days") && !extendErr.field("reason") && (
              <p role="alert" className="text-sm text-signal-red">
                {extendErr.message}
              </p>
            )}
            <Button type="submit" variant="primary" className="w-fit" loading={extend.isPending}>
              Extend trial
            </Button>
          </>
        ) : (
          <p className="text-sm text-line-dim">
            {sub.status === "trialing"
              ? "The trial starts when the venue is approved."
              : "Only venues on a trial can have it extended."}
          </p>
        )}
      </form>

      <form
        noValidate
        className="flex flex-col gap-4 border-t court-line pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate(
            { plan_code: plan, reason: planReason.trim() || undefined },
            {
              onSuccess: (r) => {
                onChanged(r);
                toast({ tone: "success", message: `Moved ${sub.club_name} to ${r.plan.name}.` });
                setPlan("");
                setPlanReason("");
              },
            },
          );
        }}
      >
        <h3 className="text-lg font-expanded">Change plan</h3>
        <Field label="New plan" error={changeErr?.field("plan_code")}>
          {(p) => (
            <Select {...p} value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="">Choose a plan</option>
              {plans.data
                ?.filter((x) => x.offered && x.code !== sub.plan.code)
                .map((x) => (
                  <option key={x.code} value={x.code}>
                    {x.name}, {formatMoney(x.price)} a month
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Reason (optional)">
          {(p) => <Input {...p} value={planReason} onChange={(e) => setPlanReason(e.target.value)} />}
        </Field>
        {changeErr && !changeErr.field("plan_code") && (
          <p role="alert" className="text-sm text-signal-red">
            {changeErr.message}
          </p>
        )}
        <p className="text-xs text-line-dim">
          The new plan's limits apply now. Its price applies from the next invoice.
        </p>
        <Button type="submit" className="w-fit" disabled={!plan} loading={change.isPending}>
          Change plan
        </Button>
      </form>
    </div>
  );
}

// ── Invoices ──────────────────────────────────────────────

const invoiceTone: Record<string, string> = {
  paid: "border-field/60 text-field",
  issued: "border-line/60 text-line",
  overdue: "border-dashed border-signal-amber text-signal-amber",
  void: "border-line-faint text-line-dim",
  draft: "border-line-faint text-line-dim",
};
const invoiceLabel: Record<string, string> = {
  paid: "Paid",
  issued: "Unpaid",
  overdue: "Overdue",
  void: "Void",
  draft: "Draft",
};
const methodLabels: Record<InvoicePaymentMethod, string> = {
  gcash: "GCash",
  maya: "Maya",
  bank_transfer: "Bank transfer",
  cash: "Cash",
};

function InvoiceBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold",
        invoiceTone[status],
      )}
    >
      {invoiceLabel[status] ?? status}
    </span>
  );
}

function InvoicesTab() {
  const f = useSearch();
  const list = useAdminInvoices({ q: f.search, status: f.status });
  const [open, setOpen] = useState<AdminInvoiceRow | null>(null);
  const current = open && (list.data?.find((i) => i.id === open.id) ?? open);
  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <SearchBox
          label="Search invoices"
          placeholder="Venue or invoice number"
          value={f.q}
          onChange={f.setQ}
        />
        <Segmented
          label="Status"
          value={f.status}
          onChange={f.setStatus}
          options={[
            { value: "", label: "All" },
            { value: "overdue", label: "Overdue" },
            { value: "issued", label: "Unpaid" },
            { value: "paid", label: "Paid" },
            { value: "void", label: "Void" },
          ]}
          className="lg:flex-1"
        />
      </div>
      {list.error ? (
        <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
      ) : (
        <DataTable<AdminInvoiceRow>
          caption="Invoices"
          rows={list.data}
          loading={list.isPending}
          rowKey={(r) => r.id}
          onRowClick={setOpen}
          rowActionLabel={(r) => `Open ${r.invoice_number}`}
          empty="No invoices match."
          columns={[
            {
              key: "number",
              header: "Invoice",
              cell: (r) => (
                <span>
                  <span className="block font-semibold">{r.invoice_number}</span>
                  <span className="block text-sm text-line-dim">{r.club_name}</span>
                </span>
              ),
            },
            { key: "amount", header: "Amount", numeric: true, cell: (r) => formatMoney(r.amount) },
            {
              key: "dates",
              header: "Due",
              hideOnMobile: true,
              cell: (r) => <span className="text-sm">{formatDateShort(r.due_at, TZ)}</span>,
            },
            {
              key: "status",
              header: "Status",
              cell: (r) => (
                <span className="flex flex-col items-start gap-1">
                  <InvoiceBadge status={r.status} />
                  {r.paid_at && (
                    <span className="text-xs text-line-dim">Paid {formatDateShort(r.paid_at, TZ)}</span>
                  )}
                </span>
              ),
            },
          ]}
        />
      )}
      <Sheet open={!!current} onClose={() => setOpen(null)} title={current ? current.invoice_number : ""}>
        {current && <InvoicePanel inv={current} onChanged={setOpen} />}
      </Sheet>
    </div>
  );
}

function InvoicePanel({ inv, onChanged }: { inv: AdminInvoiceRow; onChanged: (i: AdminInvoiceRow) => void }) {
  const toast = useToast();
  const pay = useMarkInvoicePaid(inv.id);
  const voidIt = useVoidInvoice(inv.id);
  const [method, setMethod] = useState<InvoicePaymentMethod>("gcash");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const payErr = pay.error instanceof ApiError ? pay.error : null;
  const voidErr = voidIt.error instanceof ApiError ? voidIt.error : null;
  const unpaid = inv.status === "issued" || inv.status === "overdue";
  return (
    <div className="flex flex-col gap-8">
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-line-dim">Venue</dt>
          <dd className="mt-0.5 font-semibold">{inv.club_name}</dd>
        </div>
        <div>
          <dt className="text-line-dim">Amount</dt>
          <dd className="mt-0.5 text-lg font-condensed">{formatMoney(inv.amount)}</dd>
        </div>
        <div>
          <dt className="text-line-dim">Issued</dt>
          <dd className="mt-0.5">{formatDateShort(inv.issued_at, TZ)}</dd>
        </div>
        <div>
          <dt className="text-line-dim">Due</dt>
          <dd className="mt-0.5">{formatDateShort(inv.due_at, TZ)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-line-dim">Status</dt>
          <dd className="mt-0.5">
            <InvoiceBadge status={inv.status} />
            {inv.status === "paid" && inv.paid_at && (
              <span className="mt-1 block">
                Paid {formatDateShort(inv.paid_at, TZ)}
                {inv.payment_method &&
                  ` by ${methodLabels[inv.payment_method as InvoicePaymentMethod] ?? inv.payment_method}`}
                {inv.payment_reference && `, reference ${inv.payment_reference}`}
              </span>
            )}
            {inv.status === "void" && inv.void_reason && (
              <span className="mt-1 block">Reason: {inv.void_reason}</span>
            )}
          </dd>
        </div>
      </dl>

      {unpaid && (
        <form
          noValidate
          className="flex flex-col gap-4 border-t court-line pt-6"
          onSubmit={(e) => {
            e.preventDefault();
            pay.mutate(
              { method, reference: reference.trim() || undefined },
              {
                onSuccess: (r) => {
                  onChanged(r);
                  toast({ tone: "success", message: `Recorded payment for ${inv.invoice_number}.` });
                },
              },
            );
          }}
        >
          <h3 className="text-lg font-expanded">Record payment</h3>
          <Segmented<InvoicePaymentMethod>
            label="Paid by"
            value={method}
            onChange={setMethod}
            options={(Object.keys(methodLabels) as InvoicePaymentMethod[]).map((m) => ({
              value: m,
              label: methodLabels[m],
            }))}
          />
          {method !== "cash" && (
            <Field label="Reference number" error={payErr?.field("reference")}>
              {(p) => <Input {...p} value={reference} onChange={(e) => setReference(e.target.value)} />}
            </Field>
          )}
          {payErr && !payErr.field("reference") && !payErr.field("method") && (
            <p role="alert" className="text-sm text-signal-red">
              {payErr.message}
            </p>
          )}
          <Button type="submit" variant="primary" className="w-fit" loading={pay.isPending}>
            Record {formatMoney(inv.amount)} payment
          </Button>
        </form>
      )}

      {unpaid && (
        <form
          noValidate
          className="flex flex-col gap-4 border-t court-line pt-6"
          onSubmit={(e) => {
            e.preventDefault();
            voidIt.mutate(
              { reason: reason.trim() },
              {
                onSuccess: (r) => {
                  onChanged(r);
                  toast({ tone: "success", message: `Voided ${inv.invoice_number}.` });
                },
              },
            );
          }}
        >
          <h3 className="text-lg font-expanded">Void this invoice</h3>
          <p className="-mt-2 text-sm text-line-dim">
            For a bill sent by mistake. It stays on record, marked void.
          </p>
          <Field label="Reason" hint="At least 10 characters." error={voidErr?.field("reason")}>
            {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          {voidErr && !voidErr.field("reason") && (
            <p role="alert" className="text-sm text-signal-red">
              {voidErr.message}
            </p>
          )}
          <Button type="submit" variant="danger" className="w-fit" loading={voidIt.isPending}>
            Void invoice
          </Button>
        </form>
      )}
    </div>
  );
}

// ── Plans ─────────────────────────────────────────────────

const emptyPlan: SubscriptionPlanInput = {
  name: "",
  price: "",
  limits: { courts: 3, staff: 3 },
  features: { open_play: true, tournaments: false, reports: false },
  offered: true,
};

function PlansTab() {
  const plans = useAdminPlans();
  const [editing, setEditing] = useState<AdminPlan | "new" | null>(null);
  if (plans.isPending) return <Skeleton className="mt-6 h-48 rounded-2xl" />;
  if (plans.error) return <ErrorState message={plans.error.message} onRetry={() => plans.refetch()} />;
  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-line-dim">
          Limits apply to venues on the plan right away. A new price applies from each venue's next invoice.
        </p>
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden />
          New plan
        </Button>
      </div>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.data.map((p) => (
          <li
            key={p.code}
            className={cn(
              "flex flex-col rounded-2xl border bg-court-surface p-5",
              p.offered ? "border-line-faint" : "border-dashed border-line-faint opacity-80",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-xl font-expanded">{p.name}</h3>
              {!p.offered && <span className="text-xs font-semibold text-line-dim">Retired</span>}
            </div>
            <p className="mt-1 text-3xl font-condensed tabular-nums">
              {formatMoney(p.price)}
              <span className="text-sm text-line-dim"> a month</span>
            </p>
            <ul className="mt-4 flex flex-col gap-1 text-sm">
              <li>Courts: {p.limits.courts ?? "no limit"}</li>
              <li>Staff accounts: {p.limits.staff ?? "no limit"}</li>
              <li>Open play: {p.features.open_play ? "included" : "not included"}</li>
              <li>Tournaments: {p.features.tournaments ? "included" : "not included"}</li>
              <li>Advanced reports: {p.features.reports ? "included" : "not included"}</li>
            </ul>
            <p className="mt-4 text-sm text-line-dim">
              {p.venues} {p.venues === 1 ? "venue" : "venues"} on this plan
            </p>
            <Button className="mt-4 w-fit" size="sm" onClick={() => setEditing(p)}>
              Edit {p.name}
            </Button>
          </li>
        ))}
      </ul>
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New plan" : editing ? `Edit ${editing.name}` : ""}
      >
        {editing && (
          <PlanForm
            key={editing === "new" ? "new" : editing.code}
            plan={editing === "new" ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

function PlanForm({ plan, onDone }: { plan?: AdminPlan; onDone: () => void }) {
  const save = useSaveSubscriptionPlan(plan?.code);
  const toast = useToast();
  const [v, setV] = useState<SubscriptionPlanInput>(
    plan
      ? {
          name: plan.name,
          price: plan.price,
          limits: { ...plan.limits },
          features: { ...plan.features },
          offered: plan.offered,
        }
      : emptyPlan,
  );
  const err = save.error instanceof ApiError ? save.error : null;
  const limit = (k: "courts" | "staff", label: string) => (
    <Field label={label} hint="Leave empty for no limit." error={err?.field(`limits.${k}`)}>
      {(p) => (
        <Input
          {...p}
          inputMode="numeric"
          value={v.limits[k] ?? ""}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "");
            setV({ ...v, limits: { ...v.limits, [k]: raw === "" ? null : Number(raw) } });
          }}
        />
      )}
    </Field>
  );
  const feature = (k: keyof SubscriptionPlanInput["features"], label: string) => (
    <label className="flex min-h-11 items-center gap-3">
      <input
        type="checkbox"
        className="size-5 accent-[var(--color-ball)]"
        checked={v.features[k]}
        onChange={(e) => setV({ ...v, features: { ...v.features, [k]: e.target.checked } })}
      />
      {label}
    </label>
  );
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(v, {
          onSuccess: (p) => {
            toast({
              tone: "success",
              message: plan ? `Saved the ${p.name} plan.` : `Created the ${p.name} plan.`,
            });
            onDone();
          },
        });
      }}
    >
      <Field label="Name" error={err?.field("name")}>
        {(p) => <Input {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}
      </Field>
      <Field label="Monthly price (₱)" error={err?.field("price")}>
        {(p) => (
          <Input
            {...p}
            inputMode="decimal"
            className="font-condensed"
            value={v.price}
            onChange={(e) => setV({ ...v, price: e.target.value })}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-4">
        {limit("courts", "Courts")}
        {limit("staff", "Staff accounts")}
      </div>
      <fieldset className="flex flex-col">
        <legend className="mb-1 text-sm font-medium">Included</legend>
        {feature("open_play", "Open play sessions")}
        {feature("tournaments", "Tournaments")}
        {feature("reports", "Advanced reports")}
      </fieldset>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          className="size-5 accent-[var(--color-ball)]"
          checked={v.offered}
          onChange={(e) => setV({ ...v, offered: e.target.checked })}
        />
        Offered to venues
      </label>
      {plan && !v.offered && plan.offered && (
        <p className="-mt-3 text-sm text-line-dim">
          Retiring keeps its {plan.venues} venues on it; no one new can choose it.
        </p>
      )}
      {err && !err.field("name") && !err.field("price") && (
        <p role="alert" className="text-sm text-signal-red">
          {err.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={save.isPending}>
          {plan ? "Save plan" : "Create plan"}
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}
