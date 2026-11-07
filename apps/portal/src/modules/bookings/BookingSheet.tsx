import { useState } from "react";
import type { BookingDetail, BookingSource, PaymentRecord } from "@courtflex/api";
import {
  ApiError,
  formatDateLong,
  formatMoney,
  formatTime,
  formatTimeRange,
  paymentMethodLabels,
  todayIn,
  useBooking,
  useCancelBooking,
  useCourts,
} from "@courtflex/api";
import {
  BookingStatusBadge,
  Button,
  ErrorState,
  Field,
  PaymentStatusBadge,
  Sheet,
  Skeleton,
  Textarea,
  useOnline,
  useToast,
} from "@courtflex/ui";
import { ReceiptReview } from "./ReceiptReview";
import { useClubContext } from "../../app/club-context";
import { PaymentForm } from "./PaymentForm";
import { AdjustmentForm, heldOn } from "./AdjustmentForm";

const sourceLabels: Record<BookingSource, string> = {
  player_app: "Booked in the player app",
  guest_web: "Guest booking, no account",
  staff_walk_in: "Walk-in at the front desk",
  owner_created: "Added by the owner",
};

type Mode = "view" | "pay" | "cancel" | "adjust";

export function BookingSheet({
  bookingId,
  onClose,
  startInPayMode,
}: {
  bookingId: string | null;
  onClose: () => void;
  startInPayMode?: boolean;
}) {
  const { club, can } = useClubContext();
  const booking = useBooking(club.id, bookingId);
  const online = useOnline();

  // Mode belongs to one booking. Opening a different booking starts fresh.
  const [modeFor, setModeFor] = useState<{ id: string | null; mode: Mode; payment?: PaymentRecord }>({
    id: null,
    mode: "view",
  });
  const mode: Mode = modeFor.id === bookingId ? modeFor.mode : startInPayMode ? "pay" : "view";
  const setMode = (next: Mode, payment?: PaymentRecord) => setModeFor({ id: bookingId, mode: next, payment });
  const canAdjust = can("adjustOnsitePayment") && !club.read_only && online;

  const b = booking.data;
  const who = b ? (b.player?.name ?? b.guest_name ?? "Guest") : "Booking";

  const canPay =
    !!b &&
    can("recordOnsitePayment") &&
    !club.read_only &&
    Number(b.balance_due) > 0 &&
    b.status !== "cancelled" &&
    b.status !== "expired";
  const canCancel =
    !!b && can("cancelBooking") && !club.read_only && (b.status === "pending" || b.status === "confirmed");

  const footer =
    b && mode === "view" && (canPay || canCancel) ? (
      <div className="flex gap-3">
        {canPay && (
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={() => setMode("pay")}
            disabled={!online}
          >
            Record payment
          </Button>
        )}
        {canCancel && (
          <Button
            variant="danger"
            size="lg"
            className={canPay ? undefined : "flex-1"}
            onClick={() => setMode("cancel")}
            disabled={!online}
          >
            Cancel booking
          </Button>
        )}
      </div>
    ) : undefined;

  return (
    <Sheet
      open={!!bookingId}
      onClose={onClose}
      title={
        mode === "pay"
          ? "Record payment"
          : mode === "cancel"
            ? "Cancel booking"
            : mode === "adjust"
              ? "Refund or correct"
              : who
      }
      description={b ? `${b.booking_code}. ${sourceLabels[b.source]}.` : undefined}
      footer={footer}
    >
      {booking.isPending && (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-32" />
        </div>
      )}
      {booking.error && <ErrorState message={booking.error.message} onRetry={() => booking.refetch()} />}
      {b && (
        <>
          {mode === "pay" && (
            <PaymentForm booking={b} onDone={() => setMode("view")} onCancel={() => setMode("view")} />
          )}
          {mode === "cancel" && (
            <CancelForm booking={b} onDone={() => setMode("view")} onBack={() => setMode("view")} />
          )}
          {mode === "adjust" && modeFor.payment && (
            <AdjustmentForm
              booking={b}
              payment={modeFor.payment}
              onDone={() => setMode("view")}
              onCancel={() => setMode("view")}
            />
          )}
          {mode === "view" && (
            <BookingDetails booking={b} onAdjust={canAdjust ? (p) => setMode("adjust", p) : undefined} />
          )}
        </>
      )}
    </Sheet>
  );
}

