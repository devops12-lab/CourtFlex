import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Mail, Ticket } from "lucide-react";
import type { GuestAccess } from "@courtflex/api";
import { ApiError, useGuestBooking } from "@courtflex/api";
import { Button, ErrorState, useOnline } from "@courtflex/ui";
import { AuthField, AuthInput, authSubmit } from "../auth/AuthShell";
import { BookingView } from "./BookingPage";

const KEY = "courtflex-guest-access";

/** The guest booking this tab last opened, so a reload keeps it open. */
export function rememberGuest(access: GuestAccess | null) {
  if (access) sessionStorage.setItem(KEY, JSON.stringify(access));
  else sessionStorage.removeItem(KEY);
}
function remembered(): GuestAccess | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "null") as GuestAccess | null;
  } catch {
    return null;
  }
}

/**
 * Find my booking: for people who booked without an account. The booking code
 * and the email it was made with open it: see it, pay, upload a receipt, cancel.
 */
export function FindBookingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const fromBooking = (location.state as { access?: GuestAccess; justBooked?: boolean } | null) ?? null;
  const [access, setAccess] = useState<GuestAccess | null>(() => fromBooking?.access ?? remembered());
  const booking = useGuestBooking(access);

  const forget = () => {
    rememberGuest(null);
    setAccess(null);
    navigate("/find-booking", { replace: true, state: null });
  };

  if (access && booking.data) {
    return (
      <BookingView
        booking={booking.data}
        justBooked={!!fromBooking?.justBooked}
        guest={access}
        onForget={forget}
      />
    );
  }
  if (
    access &&
    booking.error &&
    !(booking.error instanceof ApiError && [404, 422, 429].includes(booking.error.status))
  ) {
    return (
      <div className="mx-auto max-w-xl">
        <ErrorState message={booking.error.message} onRetry={() => booking.refetch()} />
      </div>
    );
  }

  return (
    // The form stays put while it looks, and keeps what was typed if nothing matches.
    <LookupForm
      initial={access}
      looking={!!access && booking.isPending}
      error={access && booking.error ? booking.error.message : null}
      onFind={(a) => {
        rememberGuest(a);
        setAccess(a);
      }}
    />
  );
}

function LookupForm({
  initial,
  looking,
  error,
  onFind,
}: {
  initial: GuestAccess | null;
  looking: boolean;
  error: string | null;
  onFind: (a: GuestAccess) => void;
}) {
  const online = useOnline();
  const [code, setCode] = useState(initial?.booking_code ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [missing, setMissing] = useState<{ code?: boolean; email?: boolean }>({});

  return (
    <div className="mx-auto max-w-[30rem] py-6">
      <main className="rounded-[28px] border border-line-faint bg-court-surface px-6 py-9 shadow-[0_40px_90px_-40px_rgb(0_0_0/0.9)] sm:px-8">
        <div className="text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-ball/15 text-ball">
            <Ticket className="size-6" aria-hidden />
          </span>
          <h1 className="mt-5 text-[1.85rem] leading-tight font-expanded">View Bookings</h1>
          <p className="mt-2 text-line-dim">
            Booked without an account? Enter your booking code and the email you used.
          </p>
        </div>
        <hr className="my-7 border-line-faint" />
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            const m = { code: !code.trim(), email: !email.trim() };
            setMissing(m);
            if (m.code || m.email) return;
            onFind({ booking_code: code.trim().toUpperCase(), email: email.trim().toLowerCase() });
          }}
        >
          <AuthField
            label="Booking code"
            icon={Ticket}
            error={missing.code ? "Enter your booking code." : undefined}
          >
            {(p) => (
              <AuthInput
                {...p}
                autoCapitalize="characters"
                placeholder="CF-4127"
                className="font-condensed uppercase"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            )}
          </AuthField>
          <AuthField
            label="Email address"
            icon={Mail}
            error={missing.email ? "Enter the email you booked with." : undefined}
          >
            {(p) => (
              <AuthInput
                {...p}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </AuthField>
          {error && (
            <p
              role="alert"
              className="rounded-2xl border border-signal-red/50 bg-signal-red/10 px-4 py-3 text-sm"
            >
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className={authSubmit}
            loading={looking}
            disabled={!online}
          >
            Find booking
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-line-dim">
          Have an account?{" "}
          <Link
            to="/login"
            state={{ from: "/bookings" }}
            className="font-semibold text-ball underline-offset-4 hover:underline"
          >
            Sign in to see your bookings
          </Link>
        </p>
      </main>
    </div>
  );
}
