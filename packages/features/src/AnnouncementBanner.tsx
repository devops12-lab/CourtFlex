import { useState } from "react";
import { Info, TriangleAlert, X } from "lucide-react";
import { useAnnouncements } from "@courtflex/api";
import { cn } from "@courtflex/ui";

const KEY = "courtflex-dismissed-announcements";

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/**
 * Super Admin announcements for this app, as a strip under the header.
 * Each one can be dismissed; that's remembered on this device.
 */
export function AnnouncementBanner({ audience }: { audience: "players" | "owners" }) {
  const q = useAnnouncements(audience);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const shown = (q.data ?? []).filter((a) => !dismissed.includes(a.id));
  if (shown.length === 0) return null;
  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem(KEY, JSON.stringify(next.slice(-50)));
  };
  return (
    <div className="flex flex-col">
      {shown.map((a) => {
        const Icon = a.tone === "warning" ? TriangleAlert : Info;
        return (
          <section
            key={a.id}
            aria-label={`Announcement: ${a.title}`}
            className={cn(
              "flex items-start gap-3 border-b px-4 py-3 text-sm sm:px-6",
              a.tone === "warning"
                ? "border-signal-amber/50 bg-signal-amber/10"
                : "border-field/40 bg-field/10",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                a.tone === "warning" ? "text-signal-amber" : "text-field",
              )}
              aria-hidden
            />
            <p className="min-w-0 flex-1">
              <strong className="font-semibold">{a.title}.</strong> {a.message}
            </p>
            <button
              type="button"
              onClick={() => dismiss(a.id)}
              className="-my-1 grid size-8 shrink-0 place-items-center rounded-full text-line-dim hover:bg-court-raised hover:text-line"
              aria-label={`Dismiss announcement: ${a.title}`}
            >
              <X className="size-4" aria-hidden />
            </button>
          </section>
        );
      })}
    </div>
  );
}
