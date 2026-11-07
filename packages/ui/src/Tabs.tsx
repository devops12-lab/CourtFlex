import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  /** Small count shown after the label, e.g. bookings in a list. */
  count?: number;
  disabled?: boolean;
}

interface TabsProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  items: Array<TabItem<T>>;
  /** Renders the panel for the selected tab. */
  children: (value: T) => ReactNode;
  className?: string;
}

/**
 * Tabs drawn on a baseline, like a court's back line. Arrow keys, Home and
 * End move between tabs (WAI-ARIA tabs pattern, automatic activation).
 */
export function Tabs<T extends string>({ label, value, onChange, items, children, className }: TabsProps<T>) {
  const base = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = items.filter((i) => !i.disabled);

  const move = (e: KeyboardEvent, current: T) => {
    const idx = enabled.findIndex((i) => i.value === current);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (idx + 1) % enabled.length;
    if (e.key === "ArrowLeft") next = (idx - 1 + enabled.length) % enabled.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = enabled.length - 1;
    if (next === null) return;
    e.preventDefault();
    const target = enabled[next]!;
    onChange(target.value);
    refs.current[items.indexOf(target)]?.focus();
  };

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-1 overflow-x-auto border-b-2 border-line-faint"
      >
        {items.map((item, i) => {
          const selected = item.value === value;
          return (
            <button
              key={item.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${item.value}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${item.value}`}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => onChange(item.value)}
              onKeyDown={(e) => move(e, item.value)}
              className={cn(
                "-mb-0.5 flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition-colors",
                selected ? "border-line text-line" : "border-transparent text-line-dim hover:text-line",
                item.disabled && "cursor-not-allowed opacity-40 hover:text-line-dim",
              )}
            >
              {item.label}
              {item.count !== undefined && (
                <span className="text-xs font-condensed text-line-dim" aria-label={`, ${item.count}`}>
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel-${value}`}
        aria-labelledby={`${base}-tab-${value}`}
        tabIndex={0}
        className="pt-5 focus-visible:outline-offset-4"
      >
        {children(value)}
      </div>
    </div>
  );
}
