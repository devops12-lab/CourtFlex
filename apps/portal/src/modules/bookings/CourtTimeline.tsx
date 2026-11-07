import { useEffect, useRef } from "react";
import type { CalendarDay } from "@courtflex/api";
import { cn } from "@courtflex/ui";
import { BlockTile, ClosedTile } from "./BlockTile";
import { dayScale, hourLabel } from "./day-scale";
import { useNow } from "./use-now";

const LABEL_W = 96;
const TRACK_MIN_W = 1280; // about 80px per hour, enough for a first name

/**
 * Today's courts as lanes running left to right, one lane per court,
 * with a ball-yellow line for the current time. On narrow screens the
 * lanes scroll sideways under pinned court names, starting near "now".
 */
export function CourtTimeline({
  day,
  timeZone,
  onOpenBooking,
}: {
  day: CalendarDay;
  timeZone: string;
  onOpenBooking: (id: string) => void;
}) {
  const now = useNow();
  const scale = dayScale(day, timeZone);
  const nowPct = scale.nowPct(now);
  const scroller = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  useEffect(() => {
    const el = scroller.current;
    if (!el || scrolled.current || nowPct === null) return;
    scrolled.current = true;
    const trackWidth = el.scrollWidth - LABEL_W;
    el.scrollLeft = Math.max((nowPct / 100) * trackWidth - (el.clientWidth - LABEL_W) / 3, 0);
  }, [nowPct]);

  const pos = (m: number) => `${((m - scale.open) / scale.span) * 100}%`;

  return (
    <div ref={scroller} className="overflow-x-auto pb-2">
      <div style={{ minWidth: LABEL_W + TRACK_MIN_W }}>
        {/* hour ruler */}
        <div className="flex h-6 text-xs text-line-dim">
          <div className="sticky left-0 z-20 shrink-0 bg-court-deep" style={{ width: LABEL_W }} />
          <div className="relative flex-1">
            {scale.hours.map((m) => (
              <span
                key={m}
                className={cn(
                  "absolute font-condensed whitespace-nowrap",
                  m === scale.open ? "" : m === scale.close ? "-translate-x-full" : "-translate-x-1/2",
                )}
                style={{ left: pos(m) }}
              >
                {hourLabel(m)}
              </span>
            ))}
          </div>
        </div>

        <ul className="border-y-2 border-line">
          {day.courts.map((court, i) => (
            <li key={court.id} className={cn("flex h-16 items-stretch", i > 0 && "border-t court-line")}>
              <div
                className="sticky left-0 z-20 flex shrink-0 flex-col justify-center border-r-2 border-line bg-court-deep pr-3"
                style={{ width: LABEL_W }}
              >
                <span className="font-semibold">{court.name}</span>
                <span className="text-xs text-line-dim capitalize">{court.indoor_outdoor}</span>
              </div>
              <div className="relative flex-1">
                {scale.hours.map((m) => (
                  <span
                    key={m}
                    aria-hidden
                    className="absolute inset-y-0 border-l court-line"
                    style={{ left: pos(m) }}
                  />
                ))}
                {day.closures
                  .filter((c) => c.court_id === court.id)
                  .map((c) => {
                    const { start, size } = scale.place(c);
                    return (
                      <ClosedTile
                        key={`${c.starts_at}-${c.reason}`}
                        closure={c}
                        timeZone={timeZone}
                        compact
                        style={{ left: `${start}%`, width: `${size}%`, top: 0, bottom: 0 }}
                      />
                    );
                  })}
                {day.blocks
                  .filter((b) => b.court_id === court.id)
                  .map((block) => {
                    const { start, size } = scale.place(block);
                    return (
                      <BlockTile
                        key={block.reservation_id}
                        block={block}
                        timeZone={timeZone}
                        onOpen={onOpenBooking}
                        compact
                        style={{
                          left: `calc(${start}% + 2px)`,
                          width: `calc(${size}% - 4px)`,
                          top: 8,
                          bottom: 8,
                        }}
                      />
                    );
                  })}
                {nowPct !== null && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-y-px z-10 w-0.5 bg-ball"
                    style={{ left: `${nowPct}%` }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
