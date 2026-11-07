// Other packages compile this file too; this makes them see the image types.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./assets.d.ts" />
import { cn } from "./cn";
import logoPng from "./assets/courtflex-logo.png";
import logoWebp from "./assets/courtflex-logo.webp";
import ballPng from "./assets/courtflex-ball.png";

/** A court seen from above: outline, two kitchen lines, centre lines, one ball. Used as a small drawing, not the logo. */
export function CourtMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 22" aria-hidden className={cn("h-5 w-auto", className)}>
      <rect x="1" y="1" width="38" height="20" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M14 1v20M26 1v20M1 11h13M26 11h13" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="32.5" cy="6" r="2.4" fill="var(--color-ball)" />
    </svg>
  );
}

/** Just the ball from the logo: for tight spots like phone headers. */
export function LogoBall({ className, label = "CourtFlex" }: { className?: string; label?: string }) {
  return (
    <img
      src={ballPng}
      alt={label}
      width={32}
      height={32}
      className={cn("size-8 select-none", className)}
      draggable={false}
    />
  );
}

const heights = { sm: "h-7", md: "h-9", lg: "h-12", xl: "h-16" } as const;

/**
 * The CourtFlex logo (transparent, so it sits on any dark surface).
 * `compact` shows only the ball, with the name kept for screen readers.
 */
export function Wordmark({
  className,
  size = "md",
  compact,
}: {
  className?: string;
  size?: keyof typeof heights;
  compact?: boolean;
}) {
  if (compact) return <LogoBall className={className} />;
  return (
    <picture className={cn("inline-flex shrink-0", className)}>
      <source srcSet={logoWebp} type="image/webp" />
      <img
        src={logoPng}
        alt="CourtFlex"
        width={1200}
        height={360}
        draggable={false}
        className={cn("w-auto select-none", heights[size])}
      />
    </picture>
  );
}
