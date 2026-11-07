import type { CalendarDay } from "@courtflex/api";
import { dayScale, hourLabel } from "../modules/bookings/day-scale";

const day: CalendarDay = {
  date: "2026-11-04",
  opens_at: "2026-11-03T22:00:00.000Z", // 6:00 AM Manila
  closes_at: "2026-11-04T14:00:00.000Z", // 10:00 PM Manila
  courts: [],
  blocks: [],
  closures: [],
};

test("places a 7–8 PM booking at the right share of a 6 AM–10 PM day", () => {
  const scale = dayScale(day, "Asia/Manila");
  const { start, size } = scale.place({
    starts_at: "2026-11-04T11:00:00.000Z", // 7 PM
    ends_at: "2026-11-04T12:00:00.000Z", // 8 PM
  });
  expect(start).toBeCloseTo((13 / 16) * 100);
  expect(size).toBeCloseTo((1 / 16) * 100);
});

test("hides the now line outside opening hours", () => {
  const scale = dayScale(day, "Asia/Manila");
  expect(scale.nowPct(new Date("2026-11-04T15:00:00.000Z"))).toBeNull(); // 11 PM
  expect(scale.nowPct(new Date("2026-11-03T22:00:00.000Z"))).toBe(0);
});

test("labels hours in 12-hour time", () => {
  expect(hourLabel(6 * 60)).toBe("6 AM");
  expect(hourLabel(12 * 60)).toBe("12 PM");
  expect(hourLabel(22 * 60)).toBe("10 PM");
});
