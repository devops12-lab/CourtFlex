import { LedgerPanel } from "@courtflex/features";
import { useClubContext } from "../../app/club-context";
import { NotFoundPage } from "../clubs/NotFoundPage";

/** Everything received at the venue, in one place. */
export function PaymentsPage() {
  const { club, can } = useClubContext();
  if (!can("viewClubReports"))
    return <NotFoundPage message="Only owners and managers can see the venue's payments." />;
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-expanded font-bold sm:text-3xl">Payments</h1>
      <p className="mt-1 max-w-prose text-line-dim">
        Money recorded at {club.name}: court bookings, open play fees and court fees from community clubs.
        Refunds are shown against the payment they came from.
      </p>
      <div className="mt-8">
        <LedgerPanel
          type="venue"
          id={club.id}
          kinds={["court_booking", "session_fee", "membership_dues", "court_fee"]}
        />
      </div>
    </div>
  );
}
