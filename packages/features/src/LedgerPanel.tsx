import { useState } from "react";
import type { LedgerEntry, LedgerKind, OrganizerType } from "@courtflex/api";
import {
  formatDateShort,
  formatTime,
  paymentMethodLabels,
  shiftDate,
  todayIn,
  useLedger,
  useRevenue,
} from "@courtflex/api";
import { DataTable, EmptyState, ErrorState, Segmented, Select, Skeleton } from "@courtflex/ui";
import { ledgerKindLabels, pesos } from "./labels";

const TZ = "Asia/Manila";
type Range = "today" | "7d" | "30d";

/** Money received on site: one ledger for bookings, session fees, dues and court fees. */
export function LedgerPanel({ type, id, kinds }: { type: OrganizerType; id: string; kinds: LedgerKind[] }) {
  const today = todayIn(TZ);
  const [range, setRange] = useState<Range>("7d");
  const [kind, setKind] = useState<LedgerKind | "">("");
  const from = range === "today" ? today : shiftDate(today, range === "7d" ? -6 : -29);
  const revenue = useRevenue(type, id, { from, to: today });
  const ledger = useLedger(type, id, { from, to: today, kind });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end gap-4">
        <Segmented
          label="Period"
          value={range}
          onChange={setRange}
          options={[
            { value: "today", label: "Today" },
            { value: "7d", label: "7 days" },
            { value: "30d", label: "30 days" },
          ]}
        />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Show
          <Select value={kind} onChange={(e) => setKind(e.target.value as LedgerKind | "")} className="w-56">
            <option value="">Everything</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {ledgerKindLabels[k]}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <section aria-labelledby="rev-h">
        <h2 id="rev-h" className="sr-only">
          Revenue
        </h2>
        {revenue.isPending && <Skeleton className="h-32" />}
        {revenue.error && <ErrorState message={revenue.error.message} onRetry={() => revenue.refetch()} />}
        {revenue.data && (
          <div className="grid gap-8 border-t-2 border-line pt-4 md:grid-cols-[1fr_2fr]">
            <div>
              <p className="text-sm text-line-dim">Received, after refunds</p>
              <p className="text-4xl font-bold font-condensed">
                {pesos(revenue.data.total).replace("Free", "₱0")}
              </p>
              <p className="mt-1 text-sm text-line-dim">
                {Number(revenue.data.refunds) > 0 ? `${pesos(revenue.data.refunds)} refunded` : "No refunds"}
              </p>
            </div>
            {revenue.data.by_kind.length === 0 ? (
              <p className="text-line-dim">Nothing received in this period.</p>
            ) : (
              <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                <Breakdown
                  title="By type"
                  rows={revenue.data.by_kind.map((k) => ({
                    key: k.kind,
                    label: `${ledgerKindLabels[k.kind]} (${k.count})`,
                    amount: k.amount,
                  }))}
                />
                <Breakdown
                  title="By payment method"
                  rows={revenue.data.by_method.map((m) => ({
                    key: m.method,
                    label: paymentMethodLabels[m.method],
                    amount: m.amount,
                  }))}
                />
              </div>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="led-h">
        <h2 id="led-h" className="mb-3 text-lg font-semibold">
          Payments
        </h2>
        {ledger.error ? (
          <ErrorState message={ledger.error.message} onRetry={() => ledger.refetch()} />
        ) : (
          <DataTable<LedgerEntry>
            caption="Payments received"
            rows={ledger.data}
            loading={ledger.isPending}
            rowKey={(e) => e.id}
            minWidth={560}
            empty={
              <EmptyState
                title="No payments in this period"
                body="Payments recorded at the venue show up here."
              />
            }
            columns={[
              {
                key: "when",
                header: "When",
                cell: (e) => (
                  <span className="font-condensed">
                    {formatDateShort(e.received_at, TZ)}, {formatTime(e.received_at, TZ)}
                  </span>
                ),
              },
              {
                key: "what",
                header: "For",
                cell: (e) => (
                  <span>
                    <span className="block">{e.description}</span>
                    <span className="block text-xs text-line-dim">{ledgerKindLabels[e.kind]}</span>
                  </span>
                ),
              },
              { key: "payer", header: "From", cell: (e) => e.payer, hideOnMobile: true },
              {
                key: "method",
                header: "Method",
                cell: (e) => paymentMethodLabels[e.method],
                hideOnMobile: true,
              },
              {
                key: "amount",
                header: "Amount",
                numeric: true,
                cell: (e) => (
                  <span>
                    <span className="block">{pesos(e.amount)}</span>
                    {Number(e.refunded) > 0 && (
                      <span className="block text-xs text-signal-amber">−{pesos(e.refunded)} refunded</span>
                    )}
                  </span>
                ),
              },
            ]}
          />
        )}
      </section>
    </div>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; label: string; amount: string }>;
}) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <dl>
        {rows.map((r) => (
          <div key={r.key} className="flex justify-between gap-4 border-b court-line py-2 text-sm">
            <dt className="text-line-dim">{r.label}</dt>
            <dd className="font-condensed">{pesos(r.amount).replace("Free", "₱0")}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
