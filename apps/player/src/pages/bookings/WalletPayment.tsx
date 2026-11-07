import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Hourglass, TimerReset } from "lucide-react";
import type { GuestAccess, PlayerBooking } from "@courtflex/api";
import { ApiError, formatTime, useGuestReceipt, useSendBookingReceipt } from "@courtflex/api";
import { Button, cn, Field, Input, useOnline, useToast } from "@courtflex/ui";
import { ImagePicker, pesos } from "@courtflex/features";
import { TZ } from "./booking-labels";

const label = (m: PlayerBooking["payment_method"]) => (m === "maya" ? "Maya" : "GCash");

/** Minutes and seconds left on the hold, ticking. Refetches the booking when it runs out. */
function useCountdown(until: string | null, refreshKey: unknown[]) {
  const qc = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until]);
  const left = until ? Math.max(0, new Date(until).getTime() - now) : 0;
  useEffect(() => {
    if (until && left === 0) void qc.invalidateQueries({ queryKey: refreshKey });
    // refreshKey is a fresh array each render; its contents only change with the booking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [until, left, qc]);
  const m = Math.floor(left / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return { left, text: `${m}:${String(s).padStart(2, "0")}` };
}

/**
 * Paying for a GCash or Maya booking: send the money to the venue's account,
 * then upload the receipt. Staff check it; the upload alone never confirms the booking.
 */
export function WalletPayment({ booking: b, guest }: { booking: PlayerBooking; guest?: GuestAccess }) {
  const r = b.receipt;
  const waiting = r?.status === "in_review";
  const countdown = useCountdown(
    waiting ? null : b.hold_expires_at,
    guest ? ["guest"] : ["player", "booking", b.id],
  );

  return (
    <section aria-labelledby="wallet-h" className="mt-8 flex flex-col gap-4">
      <div
        role="status"
        className={cn(
          "flex items-start gap-3 rounded-2xl border p-4",
          waiting ? "border-field/50 bg-field/10" : "border-signal-amber/60 bg-signal-amber/10",
        )}
      >
        {waiting ? (
          <Hourglass className="mt-0.5 size-5 shrink-0 text-field" aria-hidden />
        ) : (
          <TimerReset className="mt-0.5 size-5 shrink-0 text-signal-amber" aria-hidden />
        )}
        <div>
          <h2 id="wallet-h" className="font-bold">
            {waiting ? "Receipt sent. The venue is checking it." : `Court held for ${countdown.text} more`}
          </h2>
          <p className="mt-0.5 text-sm text-line-dim">
            {waiting
              ? `Your court stays held while ${b.venue.name} checks the payment. You'll see "Confirmed" here when it's approved.`
              : `Send ${pesos(b.total)} by ${label(b.payment_method)} and upload the receipt before the hold ends at ${formatTime(b.hold_expires_at!, TZ)}, or the court is freed.`}
          </p>
        </div>
      </div>

      {r?.status === "rejected" && (
        <div role="alert" className="rounded-2xl border border-signal-red/60 bg-signal-red/10 p-4 text-sm">
          <p className="font-semibold">The venue turned down your last receipt.</p>
          <p className="mt-0.5">{r.rejection_reason}</p>
          <p className="mt-1 text-line-dim">Send the right receipt below. You have a fresh 30 minutes.</p>
        </div>
      )}

      {waiting ? (
        <div className="flex flex-wrap items-start gap-4 rounded-2xl border border-line-faint bg-court-surface p-4">
          <img
            src={r.image_url}
            alt="Your receipt"
            className="max-h-56 w-auto rounded-xl bg-white object-contain"
          />
          <dl className="text-sm">
            <dt className="text-line-dim">Reference number</dt>
            <dd className="font-semibold font-condensed">{r.reference_number}</dd>
            <dt className="mt-2 text-line-dim">Sent</dt>
            <dd>{formatTime(r.submitted_at, TZ)}</dd>
          </dl>
        </div>
      ) : (
        <>
          <AccountCard booking={b} />
          <ReceiptForm booking={b} guest={guest} />
        </>
      )}
    </section>
  );
}

function AccountCard({ booking: b }: { booking: PlayerBooking }) {
  const [copied, setCopied] = useState(false);
  const a = b.pay_to;
  return (
    <div className="rounded-2xl border border-line-faint bg-court-surface p-5">
      <h3 className="text-lg font-bold">
        1. Send {pesos(b.total)} by {label(b.payment_method)}
      </h3>
      {a ? (
        <div className="mt-4 flex flex-wrap items-center gap-5">
          {a.qr_url && (
            <img
              src={a.qr_url}
              alt={`${label(b.payment_method)} QR code for ${a.account_name}`}
              className="size-40 rounded-xl bg-white object-contain p-2"
            />
          )}
          <dl className="flex flex-col gap-3">
            <div>
              <dt className="text-sm text-line-dim">Account name</dt>
              <dd className="font-semibold">{a.account_name}</dd>
            </div>
            <div>
              <dt className="text-sm text-line-dim">{label(b.payment_method)} number</dt>
              <dd className="flex items-center gap-3">
                <span className="text-2xl font-bold font-condensed tracking-wide">{a.account_number}</span>
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard?.writeText(a.account_number).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    })
                  }
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-faint px-3 text-sm font-semibold hover:border-line-dim"
                >
                  {copied ? (
                    <Check className="size-4 text-ball" aria-hidden />
                  ) : (
                    <Copy className="size-4" aria-hidden />
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-line-dim">Amount</dt>
              <dd className="font-semibold font-condensed">{pesos(b.total)}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="mt-2 text-sm text-signal-amber">
          {b.venue.name} removed this account. Call them at {b.venue.contact_phone} to pay.
        </p>
      )}
    </div>
  );
}

function ReceiptForm({ booking: b, guest }: { booking: PlayerBooking; guest?: GuestAccess }) {
  const asPlayer = useSendBookingReceipt(b.id);
  const asGuest = useGuestReceipt(guest ?? null);
  const send = guest ? asGuest : asPlayer;
  const toast = useToast();
  const online = useOnline();
  const [image, setImage] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [missing, setMissing] = useState<{ image?: boolean; reference?: boolean }>({});
  const err = (f: string) => (send.error instanceof ApiError ? send.error.field(f) : undefined);

  return (
    <form
      noValidate
      aria-labelledby="up-h"
      className="rounded-2xl border border-line-faint bg-court-surface p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const m = { image: !image, reference: !reference.trim() };
        setMissing(m);
        if (m.image || m.reference) return;
        send.mutate(
          { receipt: image!, reference_number: reference.trim() },
          { onSuccess: () => toast({ tone: "success", message: "Receipt sent. The venue will check it." }) },
        );
      }}
    >
      <h3 id="up-h" className="text-lg font-bold">
        2. Upload the receipt
      </h3>
      <p className="mt-1 text-sm text-line-dim">
        A screenshot of the {label(b.payment_method)} confirmation showing the amount and reference number.
      </p>
      <div className="mt-4 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
        <ImagePicker
          label="Receipt screenshot"
          hint="PNG, JPG or WebP, up to 5 MB."
          maxBytes={5_000_000}
          value={image}
          onChange={(x) => {
            setImage(x);
            setMissing((m) => ({ ...m, image: false }));
          }}
          error={missing.image ? "Add the screenshot of your receipt." : err("receipt")}
        />
        <Field
          label="Reference number"
          hint="From the receipt. The venue uses it to find your payment."
          error={missing.reference ? "Enter the reference number." : err("reference_number")}
        >
          {(f) => (
            <Input
              {...f}
              inputMode="numeric"
              className="font-condensed"
              value={reference}
              onChange={(e) => {
                setReference(e.target.value);
                setMissing((m) => ({ ...m, reference: false }));
              }}
            />
          )}
        </Field>
      </div>
      {send.error && !(send.error instanceof ApiError && send.error.status === 422) && (
        <p role="alert" className="mt-4 text-sm text-signal-red">
          {send.error.message}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="mt-5"
        loading={send.isPending}
        disabled={!online}
      >
        Send receipt
      </Button>
    </form>
  );
}
