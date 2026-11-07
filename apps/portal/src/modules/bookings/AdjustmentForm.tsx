import { useState } from "react";
import type { BookingDetail, PaymentAdjustment, PaymentRecord } from "@courtflex/api";
import { formatMoney, paymentMethodLabels, useAdjustPayment } from "@courtflex/api";
import { Button, Field, Input, Segmented, Textarea, useOnline, useToast } from "@courtflex/ui";
import { useClubContext } from "../../app/club-context";
import { FormError, fieldError } from "../../shared/FormFeedback";

type Kind = PaymentAdjustment["adjustment_type"];

/** What's left of a payment after earlier refunds and corrections. Display only; the server re-checks. */
export function heldOn(payment: PaymentRecord, adjustments: PaymentAdjustment[]) {
  const adjusted = adjustments
    .filter((a) => a.payment_record_id === payment.id)
    .reduce((s, a) => s + Number(a.amount), 0);
  return Math.max(Number(payment.amount) - adjusted, 0);
}

/**
 * Refunds and corrections are new records against a payment. The original
 * payment is never edited, so the history always adds up (§8.5).
 */
export function AdjustmentForm({
  booking,
  payment,
  onDone,
  onCancel,
}: {
  booking: BookingDetail;
  payment: PaymentRecord;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { club } = useClubContext();
  const adjust = useAdjustPayment(club.id, booking.id);
  const toast = useToast();
  const online = useOnline();
  const held = heldOn(payment, booking.adjustments);
  const [kind, setKind] = useState<Kind>("refund");
  const [amount, setAmount] = useState(held.toFixed(2).replace(/\.00$/, ""));
  const [reason, setReason] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const who = booking.player?.name ?? booking.guest_name ?? "the player";
  const amountOk = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0 && Number(amount) <= held;

  if (step === "confirm") {
    return (
      <div className="flex flex-col gap-5">
        <div className="border-l-2 border-signal-amber pl-4">
          <p className="text-sm text-line-dim">
            {kind === "refund" ? `Refunding ${who}` : "Correcting the record by"}
          </p>
          <p className="text-4xl font-bold font-condensed">{formatMoney(amount)}</p>
          <p className="mt-1">
            From the {paymentMethodLabels[payment.method]} payment of {formatMoney(payment.amount)}. Reason:{" "}
            {reason}
          </p>
        </div>
        <p className="text-sm text-line-dim">
          {kind === "refund"
            ? "Give the money back before recording this. The original payment stays in the history."
            : "Use this when the amount was recorded wrong. The original payment stays in the history."}
        </p>
        <FormError error={adjust.error} />
        <div className="flex gap-3">
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            loading={adjust.isPending}
            disabled={!online}
            onClick={() =>
              adjust.mutate(
                { paymentId: payment.id, amount: Number(amount).toFixed(2), adjustment_type: kind, reason },
                {
                  onSuccess: (a) => {
                    toast({
                      tone: "success",
                      message: `${a.adjustment_type === "refund" ? "Refund" : "Correction"} of ${formatMoney(a.amount)} recorded.`,
                    });
                    onDone();
                  },
                  onError: () => setStep("enter"),
                },
              )
            }
          >
            {kind === "refund" ? "Record refund" : "Record correction"}
          </Button>
          <Button size="lg" onClick={() => setStep("enter")} disabled={adjust.isPending}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (amountOk && reason.trim()) setStep("confirm");
      }}
    >
      <p className="text-line-dim">
        {paymentMethodLabels[payment.method]} payment of {formatMoney(payment.amount)}, received by{" "}
        {payment.received_by.name}.
        {held < Number(payment.amount)
          ? ` ${formatMoney(held.toFixed(2))} of it is left after earlier adjustments.`
          : ""}
      </p>
      <Segmented
        label="What happened"
        value={kind}
        onChange={setKind}
        options={[
          { value: "refund", label: "Money returned" },
          { value: "correction", label: "Recorded wrong" },
        ]}
      />
      <Field
        label="Amount"
        hint={`Up to ${formatMoney(held.toFixed(2))}.`}
        error={
          fieldError(adjust.error, "amount") ??
          (amount && !amountOk
            ? `Enter an amount above zero and up to ${formatMoney(held.toFixed(2))}.`
            : undefined)
        }
      >
        {(p) => (
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-line-dim">
              ₱
            </span>
            <Input
              {...p}
              inputMode="decimal"
              className="pl-7 text-lg font-condensed"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        )}
      </Field>
      <Field label="Reason" hint="Kept in the payment history." error={fieldError(adjust.error, "reason")}>
        {(p) => (
          <Textarea
            {...p}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={kind === "refund" ? "Rained out, refunded in cash" : "Entered ₱400 instead of ₱350"}
          />
        )}
      </Field>
      <div className="flex gap-3">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="flex-1"
          disabled={!amountOk || !reason.trim()}
        >
          Review
        </Button>
        <Button size="lg" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
