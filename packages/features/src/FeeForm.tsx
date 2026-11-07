import { useState } from "react";
import type { FeePaymentInput, PaymentMethod } from "@courtflex/api";
import { ApiError, paymentMethodLabels } from "@courtflex/api";
import { Button, cn, Field, Input, useOnline } from "@courtflex/ui";
import { pesos } from "./labels";

const methods = Object.keys(paymentMethodLabels) as PaymentMethod[];

/**
 * Money received on site for a session fee, dues or a court fee.
 * Two steps, like booking payments: enter, then confirm.
 */
export function FeeForm({
  owed,
  payer,
  what,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  owed: number;
  payer: string;
  what: string;
  pending: boolean;
  error: Error | null;
  onSubmit: (input: FeePaymentInput) => void;
  onCancel: () => void;
}) {
  const online = useOnline();
  const [amount, setAmount] = useState(String(owed).replace(/\.0+$/, ""));
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [ref, setRef] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const valid =
    /^\d+(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0 && Number(amount) <= owed && !!method;
  const apiField = (f: string) => (error instanceof ApiError ? error.field(f) : undefined);

  if (step === "confirm" && method) {
    return (
      <div className="flex flex-col gap-4">
        <div className="border-l-2 border-ball pl-4">
          <p className="text-sm text-line-dim">You're recording</p>
          <p className="text-3xl font-bold font-condensed">{pesos(amount)}</p>
          <p className="mt-1">
            {paymentMethodLabels[method]} from {payer} for {what}
            {ref ? `, reference ${ref}` : ""}.
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-signal-red">
            {apiField("amount") ?? error.message}
          </p>
        )}
        <div className="flex gap-3">
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            loading={pending}
            disabled={!online}
            onClick={() =>
              onSubmit({ amount: Number(amount).toFixed(2), method, reference_number: ref || undefined })
            }
          >
            Record payment
          </Button>
          <Button size="lg" onClick={() => setStep("enter")} disabled={pending}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) setStep("confirm");
      }}
    >
      <Field
        label="Amount collected"
        hint={`${pesos(owed)} is owed.`}
        error={
          amount && !(Number(amount) > 0 && Number(amount) <= owed)
            ? `Enter an amount up to ${pesos(owed)}.`
            : undefined
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
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">How did they pay?</legend>
        <div className="grid grid-cols-2 gap-2">
          {methods.map((m) => (
            <label
              key={m}
              className={cn(
                "flex h-11 cursor-pointer items-center rounded-sm border px-3 text-sm font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ball",
                method === m
                  ? "border-line bg-line text-court-deep"
                  : "border-line-faint text-line-dim hover:text-line",
              )}
            >
              <input
                type="radio"
                name="fee-method"
                className="sr-only"
                checked={method === m}
                onChange={() => setMethod(m)}
              />
              {paymentMethodLabels[m]}
            </label>
          ))}
        </div>
      </fieldset>
      {method && method !== "cash" && (
        <Field label="Reference number (optional)">
          {(p) => <Input {...p} autoComplete="off" value={ref} onChange={(e) => setRef(e.target.value)} />}
        </Field>
      )}
      <div className="flex gap-3">
        <Button type="submit" variant="primary" size="lg" className="flex-1" disabled={!valid}>
          Review payment
        </Button>
        <Button size="lg" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
