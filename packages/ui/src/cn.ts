import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge our custom utilities so they never cancel font weights.
const twMerge = extendTailwindMerge<"font-width" | "court-line" | "tabular">({
  extend: {
    classGroups: {
      "font-width": ["font-expanded", "font-condensed"],
      "court-line": ["court-line"],
      tabular: ["tabular"],
    },
  },
});

/** Joins class names; later Tailwind classes win over earlier conflicting ones. */
export function cn(...values: ClassValue[]) {
  return twMerge(clsx(values));
}
