// Pure calendar-grid arithmetic for the master business calendar. Works
// entirely on "YYYY-MM-DD" strings via Date.UTC, deliberately never touching
// the local-timezone Date getters (getDay/getMonth/etc.) — event_date is a
// plain SQL date with no time component, so there's no timezone conversion
// to do at all; mixing UTC-based construction with local-time reads is
// exactly the kind of off-by-one-day bug this file is written to avoid.

function parseDateString(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}

function toEpochDay(dateStr: string): number {
  const { y, m, d } = parseDateString(dateStr);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function fromEpochDay(epochDay: number): string {
  const date = new Date(epochDay * 86_400_000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr: string, days: number): string {
  return fromEpochDay(toEpochDay(dateStr) + days);
}

/** 0 = Sunday .. 6 = Saturday, matching JS's Date#getDay() convention. */
export function dayOfWeek(dateStr: string): number {
  const { y, m, d } = parseDateString(dateStr);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function todayDateString(timeZone = "America/New_York"): string {
  // Local calendar date in the business's timezone, not the server's.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** First of the given month, as "YYYY-MM-DD". Month is 1-12. */
export function firstOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function addMonths(dateStr: string, months: number): string {
  const { y, m, d } = parseDateString(dateStr);
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

export function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
}

/**
 * All the dates that belong in a month's calendar grid: complete weeks
 * (Sunday-start) covering every day of the month, padded with the trailing
 * days of the previous/next month so every row has 7 days.
 */
export function monthGridDates(year: number, month: number): string[] {
  const first = firstOfMonth(year, month);
  const gridStart = addDays(first, -dayOfWeek(first));

  const lastOfMonth = addDays(addMonths(first, 1), -1);
  const daysAfterLast = 6 - dayOfWeek(lastOfMonth);
  const gridEnd = addDays(lastOfMonth, daysAfterLast);

  const dates: string[] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/** The 7 dates (Sunday-start) of the week containing dateStr. */
export function weekDates(dateStr: string): string[] {
  const start = addDays(dateStr, -dayOfWeek(dateStr));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function weekLabel(dateStr: string): string {
  const [start, end] = [weekDates(dateStr)[0], weekDates(dateStr)[6]];
  const fmt = (s: string) => {
    const { y, m, d } = parseDateString(s);
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(y, m - 1, d))
    );
  };
  return `${fmt(start)} – ${fmt(end)}`;
}
