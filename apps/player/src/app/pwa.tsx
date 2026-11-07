import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@courtflex/ui";

/**
 * The app-shell service worker (blueprint §10.2.6). It caches the app's own files
 * only, never API responses, so availability and bookings are always live.
 *
 * While the mock API runs, its service worker owns the page, so this one is
 * skipped: two workers can't share the same scope.
 */
export function UpdatePrompt() {
  if (import.meta.env.VITE_USE_MOCKS !== "false" || !("serviceWorker" in navigator)) return null;
  return <RegisteredUpdatePrompt />;
}

function RegisteredUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  if (!needRefresh) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-md border border-line bg-court-raised p-4 shadow-[0_16px_40px_rgba(5,11,20,0.7)] md:bottom-6"
    >
      <p className="flex-1 text-sm">A new version of CourtFlex is ready.</p>
      <Button size="sm" variant="primary" onClick={() => updateServiceWorker(true)}>
        Reload
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
        Later
      </Button>
    </div>
  );
}
