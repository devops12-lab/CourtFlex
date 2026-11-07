/** Half-hour clock times for selects: "00:00" … "23:30", with readable labels. */
export const halfHours = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 ? "30" : "00";
  const value = `${String(h).padStart(2, "0")}:${m}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { value, label: `${h12}:${m} ${h < 12 ? "AM" : "PM"}` };
});

/** Closing times can run to midnight, written 23:30 as the last half hour. */
export const clockLabel = (value: string | null) => halfHours.find((t) => t.value === value)?.label ?? "";

export const weekdays = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 0, label: "Sunday", short: "Sun" },
] as const;
