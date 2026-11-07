import { useState } from "react";
import { useNavigate } from "react-router";
import { Plus } from "lucide-react";
import type { Court } from "@courtflex/api";
import { formatMoney, useCourts, useCreateCourt, useSubscription } from "@courtflex/api";
import { Button, cn, DataTable, EmptyState, ErrorState, Sheet, useToast } from "@courtflex/ui";
import { useClubContext } from "../../app/club-context";
import { ReadOnlyNote } from "../../shared/FormFeedback";
import { CourtForm, courtStatusLabels } from "./CourtForm";
import { ClosuresSection } from "./ClosuresSection";

export function CourtsPage() {
  const { club, can } = useClubContext();
  const courts = useCourts(club.id);
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const canEdit = can("manageCourts") && !club.read_only;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-expanded font-bold sm:text-3xl">Courts</h1>
          <p className="mt-1 max-w-prose text-line-dim">
            Each court has its own hours and rates. Open a court to change them.
          </p>
        </div>
        {canEdit && (
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            Add court
          </Button>
        )}
      </div>

      <div className="mt-4">
        <ReadOnlyNote />
        <CourtUsage />
      </div>

      <section className="mt-6" aria-label="Courts">
        {courts.error ? (
          <ErrorState message={courts.error.message} onRetry={() => courts.refetch()} />
        ) : (
          <DataTable<Court>
            caption={`Courts at ${club.name}`}
            rows={courts.data}
            loading={courts.isPending}
            rowKey={(c) => c.id}
            onRowClick={(c) => navigate(c.id)}
            rowActionLabel={(c) => `Open ${c.name}`}
            minWidth={360}
            empty={
              <EmptyState
                title="No courts yet"
                body="Add your first court so players can find and book it."
              />
            }
            columns={[
              { key: "name", header: "Court", cell: (c) => c.name },
              {
                key: "type",
                header: "Type",
                cell: (c) => (
                  <span className="capitalize">
                    {c.indoor_outdoor}, {c.surface_type.toLowerCase()}
                  </span>
                ),
                hideOnMobile: true,
              },
              {
                key: "status",
                header: "Status",
                cell: (c) => (
                  <span className={cn(c.status !== "active" && "text-signal-amber")}>
                    {courtStatusLabels[c.status]}
                  </span>
                ),
              },
              {
                key: "rate",
                header: "Base rate",
                numeric: true,
                cell: (c) => `${formatMoney(c.base_price)}/h`,
              },
            ]}
          />
        )}
      </section>

      <ClosuresSection />

      <AddCourtSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

/** Plan usage, for people who can see the plan. Others still get the server's message if they hit the limit. */
function CourtUsage() {
  const { club, can } = useClubContext();
  const sub = useSubscription(club.id, can("manageClubSubscription"));
  const e = sub.data?.entitlements.find((x) => x.feature_key === "courts");
  if (!e || e.usage === undefined || !Number.isFinite(Number(e.limit_value))) return null;
  const full = e.usage >= Number(e.limit_value);
  return (
    <p className={cn("text-sm", full ? "text-signal-amber" : "text-line-dim")}>
      {e.usage} of {e.limit_value} courts on the {sub.data!.plan.name} plan.
      {full ? " Change plan to add more." : ""}
    </p>
  );
}

function AddCourtSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { club } = useClubContext();
  const create = useCreateCourt(club.id);
  const toast = useToast();
  const navigate = useNavigate();

  return (
    <Sheet
      open={open}
      onClose={() => {
        create.reset();
        onClose();
      }}
      title="Add court"
      description="It starts with the same opening hours as your other courts. Adjust them after saving."
    >
      {open && (
        <CourtForm
          submitLabel="Add court"
          pending={create.isPending}
          error={create.error}
          onSubmit={(input) =>
            create.mutate(input, {
              onSuccess: (court) => {
                toast({ tone: "success", message: `${court.name} added.` });
                onClose();
                navigate(court.id);
              },
            })
          }
        />
      )}
    </Sheet>
  );
}
