import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ChevronLeft, MapPin, Phone } from "lucide-react";
import type { GuestAccess, PlayerBooking } from "@courtflex/api";
import {
  ApiError,
  formatMoney,
  formatTime,
  useCancelPlayerBooking,
  useGuestCancel,
  usePlayerBooking,
} from "@courtflex/api";
import {
  BookingStatusBadge,
  Button,
  ErrorState,
  Field,
  PaymentDot,
  Sheet,
  Skeleton,
  Textarea,
  paymentStatusLabels,
  useOnline,
  useToast,
} from "@courtflex/ui";
import { pesos, shortDay } from "@courtflex/features";
import { NotFound } from "../NotFound";
import { BookingTicket } from "./BookingTicket";
import { WalletPayment } from "./WalletPayment";
import { TZ, cancelDeadline, durationLabel } from "./booking-labels";

export function BookingPage() {
  const { bookingId } = useParams();
  const [params] = useSearchParams();
  const booking = usePlayerBooking(bookingId);
  if (booking.isPending) return <Skeleton className="mx-auto h-96 max-w-2xl" />;
  if (booking.error) {
    return booking.error instanceof ApiError && booking.error.status === 404 ? (
      <NotFound message="This booking isn't on your account." />
    ) : (
      <ErrorState message={booking.error.message} onRetry={() => booking.refetch()} />
    );
  }
  return <BookingView booking={booking.data} justBooked={params.get("new") === "1"} />;
}

