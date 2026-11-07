import { useState } from "react";
import { BookingSheet } from "./BookingSheet";
import { WalkInSheet, type WalkInPreset } from "./WalkInSheet";

/** Shared state for the booking detail and walk-in panels used on several pages. */
export function useBookingSheets() {
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [payNow, setPayNow] = useState(false);
  const [walkIn, setWalkIn] = useState<WalkInPreset | null>(null);

  return {
    openBooking: (id: string, pay = false) => {
      setPayNow(pay);
      setBookingId(id);
    },
    openWalkIn: (preset: WalkInPreset) => setWalkIn(preset),
    sheets: (
      <>
        <BookingSheet bookingId={bookingId} startInPayMode={payNow} onClose={() => setBookingId(null)} />
        <WalkInSheet
          preset={walkIn}
          onClose={() => setWalkIn(null)}
          onCreated={(booking) => {
            setWalkIn(null);
            // Go straight to the new booking so the desk can take payment.
            setPayNow(false);
            setBookingId(booking.id);
          }}
        />
      </>
    ),
  };
}