function BookingDetails({
  booking: b,
  onAdjust,
}: {
  booking: BookingDetail;
  /** Present when the person may refund or correct payments. */
  onAdjust?: (payment: PaymentRecord) => void;
}) {
  const { club } = useClubContext();
  const tz = club.timezone;
  const date = todayIn(tz, new Date(b.starts_at));

  return (
    <div className="flex flex-col">
      <section className="pb-5">
        <p className="text-4xl leading-none font-bold font-condensed">
          {formatTimeRange(b.starts_at, b.ends_at, tz)}
        </p>
        <p className="mt-2 text-line-dim">
          <CourtName courtId={b.court_id} />, {formatDateLong(date, tz)}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <BookingStatusBadge status={b.status} />
          <PaymentStatusBadge status={b.payment_status} />
        </div>
      </section>

      {(b.payment_method === "gcash" || b.payment_method === "maya") && b.status === "pending" && (
        <ReceiptReview booking={b} />
      )}

      <section className="border-t court-line py-5" aria-labelledby="money-h">
        <h3 id="money-h" className="sr-only">
          Payment
        </h3>
        <dl className="flex flex-col gap-2">
          <Row label="Court fee" value={formatMoney(b.total)} numeric />
          <Row label="Collected" value={formatMoney(b.amount_paid)} numeric />
          <div className="mt-1 flex items-baseline justify-between border-t-2 border-line pt-3">
            <dt className="font-semibold">Balance due</dt>
            <dd className="text-2xl font-bold font-condensed">{formatMoney(b.balance_due)}</dd>
          </div>
        </dl>
        {b.payments.length > 0 && (
          <ul className="mt-5 flex flex-col gap-3">
            {b.payments.map((p) => {
              const own = b.adjustments.filter((a) => a.payment_record_id === p.id);
              return (
                <li key={p.id} className="text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{paymentMethodLabels[p.method]}</p>
                      <p className="text-line-dim">
                        {p.received_by.name}, {formatTime(p.received_at, tz)}
                        {p.reference_number ? `. Ref ${p.reference_number}` : ""}
                      </p>
                    </div>
                    <span className="font-semibold font-condensed">{formatMoney(p.amount)}</span>
                  </div>
                  {own.map((a) => (
                    <div
                      key={a.id}
                      className="mt-2 ml-3 flex items-start justify-between gap-3 border-l-2 border-signal-amber pl-3"
                    >
                      <div>
                        <p>
                          {a.adjustment_type === "refund" ? "Refunded" : "Corrected"} by {a.approved_by.name}
                        </p>
                        <p className="text-line-dim">{a.reason}</p>
                      </div>
                      <span className="font-condensed text-signal-amber">−{formatMoney(a.amount)}</span>
                    </div>
                  ))}
                  {onAdjust && heldOn(p, b.adjustments) > 0 && (
                    <button
                      type="button"
                      onClick={() => onAdjust(p)}
                      className="mt-1 text-sm font-semibold text-line-dim underline underline-offset-4 hover:text-line"
                    >
                      Refund or correct
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(b.player || b.guest_name || b.guest_email || b.notes) && (
        <section className="border-t court-line py-5">
          <dl className="flex flex-col gap-3 text-sm">
            {b.player && <Row label="Player" value={b.player.name} />}
            {b.guest_name && <Row label="Guest" value={b.guest_name} />}
            {b.guest_phone && <Row label="Phone" value={b.guest_phone} />}
            {b.guest_email && <Row label="Email" value={b.guest_email} />}
            {b.notes && (
              <div>
                <dt className="text-line-dim">Notes</dt>
                <dd className="mt-1">{b.notes}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      <section className="border-t court-line pt-5" aria-labelledby="history-h">
        <h3 id="history-h" className="text-sm font-semibold">
          History
        </h3>
        <ol className="mt-3 flex flex-col gap-3 border-l court-line pl-4 text-sm">
          {b.status_history.map((h, i) => (
            <li key={i}>
              <p>
                {h.old_status ? `Changed to ${h.new_status.replace("_", "-")}` : "Booked"} by{" "}
                {h.changed_by.name}
                {h.reason ? `: ${h.reason}` : ""}
              </p>
              <p className="text-line-dim">
                {new Date(h.changed_at).toLocaleString("en-PH", {
                  timeZone: tz,
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function CourtName({ courtId }: { courtId: string }) {
  const { club } = useClubContext();
  const courts = useCourts(club.id);
  return <>{courts.data?.find((c) => c.id === courtId)?.name ?? "Court"}</>;
}

function Row({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-line-dim">{label}</dt>
      <dd className={numeric ? "text-right font-condensed" : "text-right"}>{value}</dd>
    </div>
  );
}

function CancelForm({
  booking,
  onDone,
  onBack,
}: {
  booking: BookingDetail;
  onDone: () => void;
  onBack: () => void;
}) {
  const { club } = useClubContext();
  const cancel = useCancelBooking(club.id, booking.id);
  const toast = useToast();
  const [reason, setReason] = useState("");
  const fieldError = cancel.error instanceof ApiError ? cancel.error.field("reason") : undefined;
  const paid = Number(booking.amount_paid) > 0;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        cancel.mutate(
          { reason },
          {
            onSuccess: () => {
              toast({
                tone: "success",
                message: `Booking ${booking.booking_code} cancelled. The court time is free again.`,
              });
              onDone();
            },
          },
        );
      }}
    >
      <p>
        This frees {formatTimeRange(booking.starts_at, booking.ends_at, club.timezone)} on the court for other
        bookings.
        {booking.player ? ` ${booking.player.name} is notified.` : ""}
      </p>
      {paid && (
        <p className="border-l-2 border-signal-amber pl-3 text-sm">
          {formatMoney(booking.amount_paid)} was already collected. It stays on record. If you return it,
          record a refund on the payment after cancelling.
        </p>
      )}
      <Field label="Reason" hint="Saved in the booking history." error={fieldError}>
        {(p) => (
          <Textarea
            {...p}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Player called to cancel"
          />
        )}
      </Field>
      {cancel.error && !fieldError && (
        <p role="alert" className="text-sm text-signal-red">
          {cancel.error.message}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" variant="danger" size="lg" className="flex-1" loading={cancel.isPending}>
          Cancel booking
        </Button>
        <Button size="lg" onClick={onBack} disabled={cancel.isPending}>
          Keep it
        </Button>
      </div>
    </form>
  );
}