/** One booking, for its player or (with `guest`) for a guest who opened it with its code and email. */
export function BookingView({
  booking: b,
  justBooked,
  guest,
  onForget,
}: {
  booking: PlayerBooking;
  justBooked: boolean;
  guest?: GuestAccess;
  /** Guests: leave this booking and look up another. */
  onForget?: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const upcoming = b.status === "pending" || b.status === "confirmed";
  const wallet = b.payment_method === "gcash" || b.payment_method === "maya";
  const awaitingPayment = wallet && b.status === "pending";
  const tel = b.venue.contact_phone.replace(/\s/g, "");

  return (
    <div className="mx-auto max-w-2xl">
      {guest ? (
        <button
          type="button"
          onClick={onForget}
          className="tap inline-flex items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Find another booking
        </button>
      ) : (
        <Link
          to="/bookings"
          className="tap inline-flex items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
        >
          <ChevronLeft className="size-4" aria-hidden />
          My bookings
        </Link>
      )}

      <header className="mt-3 mb-6">
        <h1 className="text-3xl font-expanded font-extrabold">
          {justBooked && awaitingPayment
            ? "Court held. Pay to confirm."
            : justBooked && upcoming
              ? "You're booked"
              : `${b.court.name}, ${shortDay(b.starts_at)}`}
        </h1>
        <p className="mt-1 text-line-dim">
          {b.venue.name}, {durationLabel(b.duration_minutes)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <BookingStatusBadge status={b.status} />
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <PaymentDot status={b.payment_status} />
            {paymentStatusLabels[b.payment_status]}
          </span>
        </div>
      </header>

      {awaitingPayment && <WalletPayment booking={b} guest={guest} />}

      <div className={awaitingPayment ? "mt-8" : undefined}>
        <BookingTicket booking={b} />
      </div>
      {justBooked && upcoming && !awaitingPayment && (
        <p className="mt-3 text-sm text-line-dim">
          {guest
            ? `Show this code at the front desk. To open this booking again, use View Bookings with the code and ${guest.email}.`
            : "Show this code at the front desk. It's also in My bookings."}
        </p>
      )}

      {b.status === "cancelled" && b.cancellation && (
        <p className="mt-6 border-l-2 border-line-faint pl-4">
          {b.cancellation.by_player
            ? `You cancelled this on ${shortDay(b.cancellation.cancelled_at)}.`
            : `${b.venue.name} cancelled this on ${shortDay(b.cancellation.cancelled_at)}. Call them if you have questions.`}
        </p>
      )}
      {b.status === "expired" && wallet && (
        <div className="mt-6 border-l-2 border-signal-amber pl-4">
          <p>
            The 30-minute hold ended before a receipt was accepted, so the court was freed. Nothing was
            charged.
          </p>
          <Link
            to={`/venues/${b.venue.slug}/book`}
            className="mt-2 inline-flex font-semibold text-ball underline-offset-4 hover:underline"
          >
            Book again
          </Link>
        </div>
      )}
      {b.status === "no_show" && (
        <p className="mt-6 border-l-2 border-signal-red pl-4">
          The venue marked this booking as a no-show. If that's wrong, call {b.venue.name}.
        </p>
      )}

      <section className="mt-10" aria-labelledby="pay-h">
        <h2 id="pay-h" className="mb-3 text-lg font-semibold">
          {upcoming && !wallet ? "Pay at the venue" : "Payment"}
        </h2>
        <dl className="border-t court-line">
          <Line label="Court fee" value={pesos(b.total)} />
          <Line
            label={wallet ? `Paid by ${b.payment_method === "maya" ? "Maya" : "GCash"}` : "Paid at the venue"}
            value={formatMoney(b.amount_paid)}
          />
          {b.status !== "cancelled" && (
            <Line label="Still to pay" value={formatMoney(b.balance_due)} strong />
          )}
        </dl>
        {wallet && b.receipt?.status === "approved" && (
          <p className="mt-3 text-sm text-field">
            Receipt approved by the venue. Reference {b.receipt.reference_number}.
          </p>
        )}
        {upcoming && !wallet && (
          <>
            <p className="mt-3 max-w-prose">{b.payment_instructions}</p>
            <p className="mt-1 text-sm text-line-dim">Nothing is charged in the app.</p>
          </>
        )}
      </section>

      <section className="mt-10" aria-labelledby="where-h">
        <h2 id="where-h" className="mb-3 text-lg font-semibold">
          Where
        </h2>
        <p className="font-semibold">{b.venue.name}</p>
        <p className="mt-1 flex items-center gap-1.5 text-line-dim">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {b.venue.address}, {b.venue.city}, {b.venue.province}
        </p>
        <p className="mt-1 text-line-dim capitalize">
          {b.court.name}: {b.court.indoor_outdoor}, {b.court.surface_type.toLowerCase()}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={`tel:${tel}`}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-line/70 px-4 text-sm font-semibold hover:bg-court-raised"
          >
            <Phone className="size-4" aria-hidden />
            Call {b.venue.contact_phone}
          </a>
          <Link
            to={`/courts/${b.court.id}`}
            className="inline-flex h-11 items-center rounded-full border border-line/70 px-4 text-sm font-semibold hover:bg-court-raised"
          >
            {upcoming ? "Court page" : "Book this court again"}
          </Link>
        </div>
        {b.notes && <p className="mt-4 text-sm text-line-dim">Your note: {b.notes}</p>}
      </section>

      {upcoming && (
        <section className="mt-10 border-t court-line pt-6" aria-labelledby="cancel-h">
          <h2 id="cancel-h" className="mb-2 text-lg font-semibold">
            Cancelling
          </h2>
          <p className="font-semibold">{cancelDeadline(b.cancel_until, b.starts_at)}</p>
          <p className="mt-1 max-w-prose text-sm text-line-dim">{b.cancellation_policy}</p>
          {b.can_cancel ? (
            <Button variant="danger" className="mt-4" onClick={() => setCancelling(true)}>
              Cancel booking
            </Button>
          ) : (
            b.cancel_blocked_reason && (
              <p className="mt-4 border-l-2 border-signal-amber pl-3 text-sm">{b.cancel_blocked_reason}</p>
            )
          )}
          <CancelSheet booking={b} guest={guest} open={cancelling} onClose={() => setCancelling(false)} />
        </section>
      )}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b court-line py-2.5">
      <dt className={strong ? "font-semibold" : "text-sm text-line-dim"}>{label}</dt>
      <dd className={strong ? "text-xl font-bold font-condensed" : "text-sm font-condensed"}>{value}</dd>
    </div>
  );
}

function CancelSheet({
  booking: b,
  guest,
  open,
  onClose,
}: {
  booking: PlayerBooking;
  guest?: GuestAccess;
  open: boolean;
  onClose: () => void;
}) {
  const asPlayer = useCancelPlayerBooking(b.id);
  const asGuest = useGuestCancel(guest ?? null);
  const cancel = guest ? asGuest : asPlayer;
  const toast = useToast();
  const online = useOnline();
  const [reason, setReason] = useState("");
  const error = cancel.error instanceof ApiError ? cancel.error : null;
  const close = () => {
    cancel.reset();
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Cancel this booking?"
      description={`${b.court.name} at ${b.venue.name}, ${shortDay(b.starts_at)} at ${formatTime(b.starts_at, TZ)}.`}
      footer={
        <div className="flex gap-3">
          <Button
            variant="danger"
            className="flex-1"
            loading={cancel.isPending}
            disabled={!online}
            onClick={() =>
              cancel.mutate(
                { reason: reason.trim() || undefined },
                {
                  onSuccess: () => {
                    toast({ tone: "success", message: "Booking cancelled." });
                    onClose();
                  },
                },
              )
            }
          >
            Cancel booking
          </Button>
          <Button onClick={close}>Keep it</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="font-semibold">{cancelDeadline(b.cancel_until, b.starts_at)}</p>
          <p className="mt-1 text-sm text-line-dim">{b.cancellation_policy}</p>
        </div>
        <Field label="Reason (optional)" hint="The venue sees this." error={error?.field("reason")}>
          {(p) => (
            <Textarea {...p} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
        {error && !error.field("reason") && (
          <p role="alert" className="border-l-2 border-signal-red pl-3 text-sm">
            {error.message}
          </p>
        )}
      </div>
    </Sheet>
  );
}
