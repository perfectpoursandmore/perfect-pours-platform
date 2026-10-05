import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/google-calendar";
import { todayDateString } from "@/lib/calendar-dates";

// Server-only. Mirrors platform events onto Faith's connected Google
// Calendar:
//   booked / completed -> normal entry ("Johnson Wedding")
//   inquiry            -> "HOLD: Johnson Wedding", so the date isn't double-booked
//   cancelled / deleted -> removed from Google
//
// Every function here swallows its own errors (recording them on the event
// as google_sync_error) so a Google hiccup never stops Faith from saving an
// event in the platform.

const TIME_ZONE = "America/New_York";
const DEFAULT_LENGTH_MS = 4 * 60 * 60 * 1000; // used when only a start time is set

type EventRow = {
  id: string;
  name: string;
  event_type: string;
  event_date: string;
  status: string;
  venue_name: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  guest_count: number | null;
  staff_arrival_time: string | null;
  guest_arrival_time: string | null;
  staff_end_time: string | null;
  google_event_id: string | null;
  clients: { first_name: string | null; last_name: string | null } | null;
};

const EVENT_COLUMNS =
  "id, name, event_type, event_date, status, venue_name, address_line, city, state, zip, guest_count, staff_arrival_time, guest_arrival_time, staff_end_time, google_event_id, clients(first_name, last_name)";

