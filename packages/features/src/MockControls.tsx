import { useState, useSyncExternalStore } from "react";
import { FlaskConical, X } from "lucide-react";
import { api, isSimulatedOffline, setSimulatedOffline, subscribeSimulatedNetwork } from "@courtflex/api";
import { Button, cn } from "@courtflex/ui";

/** Apps call setMocksEnabled at startup; the panel only renders while the mock API runs. */
let mocksEnabled = true;
export function setMocksEnabled(on: boolean) {
  mocksEnabled = on;
}

function useSimulatedOffline() {
  return useSyncExternalStore(subscribeSimulatedNetwork, isSimulatedOffline, () => false);
}

function Controls() {
  const offline = useSimulatedOffline();
  return (
    <div className="flex flex-col gap-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={offline}
          onChange={(e) => setSimulatedOffline(e.target.checked)}
          className="mt-1 size-4 accent-[var(--color-ball)]"
        />
        <span>
          <span className="block font-semibold">Simulate offline</span>
          <span className="block text-sm text-line-dim">
            Requests fail as if there's no signal. The offline banner shows and bookings and payments are
            disabled.
          </span>
        </span>
      </label>
      <div>
        <Button
          size="sm"
          onClick={() =>
            api("/__mock/approve-communities", { method: "POST" }).then(() => window.location.reload())
          }
        >
          Approve clubs and venues in review
        </Button>
        <p className="mt-1.5 text-sm text-line-dim">
          Shortcut for Super Admin review (also in the admin portal at /admin). New venues start their trial.
          Reloads the page.
        </p>
      </div>
      <div>
        <Button
          size="sm"
          onClick={() => api("/__mock/reset", { method: "POST" }).finally(() => window.location.reload())}
        >
          Reset mock data
        </Button>
        <p className="mt-1.5 text-sm text-line-dim">
          Reloads the page. Everything you changed goes back to the sample data, for the player app and the
          owner portal.
        </p>
      </div>
    </div>
  );
}

/**
 * Developer controls for the mock API. Only rendered while mocks are on,
 * so it never appears against a real backend.
 */
export function MockControls({ inline }: { inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const offline = useSimulatedOffline();
  if (!mocksEnabled) return inline ? <p className="text-line-dim">The mock API is off.</p> : null;
  if (inline) return <Controls />;

  return (
    <div className="fixed right-3 bottom-20 z-40 md:bottom-4">
      {open ? (
        <div className="w-72 border border-line-faint bg-court-raised p-4 shadow-[0_16px_40px_rgba(5,11,20,0.7)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold">Mock API</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close mock controls"
              className="grid size-8 place-items-center rounded-sm text-line-dim hover:text-line"
            >
              <X className="size-4" />
            </button>
          </div>
          <Controls />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open mock API controls"
          title="Mock API controls"
          className={cn(
            "grid size-10 place-items-center rounded-full border bg-court-surface text-line-dim hover:text-line",
            offline ? "border-signal-amber text-signal-amber" : "border-line-faint",
          )}
        >
          <FlaskConical className="size-4" />
        </button>
      )}
    </div>
  );
}
