// Mileage log with no typing: each booked event gets a round trip from
// Faith's home address to the event's address, worked out automatically.
// She can add other trips (shopping runs) and change any number.
//
// Distances come from OpenStreetMap: Nominatim to find the addresses and
// the public OSRM router for driving distance. Both are free and need no
// key; volume here is a handful of lookups a week. If routing fails, a
// straight-line estimate x 1.25 is used and marked as an estimate.

type SupabaseLike = any;

const UA = "PerfectPoursPlatform/1.0 (mileage log)";

/** IRS business standard mileage rate in dollars per mile, by trip date. */
export function irsRate(date: string): number {
  if (date >= "2026-07-01") return 0.76; // mid-year increase, from July 1, 2026
  if (date >= "2026-01-01") return 0.725;
  if (date >= "2025-01-01") return 0.7;
  return 0.67;
}

export type MoneySettings = {
  home_address: string | null;
  home_lat: number | null;
  home_lng: number | null;
  set_aside_pct: number;
  sales_tax_filing: "quarterly" | "annual";
};

export const DEFAULT_SETTINGS: MoneySettings = {
  home_address: null,
  home_lat: null,
  home_lng: null,
  set_aside_pct: 25,
  sales_tax_filing: "quarterly",
};

export async function getMoneySettings(supabase: SupabaseLike): Promise<MoneySettings> {
  const { data, error } = await supabase.from("money_settings").select("*").eq("id", true).maybeSingle();
  if (error || !data) return DEFAULT_SETTINGS;
  return {
    home_address: data.home_address,
    home_lat: data.home_lat,
    home_lng: data.home_lng,
    set_aside_pct: Number(data.set_aside_pct ?? 25),
    sales_tax_filing: data.sales_tax_filing === "annual" ? "annual" : "quarterly",
  };
}

export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
    if (!res.ok) return null;
    const rows = (await res.json()) as { lat: string; lon: string }[];
    if (!rows.length) return null;
    return { lat: Number(rows[0].lat), lng: Number(rows[0].lon) };
  } catch {
    return null;
  }
}

function straightLineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** One-way driving miles; falls back to straight line x 1.25. */
export async function drivingMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): Promise<{ miles: number; estimate: boolean }> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { routes?: { distance: number }[] };
      const meters = body.routes?.[0]?.distance;
      if (meters !== undefined) return { miles: meters / 1609.344, estimate: false };
    }
  } catch {
    // fall through to the estimate
  }
  return { miles: straightLineMiles(a, b) * 1.25, estimate: true };
}

function eventAddress(e: { address_line?: string | null; city?: string | null; state?: string | null; zip?: string | null }) {
  if (!e.address_line && !e.city && !e.zip) return null;
  return [e.address_line, e.city, [e.state || "NY", e.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/**
 * Adds the automatic round trip for past events that don't have one yet.
 * Does at most `limit` lookups per call so pages stay quick; the rest are
 * picked up next time. Returns how many it added.
 */
export async function fillEventTrips(supabase: SupabaseLike, settings: MoneySettings, opts: { from: string; to: string; limit?: number }): Promise<number> {
  if (!settings.home_address) return 0;
  let home = settings.home_lat != null && settings.home_lng != null ? { lat: settings.home_lat, lng: settings.home_lng } : null;
  if (!home) {
    home = await geocode(settings.home_address);
    if (!home) return 0;
    await supabase.from("money_settings").update({ home_lat: home.lat, home_lng: home.lng }).eq("id", true);
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const { data: events } = await supabase
    .from("events")
    .select("id, event_date, address_line, city, state, zip")
    .in("status", ["booked", "completed"])
    .gte("event_date", opts.from)
    .lt("event_date", opts.to)
    .lte("event_date", today);
  const list = (events ?? []) as { id: string; event_date: string; address_line: string | null; city: string | null; state: string | null; zip: string | null }[];
  if (!list.length) return 0;

  const { data: existing } = await supabase.from("mileage_trips").select("event_id").eq("auto", true).in("event_id", list.map((e) => e.id));
  const done = new Set(((existing ?? []) as { event_id: string }[]).map((r) => r.event_id));

  let added = 0;
  for (const e of list) {
    if (added >= (opts.limit ?? 4) || done.has(e.id)) continue;
    const address = eventAddress(e);
    if (!address) continue;
    const spot = await geocode(address);
    if (!spot) continue;
    const { miles, estimate } = await drivingMiles(home, spot);
    const { error } = await supabase.from("mileage_trips").insert({
      trip_date: e.event_date,
      event_id: e.id,
      miles: Math.round(miles * 2 * 10) / 10,
      note: estimate ? "Round trip (estimate)" : "Round trip",
      auto: true,
    });
    if (!error) added += 1;
  }
  return added;
}

export type TripRow = { id: string; trip_date: string; event_id: string | null; miles: number | string; note: string | null; auto: boolean };

export function mileageTotals(trips: TripRow[]) {
  let miles = 0;
  let deduction = 0;
  for (const t of trips) {
    const m = Number(t.miles) || 0;
    miles += m;
    deduction += m * irsRate(t.trip_date);
  }
  return { miles: Math.round(miles * 10) / 10, deduction: Math.round(deduction * 100) / 100 };
}
