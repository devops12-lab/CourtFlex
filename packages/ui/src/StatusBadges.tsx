import type { BookingStatus, PaymentStatus, SubscriptionStatus } from "@courtflex/api";
import { cn } from "./cn";

// Every status pairs color with a shape or line style so it reads without color.

const bookingStyles: Record<BookingStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "border-dashed border-signal-amber text-signal-amber" },
  confirmed: { label: "Confirmed", className: "border-line/60 text-line" },
  completed: { label: "Completed", className: "border-line-faint text-line-dim" },
  cancelled: { label: "Cancelled", className: "border-line-faint text-line-dim line-through" },
  expired: { label: "Expired", className: "border-line-faint text-line-dim line-through" },
  no_show: { label: "No-show", className: "border-signal-red/70 text-signal-red" },
};

export function BookingStatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  const s = bookingStyles[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold",
        s.className,
        className,
      )}
    >
      {s.label}
    </span>
  );
}

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partially_paid: "Part paid",
  paid: "Paid",
  refunded: "Refunded",
  voided: "Voided",
};

/** A coin: empty when unpaid, half full when part paid, full when paid. */
export function PaymentDot({ status, className }: { status: PaymentStatus; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className={cn("size-3 shrink-0", className)}>
      {status === "paid" && <circle cx="6" cy="6" r="5" fill="var(--color-court-outer-bright)" />}
      {status === "partially_paid" && (
        <>
          <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--color-signal-amber)" strokeWidth="1.5" />
          <path d="M6 1.5 A4.5 4.5 0 0 1 6 10.5 Z" fill="var(--color-signal-amber)" />
        </>
      )}
      {status === "unpaid" && (
        <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--color-line)" strokeWidth="1.5" />
      )}
      {(status === "refunded" || status === "voided") && (
        <>
          <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--color-line-dim)" strokeWidth="1.5" />
          <path d="M2.5 9.5 L9.5 2.5" stroke="var(--color-line-dim)" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

const paymentTone: Record<PaymentStatus, string> = {
  paid: "text-field",
  partially_paid: "text-signal-amber",
  unpaid: "text-line",
  refunded: "text-line-dim",
  voided: "text-line-dim",
};

export function PaymentStatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 text-xs font-semibold",
        paymentTone[status],
        className,
      )}
    >
      <PaymentDot status={status} />
      {paymentStatusLabels[status]}
    </span>
  );
}

const subscriptionLabels: Record<SubscriptionStatus, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment overdue",
  grace_period: "Grace period",
  cancelled: "Cancelled",
  expired: "Expired",
  suspended: "Suspended",
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const tone =
    status === "active"
      ? "border-court-outer-bright text-field"
      : status === "trialing"
        ? "border-line/60 text-line"
        : status === "past_due" || status === "grace_period"
          ? "border-dashed border-signal-amber text-signal-amber"
          : "border-signal-red/70 text-signal-red";
  return (
    <span
      className={cn("inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold", tone)}
    >
      {subscriptionLabels[status]}
    </span>
  );
}
