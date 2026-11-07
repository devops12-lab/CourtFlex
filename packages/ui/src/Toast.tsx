import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, CircleAlert } from "lucide-react";

interface ToastItem {
  id: number;
  tone: "success" | "error";
  message: string;
}

type Push = (t: Omit<ToastItem, "id">) => void;

const ToastContext = createContext<Push>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const region = useRef<HTMLDivElement>(null);

  const push = useCallback<Push>((t) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { ...t, id }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 5000);
  }, []);

  // Open sheets live in the browser's top layer. Re-showing the toast region as
  // a popover puts it on top of whatever is open right now.
  useEffect(() => {
    const el = region.current;
    if (!el || typeof el.showPopover !== "function") return;
    if (el.matches(":popover-open")) el.hidePopover();
    if (toasts.length > 0) el.showPopover();
  }, [toasts]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        ref={region}
        popover="manual"
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-auto bottom-24 m-0 flex h-auto w-auto flex-col items-center gap-2 overflow-visible border-0 bg-transparent p-0 px-4 md:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-sm border-l-4 bg-court-raised px-4 py-3 text-sm font-medium text-line shadow-[0_10px_40px_rgba(5,11,20,0.7)]"
            style={{
              borderColor: t.tone === "success" ? "var(--color-ball)" : "var(--color-signal-red)",
            }}
          >
            {t.tone === "success" ? (
              <Check className="size-4 shrink-0 text-ball" aria-hidden />
            ) : (
              <CircleAlert className="size-4 shrink-0 text-signal-red" aria-hidden />
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
