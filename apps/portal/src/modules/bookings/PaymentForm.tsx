import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { BookingDetail, PaymentMethod } from "@courtflex/api";
import { ApiError, formatMoney, paymentMethodLabels, useRecordPayment } from "@courtflex/api";
import { Button, cn, Field, Input, useOnline, useToast } from "@courtflex/ui";
import { useClubContext } from "../../app/club-context";

const methods = Object.keys(paymentMethodLabels) as PaymentMethod[];
const needsReference: PaymentMethod[] = ["gcash_at_venue", "maya_at_venue", "card_at_venue"];

function buildSchema(balance: number, allowPartial: boolean) {
  return z.object({
    amount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 400 or 350.50.")
      .refine((v) => Number(v) > 0, "Enter the amount you collected.")
      .refine((v) => Number(v) <= balance, `The balance is only ${formatMoney(balance.toFixed(2))}.`)
      .refine(
        (v) => allowPartial || Number(v) === balance,
        `This venue collects the full ${formatMoney(balance.toFixed(2))} in one payment.`,
      ),
    method: z.enum(methods as [PaymentMethod, ...PaymentMethod[]], { message: "Choose how they paid." }),
    reference_number: z.string().trim().max(60).optional(),
  });
}
type Values = z.infer<ReturnType<typeof buildSchema>>;

/**
 * Staff record money actually received at the venue. Two steps: enter, then
 * confirm, because a recorded payment can only be corrected by an adjustment.
 */
export function PaymentForm({
  booking,
  onDone,
  onCancel,
}: {
  booking: BookingDetail;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { club } = useClubContext();
  const balance = Number(booking.balance_due);
  const record = useRecordPayment(club.id, booking.id);
  const toast = useToast();
  const online = useOnline();
  const [step, setStep] = useState<"enter" | "confirm">("enter");

  const form = useForm<Values>({
    resolver: zodResolver(buildSchema(balance, club.settings.allow_partial_payments)),
    defaultValues: {
      amount: balance.toFixed(2).replace(/\.00$/, ""),
      method: undefined,
      reference_number: "",
    },
  });
  const method = useWatch({ control: form.control, name: "method" });
  const values = form.getValues();
  const who = booking.player?.name ?? booking.guest_name ?? "Guest";

  const submit = () =>
    record.mutate(
      {
        amount: Number(values.amount).toFixed(2),
        method: values.method,
        reference_number: values.reference_number || undefined,
      },
      {
        onSuccess: () => {
          toast({ tone: "success", message: `Payment recorded: ${formatMoney(values.amount)} from ${who}.` });
          onDone();
        },
        onError: (error) => {
          if (error instanceof ApiError) {
            for (const key of ["amount", "method", "reference_number"] as const) {
              const msg = error.field(key);
              if (msg) form.setError(key, { message: msg });
            }
          }
          setStep("enter");
        },
      },
    );

  if (step === "confirm") {
    return (
      <div className="flex flex-col gap-5">
        <div className="border-l-2 border-ball pl-4">
          <p className="text-sm text-line-dim">You're recording</p>
          <p className="text-4xl font-bold font-condensed">{formatMoney(values.amount)}</p>
          <p className="mt-1">
            {paymentMethodLabels[values.method]} from {who}
            {values.reference_number ? `, reference ${values.reference_number}` : ""}.
          </p>
        </div>
        <p className="text-sm text-line-dim">
          Check the money is in hand or the transfer shows on the venue's phone. Mistakes are fixed with an
          adjustment, not by editing this record.
        </p>
        {record.error && !(record.error instanceof ApiError && record.error.status === 422) && (
          <p role="alert" className="text-sm text-signal-red">
            {record.error.message}
          </p>
        )}
        <div className="flex gap-3">
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={submit}
            loading={record.isPending}
            disabled={!online}
          >
            Record payment
          </Button>
          <Button size="lg" onClick={() => setStep("enter")} disabled={record.isPending}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form noValidate className="flex flex-col gap-5" onSubmit={form.handleSubmit(() => setStep("confirm"))}>
      <Field
        label="Amount collected"
        hint={`Balance due is ${formatMoney(booking.balance_due)}.${club.settings.allow_partial_payments ? " Part payments are allowed." : ""}`}
        error={form.formState.errors.amount?.message}
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
              {...form.register("amount")}
            />
          </div>
        )}
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">How did they pay?</legend>
        <div className="grid grid-cols-2 gap-2">
          {methods.map((m) => (
            <label
              key={m}
              className={cn(
                "flex h-12 cursor-pointer items-center rounded-sm border px-3 text-sm font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ball",
                method === m
                  ? "border-line bg-line text-court-deep"
                  : "border-line-faint text-line-dim hover:text-line",
              )}
            >
              <input type="radio" value={m} className="sr-only" {...form.register("method")} />
              {paymentMethodLabels[m]}
            </label>
          ))}
        </div>
        {form.formState.errors.method && (
          <p className="mt-1.5 text-sm text-signal-red">{form.formState.errors.method.message}</p>
        )}
      </fieldset>

      {method && needsReference.includes(method) && (
        <Field
          label="Reference number (optional)"
          hint="From the player's GCash, Maya or card receipt. Helps when reconciling at closing."
          error={form.formState.errors.reference_number?.message}
        >
          {(p) => <Input {...p} autoComplete="off" {...form.register("reference_number")} />}
        </Field>
      )}

      <div className="flex gap-3">
        <Button type="submit" variant="primary" size="lg" className="flex-1">
          Review payment
        </Button>
        <Button size="lg" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
