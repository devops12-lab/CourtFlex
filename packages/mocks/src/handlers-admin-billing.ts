// Super Admin: plans, every venue's subscription, invoices and revenue (A4, blueprint §9.2).
import { http } from "msw";
import type {
  AdminInvoiceRow,
  AdminPlan,
  AdminRevenue,
  AdminSubscriptionRow,
  InvoicePaymentMethod,
  SubscriptionPlanInput,
} from "@courtflex/api";
import { formatMoney, todayIn } from "@courtflex/api";
import {
  adjustments,
  clubs,
  courtCount,
  memberships,
  payments,
  planByCode,
  setSubscriptionStatus,
  staffCount,
  subscriptionPlans,
  subscriptionRecord,
  trialDaysLeft,
  TZ,
  users,
} from "./db";
import { audit } from "./admin-db";
import { authorizeAdmin } from "./handlers-admin";
import { API, fail, invalid, latency, ok } from "./http-helpers";

const DAY = 86_400_000;
const money = (n: number) => n.toFixed(2);
const UNPAID = new Set(["issued", "overdue"]);
const methodLabels: Record<InvoicePaymentMethod, string> = {
  gcash: "GCash",
  maya: "Maya",
  bank_transfer: "bank transfer",
  cash: "cash",
};

/** Every venue's subscription, made from the sample data if it hasn't been yet. */
const allSubscriptions = () => clubs.map((c) => subscriptionRecord(c.id));

function owner(clubId: string) {
  const m = memberships.find((x) => x.club_id === clubId && x.role_key === "owner");
  const u = users.find((x) => x.id === m?.user_id);
  return u ? { id: u.id, name: u.name, email: u.email } : null;
}

function planView(code: string): AdminPlan {
  const p = planByCode(code);
  return {
    ...p,
    limits: { ...p.limits },
    features: { ...p.features },
    venues: allSubscriptions().filter((s) => s.plan_code === p.code).length,
  };
}

function subRow(clubId: string): AdminSubscriptionRow {
  const s = subscriptionRecord(clubId);
  const club = clubs.find((c) => c.id === clubId)!;
  const plan = planByCode(s.plan_code);
  const unpaid = s.invoices.filter((i) => UNPAID.has(i.status));
  return {
    id: s.id,
    club_id: clubId,
    club_name: club.name,
    owner: owner(clubId),
    plan: { code: plan.code, name: plan.name, price: plan.price },
    status: s.status,
    trial_starts_at: s.trial_starts_at,
    trial_ends_at: s.trial_ends_at,
    trial_days_left: s.status === "trialing" ? trialDaysLeft(s) : null,
    current_period_ends_at: s.current_period_ends_at,
    amount_due: money(unpaid.reduce((a, i) => a + Number(i.amount), 0)),
    overdue: unpaid.some((i) => i.status === "overdue"),
  };
}

function findInvoice(id: string) {
  for (const s of allSubscriptions()) {
    const inv = s.invoices.find((i) => i.id === id);
    if (inv) return { sub: s, inv, club: clubs.find((c) => c.id === s.club_id)! };
  }
  return null;
}

function validatePlan(body: Partial<SubscriptionPlanInput>, exceptCode?: string) {
  const errors: Record<string, string[]> = {};
  const name = body.name?.trim() ?? "";
  if (name.length < 2) errors.name = ["Give the plan a name venues will recognise."];
  else if (
    subscriptionPlans.some((p) => p.code !== exceptCode && p.name.toLowerCase() === name.toLowerCase())
  )
    errors.name = ["Another plan already has this name."];
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0 || price > 100_000)
    errors.price = ["Enter a monthly price from ₱0 to ₱100,000."];
  for (const k of ["courts", "staff"] as const) {
    const v = body.limits?.[k];
    if (v !== null && (!Number.isInteger(v) || v! < 1 || v! > 500))
      errors[`limits.${k}`] = ["Enter 1 to 500, or no limit."];
  }
  return { errors, name, price };
}

