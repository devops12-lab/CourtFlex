import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import { cn } from "./cn";
import { Wordmark } from "./Wordmark";

/**
 * The brand loader: logo and a moving bar. It looks the same as the splash
 * screen in index.html, so the handover from splash to app has no flash.
 */
export function PageLoader({ label = "Loading CourtFlex" }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label={label} aria-busy="true">
      <div className="flex flex-col items-center gap-7">
        <Wordmark size="xl" className="cf-loader-logo" />
        <span className="cf-loader-bar" aria-hidden />
      </div>
    </div>
  );
}

/**
 * Eases its content in the first time it scrolls into view. Content is
 * never hidden for people who prefer reduced motion (theme.css).
 */
export function Reveal({
  as: Tag = "div",
  delay = 0,
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  delay?: number;
  className?: string;
  children: ReactNode;
} & Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setShown(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      className={cn("reveal", className)}
      data-shown={shown || undefined}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Fades the splash screen from index.html out once the app has drawn. */
export function hideSplash() {
  const el = document.getElementById("splash");
  if (!el) return;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      el.classList.add("done");
      setTimeout(() => el.remove(), 500);
    }),
  );
}
