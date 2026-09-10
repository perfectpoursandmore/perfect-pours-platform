// Minimal, dependency-free helpers for converting between a business's
// local wall-clock time (e.g. "10:00 AM in America/New_York") and the
// actual UTC instant it refers to — correctly across DST changes.
//
// No date library needed: the JS engine's built-in Intl already knows every
// IANA time zone's rules, we just have to ask it the right question.

/** "local wall clock minus UTC" offset, in minutes, for `instant` in `timeZone`. */
function getOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );

  return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * Converts a local calendar date + time ("2026-10-17", "14:30") in `timeZone`
 * into the UTC instant it represents. Handles DST by solving for the offset
 * iteratively (two passes is enough outside the ~1 hour/year of an actual
 * spring-forward gap, which never falls inside business hours).
 */
export function zonedTimeToUtc(dateISO: string, timeHHMM: string, timeZone: string): Date {
  const [year, month, day] = dateISO.split("-").map(Number);
  const [hour, minute] = timeHHMM.split(":").map(Number);
  const desiredWallClockUtcMillis = Date.UTC(year, month - 1, day, hour, minute, 0);

  let guess = new Date(desiredWallClockUtcMillis);
  for (let i = 0; i < 2; i++) {
    const offset = getOffsetMinutes(guess, timeZone);
    guess = new Date(desiredWallClockUtcMillis - offset * 60000);
  }
  return guess;
}

/** The calendar date ("YYYY-MM-DD") that `instant` falls on in `timeZone`. */
export function utcToZonedDateString(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** 0 (Sunday) .. 6 (Saturday) for a "YYYY-MM-DD" calendar date. */
export function weekdayOf(dateISO: string): number {
  const [year, month, day] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Adds `days` (may be negative) to a "YYYY-MM-DD" calendar date string. */
export function addDaysToDateString(dateISO: string, days: number): string {
  const [year, month, day] = dateISO.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}
