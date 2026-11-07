import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "./cn";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Side panel on wide screens, bottom sheet on phones. Built on <dialog> so
 * focus trapping, Escape and the backdrop come from the browser.
 */
export function Sheet({ open, onClose, title, description, children, footer }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // Clicking the backdrop closes the sheet. Keyboard users close it with Escape (onCancel).
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={titleId}
      className={cn(
        "m-0 max-w-none bg-court-surface p-0 text-line backdrop:bg-[#050b14]/75",
        "fixed inset-x-0 top-auto bottom-0 max-h-[92dvh] w-full rounded-t-md border-t-2 border-line",
        "sm:inset-y-0 sm:right-0 sm:left-auto sm:h-dvh sm:max-h-dvh sm:w-[30rem] sm:rounded-none sm:border-t-0 sm:border-l-2",
      )}
    >
      {open && (
        <div className="flex h-full max-h-[inherit] flex-col">
          <header className="flex items-start gap-4 border-b court-line px-5 pt-5 pb-4">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-xl leading-tight font-expanded font-bold">
                {title}
              </h2>
              {description && <div className="mt-1 text-sm text-line-dim">{description}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 grid size-10 shrink-0 place-items-center rounded-sm text-line-dim hover:bg-court-raised hover:text-line"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && (
            <footer className="border-t court-line px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}