/** "price ₱2,490.00 → ₱2,690.00, courts 10 → 12" */
function describeChanges(before: AdminPlan, after: SubscriptionPlanInput) {
  const out: string[] = [];
  if (before.name !== after.name.trim()) out.push(`name ${before.name} → ${after.name.trim()}`);
  if (Number(before.price) !== Number(after.price))
    out.push(`price ${formatMoney(before.price)} → ${formatMoney(Number(after.price).toFixed(2))}`);
  const lim = (n: number | null) => (n === null ? "no limit" : String(n));
  for (const k of ["courts", "staff"] as const)
    if (before.limits[k] !== after.limits[k])
      out.push(`${k} ${lim(before.limits[k])} → ${lim(after.limits[k])}`);
  for (const k of ["open_play", "tournaments", "reports"] as const)
    if (before.features[k] !== after.features[k])
      out.push(`${k.replace("_", " ")} ${after.features[k] ? "added" : "removed"}`);
  if (before.offered !== after.offered) out.push(after.offered ? "offered again" : "retired");
  return out.join(", ");
}

export const adminBillingHandlers = [
  // ── Plans ──────────────────────────────────────────────
  http.get(`${API}/admin/plans`, async () => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    return ok(subscriptionPlans.map((p) => planView(p.code)));
  }),

  http.post(`${API}/admin/plans`, async ({ request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const body = (await request.json()) as SubscriptionPlanInput;
    const { errors, name, price } = validatePlan(body);
    if (Object.keys(errors).length) return invalid(errors);
    let code = `plan-${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`;
    while (subscriptionPlans.some((p) => p.code === code)) code += "-2";
    subscriptionPlans.push({
      code,
      name,
      price: money(price),
      billing_interval: "month",
      limits: { courts: body.limits.courts, staff: body.limits.staff },
      features: { ...body.features },
      offered: body.offered !== false,
    });
    audit(auth.user.id, "plan.created", `Created the ${name} plan, ${formatMoney(money(price))} a month`, {
      type: "plan",
      id: code,
      name,
    });
    return ok(planView(code), 201);
  }),

  http.patch(`${API}/admin/plans/:code`, async ({ params, request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const plan = subscriptionPlans.find((p) => p.code === params.code);
    if (!plan) return fail(404, "This plan doesn't exist.");
    const body = (await request.json()) as SubscriptionPlanInput;
    const { errors, name, price } = validatePlan(body, plan.code);
    if (Object.keys(errors).length) return invalid(errors);
    if (plan.offered && body.offered === false && subscriptionPlans.filter((p) => p.offered).length === 1)
      return fail(409, "Keep at least one plan offered, so new venues have a plan to choose.");
    const before = planView(plan.code);
    const changes = describeChanges(before, body);
    if (!changes) return ok(before);
    Object.assign(plan, {
      name,
      price: money(price),
      limits: { courts: body.limits.courts, staff: body.limits.staff },
      features: { ...body.features },
      offered: body.offered !== false,
    });
    audit(auth.user.id, "plan.updated", `Changed the ${name} plan: ${changes}`, {
      type: "plan",
      id: plan.code,
      name,
    });
    return ok(planView(plan.code));
  }),

  // ── Subscriptions ──────────────────────────────────────
  http.get(`${API}/admin/subscriptions`, async ({ request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const status = url.searchParams.get("status");
    const rank = (r: AdminSubscriptionRow) => (r.overdue ? 0 : r.status === "trialing" ? 1 : 2);
    const rows = clubs
      .map((c) => subRow(c.id))
      .filter((r) => !status || r.status === status)
      .filter((r) => !q || r.club_name.toLowerCase().includes(q) || (r.owner?.email ?? "").includes(q))
      .sort((a, b) => rank(a) - rank(b) || a.club_name.localeCompare(b.club_name));
    return ok(rows);
  }),

  http.get(`${API}/admin/subscriptions/:id`, async ({ params }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const s = allSubscriptions().find((x) => x.id === params.id || x.club_id === params.id);
    if (!s) return fail(404, "This subscription doesn't exist.");
    return ok(subRow(s.club_id));
  }),

  http.post(`${API}/admin/subscriptions/:id/extend-trial`, async ({ params, request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const s = allSubscriptions().find((x) => x.id === params.id);
    if (!s) return fail(404, "This subscription doesn't exist.");
    const club = clubs.find((c) => c.id === s.club_id)!;
    const body = (await request.json()) as { days?: number; reason?: string };
    const reason = body.reason?.trim() ?? "";
    const errors: Record<string, string[]> = {};
    if (!Number.isInteger(body.days) || body.days! < 1 || body.days! > 30)
      errors.days = ["Extend by 1 to 30 days."];
    if (reason.length < 10) errors.reason = ["Say why in a sentence (at least 10 characters)."];
    if (Object.keys(errors).length) return invalid(errors);
    if (s.status !== "trialing")
      return fail(409, `${club.name} isn't on a trial, so there's nothing to extend.`);
    if (!s.trial_ends_at)
      return fail(409, `${club.name}'s trial starts when it's approved. Approve the venue first.`);
    // From the later of now and the current end, so an extension is never lost to a lapsed date.
    const from = Math.max(new Date(s.trial_ends_at).getTime(), Date.now());
    s.trial_ends_at = new Date(from + body.days! * DAY).toISOString();
    audit(
      auth.user.id,
      "subscription.trial_extended",
      `Extended ${club.name}'s trial by ${body.days} ${body.days === 1 ? "day" : "days"}`,
      { type: "venue", id: club.id, name: club.name },
      reason,
    );
    return ok(subRow(club.id));
  }),

  http.post(`${API}/admin/subscriptions/:id/change-plan`, async ({ params, request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const s = allSubscriptions().find((x) => x.id === params.id);
    if (!s) return fail(404, "This subscription doesn't exist.");
    const club = clubs.find((c) => c.id === s.club_id)!;
    const body = (await request.json()) as { plan_code?: string; reason?: string };
    const plan = subscriptionPlans.find((p) => p.code === body.plan_code);
    if (!plan || !plan.offered) return invalid({ plan_code: ["Choose a plan that's offered."] });
    if (plan.code === s.plan_code) return fail(409, `${club.name} is already on ${plan.name}.`);
    const over: string[] = [];
    if (plan.limits.courts !== null && courtCount(club.id) > plan.limits.courts)
      over.push(`${courtCount(club.id)} courts (${plan.name} allows ${plan.limits.courts})`);
    if (plan.limits.staff !== null && staffCount(club.id) > plan.limits.staff)
      over.push(`${staffCount(club.id)} staff accounts (${plan.name} allows ${plan.limits.staff})`);
    if (over.length)
      return fail(409, `${club.name} has ${over.join(" and ")}. Remove some first, or choose a bigger plan.`);
    const from = planByCode(s.plan_code).name;
    s.plan_code = plan.code;
    audit(
      auth.user.id,
      "subscription.plan_changed",
      `Moved ${club.name} from ${from} to ${plan.name}`,
      { type: "venue", id: club.id, name: club.name },
      body.reason?.trim() || null,
    );
    return ok(subRow(club.id));
  }),

  // ── Invoices ───────────────────────────────────────────
  http.get(`${API}/admin/invoices`, async ({ request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const status = url.searchParams.get("status");
    const rank = (s: string) => (s === "overdue" ? 0 : s === "issued" ? 1 : 2);
    const rows: AdminInvoiceRow[] = allSubscriptions()
      .flatMap((s) => {
        const club = clubs.find((c) => c.id === s.club_id)!;
        return s.invoices.map((i) => ({
          ...i,
          club_id: club.id,
          club_name: club.name,
          subscription_id: s.id,
        }));
      })
      .filter((i) => !status || i.status === status)
      .filter(
        (i) => !q || i.club_name.toLowerCase().includes(q) || i.invoice_number.toLowerCase().includes(q),
      )
      .sort((a, b) => rank(a.status) - rank(b.status) || b.issued_at.localeCompare(a.issued_at));
    return ok(rows);
  }),

  http.post(`${API}/admin/invoices/:id/mark-paid`, async ({ params, request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const found = findInvoice(String(params.id));
    if (!found) return fail(404, "This invoice doesn't exist.");
    const { sub, inv, club } = found;
    const body = (await request.json()) as { method?: InvoicePaymentMethod; reference?: string };
    const reference = body.reference?.trim() ?? "";
    if (!body.method || !(body.method in methodLabels))
      return invalid({ method: ["Choose how it was paid."] });
    if (body.method !== "cash" && reference.length < 4)
      return invalid({ reference: ["Enter the reference number from the receipt."] });
    if (!UNPAID.has(inv.status))
      return fail(409, `${inv.invoice_number} is ${inv.status}, so it can't be paid.`);
    inv.status = "paid";
    inv.paid_at = new Date().toISOString();
    inv.payment_method = body.method;
    inv.payment_reference = reference || null;
    let renewed = false;
    // An ended plan starts again once nothing is owed: a new month from today.
    if (
      !sub.invoices.some((i) => UNPAID.has(i.status)) &&
      sub.status !== "active" &&
      sub.status !== "trialing"
    ) {
      sub.current_period_starts_at = new Date().toISOString();
      sub.current_period_ends_at = new Date(Date.now() + 30 * DAY).toISOString();
      setSubscriptionStatus(club.id, "active");
      renewed = true;
    }
    audit(
      auth.user.id,
      "invoice.paid",
      `Recorded ${formatMoney(inv.amount)} ${methodLabels[body.method]} payment for ${inv.invoice_number}${renewed ? `; ${club.name}'s plan is active again` : ""}`,
      { type: "venue", id: club.id, name: club.name },
    );
    return ok({ ...inv, club_id: club.id, club_name: club.name, subscription_id: sub.id });
  }),

  http.post(`${API}/admin/invoices/:id/void`, async ({ params, request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const found = findInvoice(String(params.id));
    if (!found) return fail(404, "This invoice doesn't exist.");
    const { sub, inv, club } = found;
    const reason = ((await request.json()) as { reason?: string }).reason?.trim() ?? "";
    if (reason.length < 10) return invalid({ reason: ["Say why in a sentence (at least 10 characters)."] });
    if (!UNPAID.has(inv.status))
      return fail(409, `${inv.invoice_number} is ${inv.status}, so it can't be voided.`);
    inv.status = "void";
    inv.void_reason = reason;
    audit(
      auth.user.id,
      "invoice.voided",
      `Voided ${inv.invoice_number} (${formatMoney(inv.amount)})`,
      { type: "venue", id: club.id, name: club.name },
      reason,
    );
    return ok({ ...inv, club_id: club.id, club_name: club.name, subscription_id: sub.id });
  }),

  // ── Revenue ────────────────────────────────────────────
  http.get(`${API}/admin/revenue`, async () => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const subs = allSubscriptions();
    const active = subs.filter((s) => s.status === "active");
    const mrr = active.reduce((a, s) => a + Number(planByCode(s.plan_code).price), 0);
    const monthOf = (iso: string) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso)).slice(0, 7);
    const today = todayIn(TZ);
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const [y, m] = today.slice(0, 7).split("-").map(Number);
      const d = new Date(Date.UTC(y!, m! - 1 - i, 1));
      months.push(d.toISOString().slice(0, 7));
    }
    const invoices = subs.flatMap((s) => s.invoices);
    const result: AdminRevenue = {
      mrr: money(mrr),
      arr: money(mrr * 12),
      paying_venues: active.length,
      trialing_venues: subs.filter((s) => s.status === "trialing").length,
      by_plan: subscriptionPlans
        .map((p) => {
          const on = active.filter((s) => s.plan_code === p.code);
          return { code: p.code, name: p.name, venues: on.length, mrr: money(on.length * Number(p.price)) };
        })
        .filter((p) => p.venues > 0),
      by_month: months.map((month) => ({
        month,
        label: new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }).format(
          new Date(`${month}-01T00:00:00Z`),
        ),
        subscriptions_paid: money(
          invoices
            .filter((i) => i.status === "paid" && i.paid_at && monthOf(i.paid_at) === month)
            .reduce((a, i) => a + Number(i.amount), 0),
        ),
        bookings_paid: money(
          payments
            .filter((p) => p.status === "paid" && monthOf(p.received_at) === month)
            .reduce((a, p) => a + Number(p.amount), 0) -
            adjustments
              .filter((x) => monthOf(x.created_at) === month)
              .reduce((a, x) => a + Number(x.amount), 0),
        ),
      })),
      unpaid: money(invoices.filter((i) => UNPAID.has(i.status)).reduce((a, i) => a + Number(i.amount), 0)),
      overdue: money(
        invoices.filter((i) => i.status === "overdue").reduce((a, i) => a + Number(i.amount), 0),
      ),
    };
    return ok(result);
  }),
];
