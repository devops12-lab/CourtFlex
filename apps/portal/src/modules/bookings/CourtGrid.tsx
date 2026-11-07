import { useEffect, useRef } from "react";
import type { CalendarDay } from "@courtflex/api";
import { formatTime } from "@courtflex/api";
import { BlockTile, ClosedTile } from "./BlockTile";
import { dayScale, hourLabel } from "./day-scale";
import { useNow } from "./use-now";

const ROW_PX = 30; // height of 30 minutes

/**
 * The day's calendar: courts side by side as columns, time running down.
 * Empty court time can be tapped to start a walk-in at that slot.
 */
export function CourtGrid({
  day,
  timeZone,
  onOpenBooking,
  onPickSlot,
}: {
  day: CalendarDay;
  timeZone: string;
  onOpenBooking: (id: string) => void;
  /** Omit when the person can't create walk-ins. */
  onPickSlot?: (courtId: string, startsAt: string) => void;
}) {
  const now = useNow();
  const scale = dayScale(day, timeZone);
  const slots = scale.span / 30;
  const height = slots * ROW_PX;
  const nowPct = scale.nowPct(now);
  const openTime = new Date(day.opens_at).getTime();
  const nowLine = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  // Open today's calendar at the current time instead of 6 AM.
  useEffect(() => {
    if (scrolled.current || !nowLine.current) return;
    scrolled.current = true;
    nowLine.current.scrollIntoView({ block: "center", inline: "nearest" });
  }, [nowPct]);

  return (
    <div className="overflow-x-auto rounded-sm border-2 border-line">
      <div className="min-w-fit" style={{ minWidth: 64 + day.courts.length * 168 }}>
        {/* court headers */}
        <div className="sticky top-0 z-20 flex border-b-2 border-line bg-court-surface">
          <div className="sticky left-0 z-10 w-16 shrink-0 bg-court-surface" />
          {day.courts.map((c) => (
            <div key={c.id} className="flex-1 border-l-2 border-line px-3 py-2.5" style={{ minWidth: 168 }}>
              <div className="font-expanded font-bold">{c.name}</div>
              <div className="text-xs text-line-dim capitalize">
                {c.indoor_outdoor}, {c.surface_type.toLowerCase()}
              </div>
            </div>
          ))}
        </div>

        <div className="relative flex" style={{ height }}>
          {/* time gutter */}
          <div className="sticky left-0 z-10 w-16 shrink-0 bg-court-deep">
            {scale.hours.map((m) => (
              <span
                key={m}
                className="absolute right-2 -translate-y-1/2 text-xs font-condensed text-line-dim"
                style={{ top: ((m - scale.open) / 30) * ROW_PX }}
              >
                {m === scale.open ? "" : hourLabel(m)}
              </span>
            ))}
          </div>

          {day.courts.map((court) => (
            <div key={court.id} className="relative flex-1 border-l-2 border-line" style={{ minWidth: 168 }}>
              {/* half-hour rules and tappable empty slots */}
              {Array.from({ length: slots }, (_, i) => {
                const startsAt = new Date(openTime + i * 30 * 60_000).toISOString();
                const past = new Date(startsAt) < now;
                const closed = day.closures.some(
                  (c) => c.court_id === court.id && c.starts_at <= startsAt && c.ends_at > startsAt,
                );
                return (
                  <div
                    key={i}
                    className={
                      i % 2 === 0 ? "border-t court-line" : "border-t border-dashed border-line-faint/50"
                    }
                    style={{ height: ROW_PX }}
                  >
                    {onPickSlot && !past && !closed && (
                      <button
                        type="button"
                        tabIndex={-1}
                        className="group h-full w-full text-left text-xs text-transparent hover:bg-court-surface hover:text-line-dim"
                        onClick={() => onPickSlot(court.id, startsAt)}
                        aria-label={`New walk-in on ${court.name} at ${formatTime(startsAt, timeZone)}`}
                      >
                        <span className="px-2">+ {formatTime(startsAt, timeZone)}</span>
                      </button>
                    )}
                  </div>
                );
              })}

              {day.closures
                .filter((c) => c.court_id === court.id)
                .map((c) => {
                  const { start, size } = scale.place(c);
                  return (
                    <ClosedTile
                      key={`${c.starts_at}-${c.reason}`}
                      closure={c}
                      timeZone={timeZone}
                      style={{ top: `${start}%`, height: `${size}%`, left: 0, right: 0 }}
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
                      compact={(size / 100) * height < 44}
                      style={{
                        top: `calc(${start}% + 2px)`,
                        height: `calc(${size}% - 4px)`,
                        left: 4,
                        right: 4,
                      }}
                    />
                  );
                })}
            </div>
          ))}

          {nowPct !== null && (
            <div
              ref={nowLine}
              aria-hidden
              className="pointer-events-none absolute right-0 left-16 z-10 h-0.5 bg-ball"
              style={{ top: `${nowPct}%` }}
            >
              <span className="absolute -top-[5px] -left-1.5 size-3 rounded-full bg-ball" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
