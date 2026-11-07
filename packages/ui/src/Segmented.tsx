import { useId } from "react";
import { cn } from "./cn";

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  className?: string;
}

/** A radio group drawn as a row of court segments split by lines. */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1 rounded-[1.5rem] border border-line-faint bg-court-surface p-1">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "relative flex h-9 min-w-16 flex-1 cursor-pointer items-center justify-center rounded-full px-3 text-sm font-semibold whitespace-nowrap transition-colors",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ball",
              value === o.value ? "bg-line text-court-deep" : "text-line-dim hover:text-line",
              o.disabled && "cursor-not-allowed opacity-40",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              disabled={o.disabled}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
