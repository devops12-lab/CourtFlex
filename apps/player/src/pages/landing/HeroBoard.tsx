import { cn } from "@courtflex/ui";

const slots = [
  { time: "5:00 PM", price: "₱350", state: "taken" },
  { time: "6:00 PM", price: "₱350", state: "open" },
  { time: "7:00 PM", price: "₱400", state: "yours" },
  { time: "8:00 PM", price: "₱400", state: "open" },
] as const;

/**
 * The hero's one bold element: a court seen from above with tonight's times
 * under it, and one slot booked. It's an illustration of the product, so
 * screen readers get a single sentence instead of the parts.
 */
export function HeroBoard() {
  return (
    <figure
      role="img"
      aria-label="Example booking: Court 2 at Mauban Pickleball Courts, 7:00 to 8:00 PM tonight, ₱400, paid at the front desk."
      className="relative mx-auto w-full max-w-md"
    >
      <div className="rounded-lg border border-line-faint bg-court-surface p-5 pb-20 shadow-[0_30px_80px_-30px_rgb(252_191_14/0.25)]">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="font-bold">Court 2</p>
            <p className="text-sm text-line-dim">Mauban Pickleball Courts</p>
          </div>
          <p className="text-sm text-line-dim">Tonight</p>
        </div>

        <svg viewBox="0 0 220 100" className="mt-4 w-full" aria-hidden>
          <rect x="0" y="0" width="220" height="100" rx="10" fill="var(--color-court-outer)" />
          <g fill="none" stroke="var(--color-line)" strokeWidth="1.6" strokeOpacity="0.85">
            <rect x="10" y="10" width="200" height="80" />
            <path d="M78 10v80M142 10v80M10 50h68M142 50h68" />
          </g>
          <path d="M110 6v88" stroke="var(--color-line)" strokeWidth="3" />
          <circle cx="168" cy="30" r="5" fill="var(--color-ball)" className="hero-ball" />
        </svg>

        <ul className="mt-4 grid grid-cols-2 gap-2">
          {slots.map((s) => (
            <li
              key={s.time}
              className={cn(
                "flex items-center justify-between rounded-full border px-4 py-2.5 text-sm",
                s.state === "yours" && "hero-yours border-ball bg-ball font-semibold text-ball-ink",
                s.state === "open" && "border-line-faint",
                s.state === "taken" && "border-transparent text-line-dim line-through",
              )}
            >
              <span className="font-semibold font-condensed">{s.time}</span>
              <span className="font-condensed">{s.state === "yours" ? "Yours" : s.price}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* The booking code, pinned to the board like a ticket stub. */}
      <div className="hero-ticket absolute -bottom-5 left-4 rounded-md border border-ball/60 bg-court-deep px-4 py-3 sm:-left-8">
        <p className="text-xs text-line-dim">Booking code</p>
        <p className="text-xl font-extrabold tracking-wide text-ball">CF-4127</p>
        <p className="text-xs text-line-dim">7:00 PM, ₱400, pay at the front desk</p>
      </div>
    </figure>
  );
}
