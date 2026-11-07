import { useEffect, useState } from "react";
import { Hourglass, ImageOff } from "lucide-react";
import type { BookingDetail } from "@courtflex/api";
import { ApiError, formatMoney, formatTime, useReviewReceipt } from "@courtflex/api";
import { Button, Field, Textarea, useOnline, useToast } from "@courtflex/ui";
import { useClubContext } from "../../app/club-context";

const wallet = (m: BookingDetail["payment_method"]) => (m === "maya" ? "Maya" : "GCash");

/**
 * A GCash or Maya booking waiting for payment. Staff check the receipt against
 * the venue's wallet, then approve it (which records the payment), turn it down
 * with a reason, or switch the booking to paying at the court.
 */
export function ReceiptReview({ booking: b }: { booking: BookingDetail }) {
  const { club, can } = useClubContext();
  const review = useReviewReceipt(club.id, b.id);
  const toast = useToast();
  const online = useOnline();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const r = b.receipt;
  const tz = club.timezone;
  const canAct = can("recordOnsitePayment") && !club.read_only && online;
  const left = useMinutesLeft(b.hold_expires_at);
  const reasonError = review.error instanceof ApiError ? review.error.field("reason") : undefined;

  // Approving or switching confirms the booking, which removes this panel. A promise still
  // resolves after that, so the message shows either way (per-call callbacks would be dropped).
  const run = (input: Parameters<typeof review.mutate>[0], message: string) =>
    review
      .mutateAsync(input)
      .then(() => {
        toast({ tone: "success", message });
        setRejecting(false);
        setReason("");
      })
      .catch(() => {
        // The error shows in the panel from review.error.
      });

  return (
    <section aria-labelledby="receipt-h" className="border-t court-line py-5">
      <h3 id="receipt-h" className="font-semibold">
        {wallet(b.payment_method)} payment
      </h3>
      {!r || r.status === "rejected" ? (
        <p className="mt-2 flex items-start gap-2 text-sm">
          <Hourglass className="mt-0.5 size-4 shrink-0 text-signal-amber" aria-hidden />
          <span>
            {r?.status === "rejected"
              ? `You turned down the last receipt: ${r.rejection_reason}. `
              : "No receipt yet. "}
            The court is held{left !== null ? ` for ${left} more ${left === 1 ? "minute" : "minutes"}` : ""},
            then it's freed if no receipt arrives.
          </span>
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-start gap-4">
          {r.image_url ? (
            <a
              href={r.image_url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-xl border border-line-faint"
            >
              <img
                src={r.image_url}
                alt={`Receipt for ${b.booking_code}`}
                className="max-h-72 w-auto bg-white object-contain"
              />
            </a>
          ) : (
            <ImageOff className="size-8 text-line-dim" aria-hidden />
          )}
          <dl className="text-sm">
            <dt className="text-line-dim">Reference number</dt>
            <dd className="text-lg font-bold font-condensed">{r.reference_number}</dd>
            <dt className="mt-2 text-line-dim">Amount to check</dt>
            <dd className="font-semibold font-condensed">{formatMoney(b.balance_due)}</dd>
            <dt className="mt-2 text-line-dim">Sent</dt>
            <dd>{formatTime(r.submitted_at, tz)}</dd>
          </dl>
        </div>
      )}
      {r?.status === "in_review" && (
        <p className="mt-3 text-sm text-line-dim">
          Find this reference in your {wallet(b.payment_method)} app and check the amount before you approve.
          Approving records the payment and confirms the booking.
        </p>
      )}

      {review.error && !reasonError && <p className="mt-3 text-sm text-signal-red">{review.error.message}</p>}

      {canAct && rejecting && (
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run({ action: "reject", reason }, "Receipt turned down. The player can send another.");
          }}
        >
          <Field label="What's wrong with it (the player sees this)" error={reasonError}>
            {(p) => (
              <Textarea
                {...p}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="The amount is ₱300, but the booking is ₱400."
              />
            )}
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="danger" loading={review.isPending}>
              Turn down receipt
            </Button>
            <Button onClick={() => setRejecting(false)}>Back</Button>
          </div>
        </form>
      )}

      {canAct && !rejecting && (
        <div className="mt-4 flex flex-wrap gap-2">
          {r?.status === "in_review" && (
            <>
              <Button
                variant="primary"
                loading={review.isPending}
                onClick={() =>
                  run({ action: "approve" }, `Payment approved. ${b.booking_code} is confirmed and paid.`)
                }
              >
                Approve payment
              </Button>
              <Button variant="danger" onClick={() => setRejecting(true)}>
                Turn down
              </Button>
            </>
          )}
          <Button
            onClick={() =>
              run({ action: "pay-at-court" }, `${b.booking_code} switched to paying at the court.`)
            }
            disabled={review.isPending}
          >
            Switch to pay at court
          </Button>
        </div>
      )}
    </section>
  );
}

function useMinutesLeft(until: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [until]);
  if (!until) return null;
  return Math.max(0, Math.ceil((new Date(until).getTime() - now) / 60_000));
}
