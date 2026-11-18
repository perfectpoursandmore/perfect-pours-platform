// Faith types times the quick way: "3" means 3:00 PM, "3:30" means 3:30 PM.
// PM is assumed unless she types am ("11am", "9:30 a"). 24-hour times
// ("15:30") and "12" (noon) also work. Returns "HH:MM" (24-hour), "" for a
// blank box, or null when it can't be read.
export function parseEasyTime(input: string): string | null {
  const raw = String(input ?? "").trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
  if (!raw) return "";
  const m = raw.match(/^(\d{1,2})(?::?(\d{2}))?(a|am|p|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ampm = m[3];
  if (min > 59 || h > 23) return null;
  if (ampm) {
    if (h < 1 || h > 12) return null;
    h = ampm.startsWith("a") ? h % 12 : (h % 12) + 12;
  } else if (h >= 1 && h <= 11) {
    h += 12; // assume PM
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** "15:30" -> "3:30 PM", "15:00" -> "3 PM": how a saved time shows in the box. */
export function friendlyTime(hhmm: string): string {
  if (!hhmm) return "";
  const [hs, ms] = hhmm.split(":");
  const h = Number(hs);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return ms === "00" ? `${h12} ${suffix}` : `${h12}:${ms} ${suffix}`;
}
