import { useSyncExternalStore, type ReactNode } from "react";
import { CircleAlert, WifiOff } from "lucide-react";
import { isSimulatedOffline, subscribeSimulatedNetwork } from "@courtflex/api";
import { Button } from "./Button";
import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("cf-shimmer rounded-sm bg-court-raised", className)} />;
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 border-l-2 border-line-faint py-6 pl-5">
      <h3 className="text-lg font-semibold">{title}</h3>
      {body && <p className="max-w-prose text-line-dim">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 border-l-2 border-signal-red py-5 pl-5">
      <p className="flex items-center gap-2 font-medium">
        <CircleAlert className="size-4 shrink-0 text-signal-red" aria-hidden />
        {message}
      </p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  const unsubscribeSim = subscribeSimulatedNetwork(cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
    unsubscribeSim();
  };
}

/** False when the browser is offline or offline is being simulated. */
export function useOnline() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine && !isSimulatedOffline(),
    () => true,
  );
}

/** Shown whenever the browser is offline. Server actions must also be disabled. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="alert"
      className="flex items-center gap-2 bg-signal-amber px-4 py-2 text-sm font-semibold text-[#2a1d00]"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      You're offline. Bookings and payments are paused until you reconnect, and what you see may be out of
      date.
    </div>
  );
}
