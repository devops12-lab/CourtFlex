import { cn } from "@courtflex/ui";

/** Stable small number from a name, so each club keeps its own cover. */
function hash(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function initials(name: string) {
  return name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** The club's logo, or its initials on a court-line tile when there's no logo. */
export function ClubLogo({
  name,
  url,
  size = "md",
  className,
}: {
  name: string;
  url: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = size === "sm" ? "size-8 text-xs" : size === "lg" ? "size-20 text-2xl" : "size-12 text-base";
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={cn("shrink-0 rounded-md border border-line-faint object-cover", box, className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-md border-2 border-line bg-court-deep font-expanded font-extrabold text-line",
        box,
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/**
 * A club's cover: the uploaded image, or a court drawn from above at an angle
 * chosen from the club's name, so every club looks different without photos.
 */
export function ClubCover({
  name,
  url,
  className,
}: {
  name: string;
  url: string | null;
  className?: string;
}) {
  if (url) return <img src={url} alt="" className={cn("w-full object-cover", className)} />;
  const h = hash(name);
  const tilt = (h % 24) - 12;
  const ballX = 60 + (h % 70);
  const ballY = 10 + ((h >> 3) % 14);
  const surface = ["#1e4d45", "#1f3350", "#22406b", "#26594f"][h % 4];
  return (
    <svg
      viewBox="0 0 200 40"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className={cn("w-full bg-court-surface", className)}
    >
      <g transform={`rotate(${tilt} 100 20)`}>
        <rect x="-20" y="2" width="240" height="36" fill={surface} />
        <g fill="none" stroke="var(--color-line)" strokeOpacity="0.55" strokeWidth="0.8">
          <rect x="30" y="6" width="140" height="28" />
          <path d="M77 6v28M123 6v28M30 20h47M123 20h47" />
        </g>
        <path
          d="M100 2v36"
          stroke="var(--color-line)"
          strokeOpacity="0.8"
          strokeWidth="1.2"
          strokeDasharray="1.4 1.2"
        />
      </g>
      <circle cx={ballX} cy={ballY} r="2.2" fill="var(--color-ball)" />
    </svg>
  );
}