function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function buildGoogleBody(e: EventRow) {
  const isHold = e.status === "inquiry";
  const summary = `${isHold ? "HOLD: " : ""}${e.name}`;

  const cityLine = [e.city, [e.state, e.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const location = [e.venue_name, e.address_line, cityLine].filter(Boolean).join(", ") || undefined;

  const clientName = [e.clients?.first_name, e.clients?.last_name].filter(Boolean).join(" ");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const lines = [
    isHold ? "Status: Inquiry (not booked yet)" : `Status: ${e.status[0].toUpperCase()}${e.status.slice(1)}`,
    clientName && `Client: ${clientName}`,
    `Type: ${e.event_type}`,
    e.guest_count ? `Guests: ${e.guest_count}` : null,
    e.staff_arrival_time ? `Staff arrive: ${fmtTime(e.staff_arrival_time)}` : null,
    e.guest_arrival_time ? `Guests arrive: ${fmtTime(e.guest_arrival_time)}` : null,
    e.staff_end_time ? `Staff end: ${fmtTime(e.staff_end_time)}` : null,
    appUrl ? `\nOpen in Perfect Pours: ${appUrl}/admin/events/${e.id}` : null,
    "\n(Synced from the Perfect Pours platform. Edit it there, not here, or your changes will be overwritten.)",
  ].filter(Boolean);

  // Timed entry when we know when it starts; otherwise an all-day entry.
  const startIso = e.staff_arrival_time ?? e.guest_arrival_time;
  let start: Record<string, string>;
  let end: Record<string, string>;
  if (startIso) {
    const startMs = new Date(startIso).getTime();
    const endMs =
      e.staff_end_time && new Date(e.staff_end_time).getTime() > startMs
        ? new Date(e.staff_end_time).getTime()
        : startMs + DEFAULT_LENGTH_MS;
    start = { dateTime: new Date(startMs).toISOString(), timeZone: TIME_ZONE };
    end = { dateTime: new Date(endMs).toISOString(), timeZone: TIME_ZONE };
  } else {
    start = { date: e.event_date };
    end = { date: nextDay(e.event_date) };
  }

  return { summary, location, description: lines.join("\n"), start, end };
}

function eventsUrl(calendarId: string, googleEventId?: string) {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  return googleEventId ? `${base}/${encodeURIComponent(googleEventId)}` : base;
}

async function deleteFromGoogle(accessToken: string, calendarId: string, googleEventId: string) {
  const res = await fetch(eventsUrl(calendarId, googleEventId), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 404/410 = already gone (deleted by hand in Google) -- that's fine.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google delete failed: ${res.status} ${await res.text()}`);
  }
}

async function upsertToGoogle(
  accessToken: string,
  calendarId: string,
  e: EventRow
): Promise<string> {
  const body = JSON.stringify(buildGoogleBody(e));
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  if (e.google_event_id) {
    const res = await fetch(eventsUrl(calendarId, e.google_event_id), { method: "PUT", headers, body });
    if (res.ok) return e.google_event_id;
    // Deleted by hand in Google -- fall through and recreate it.
    if (res.status !== 404 && res.status !== 410) {
      throw new Error(`Google update failed: ${res.status} ${await res.text()}`);
    }
  }

  const res = await fetch(eventsUrl(calendarId), { method: "POST", headers, body });
  if (!res.ok) throw new Error(`Google create failed: ${res.status} ${await res.text()}`);
  const created = (await res.json()) as { id: string };
  return created.id;
}

async function syncRow(
  conn: { accessToken: string; calendarId: string },
  e: EventRow
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  try {
    if (e.status === "cancelled") {
      if (e.google_event_id) await deleteFromGoogle(conn.accessToken, conn.calendarId, e.google_event_id);
      await supabase
        .from("events")
        .update({ google_event_id: null, google_sync_error: null, google_synced_at: new Date().toISOString() })
        .eq("id", e.id);
    } else {
      const googleId = await upsertToGoogle(conn.accessToken, conn.calendarId, e);
      await supabase
        .from("events")
        .update({ google_event_id: googleId, google_sync_error: null, google_synced_at: new Date().toISOString() })
        .eq("id", e.id);
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Google Calendar sync failed for event ${e.id}:`, err);
    await supabase.from("events").update({ google_sync_error: msg.slice(0, 1000) }).eq("id", e.id);
    return { ok: false, error: msg };
  }
}

async function getConnection() {
  try {
    return await getValidAccessToken();
  } catch (err) {
    console.error("Google Calendar sync: couldn't get an access token:", err);
    return null;
  }
}

/** Push one event's current state to Google. Safe to call after any edit. */
export async function syncEventToGoogle(eventId: string): Promise<void> {
  try {
    const conn = await getConnection();
    if (!conn) return; // Google Calendar not connected -- nothing to do

    const supabase = createAdminClient();
    const { data } = await supabase.from("events").select(EVENT_COLUMNS).eq("id", eventId).single();
    if (!data) return;
    await syncRow(conn, data as unknown as EventRow);
  } catch (err) {
    console.error(`Google Calendar sync failed for event ${eventId}:`, err);
  }
}

/** Call with the event's google_event_id BEFORE deleting it from the database. */
export async function removeEventFromGoogle(googleEventId: string | null | undefined): Promise<void> {
  if (!googleEventId) return;
  try {
    const conn = await getConnection();
    if (!conn) return;
    await deleteFromGoogle(conn.accessToken, conn.calendarId, googleEventId);
  } catch (err) {
    console.error("Google Calendar delete failed:", err);
  }
}

/**
 * Backfill: pushes every event from today onward (plus any cancelled event
 * still sitting on Google) so the two calendars match. Past events are left
 * alone so Faith's Google history doesn't fill up with old bookings.
 */
export async function syncAllEventsToGoogle(): Promise<
  { connected: false } | { connected: true; synced: number; failed: number; firstError?: string }
> {
  const conn = await getConnection();
  if (!conn) return { connected: false };

  const supabase = createAdminClient();
  const today = todayDateString(TIME_ZONE);
  const { data } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .or(`event_date.gte.${today},and(status.eq.cancelled,google_event_id.not.is.null)`)
    .order("event_date");

  const rows = (data ?? []) as unknown as EventRow[];
  let synced = 0;
  let failed = 0;
  let firstError: string | undefined;

  // A few at a time -- quick enough for a button click, gentle on Google's rate limits.
  for (let i = 0; i < rows.length; i += 5) {
    const results = await Promise.all(rows.slice(i, i + 5).map((r) => syncRow(conn, r)));
    for (const r of results) {
      if (r.ok) synced++;
      else {
        failed++;
        firstError ??= r.error;
      }
    }
  }

  return { connected: true, synced, failed, firstError };
}
