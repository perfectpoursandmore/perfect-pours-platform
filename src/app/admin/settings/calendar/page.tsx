import { createClient } from "@/lib/supabase/server";
import { disconnectGoogleCalendar, syncAllEventsNow } from "./actions";

export default async function CalendarSettingsPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string; synced?: string };
}) {
  const supabase = createClient();
  const { data: connection } = await supabase
    .from("calendar_connections")
    .select("connected_at, google_calendar_id")
    .eq("id", true)
    .single();

  const isConnected = Boolean(connection?.connected_at);

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 560 }}>
      <div>
        <h1 style={{ margin: 0 }}>Google Calendar</h1>
        <p style={{ color: "var(--color-muted)" }}>
          Lets the consultation scheduler check your real calendar for conflicts,
          and puts your events on it automatically: booked events show normally,
          inquiries show as &quot;HOLD:&quot;, and cancelled or deleted events are
          removed. Prospective clients only ever see &quot;unavailable&quot; — never
          what the appointment is or any other detail.
        </p>
      </div>

      {searchParams.connected && (
        <p style={{ color: "var(--color-text)" }}>Google Calendar connected successfully.</p>
      )}
      {searchParams.synced && (
        <p style={{ color: "var(--color-text)" }}>
          Synced {searchParams.synced} upcoming event(s) to Google Calendar.
        </p>
      )}
      {searchParams.error && <p style={{ color: "var(--color-danger)" }}>{searchParams.error}</p>}

      <div className="card">
        {isConnected ? (
          <>
            <p style={{ margin: "0 0 1rem" }}>
              ✓ Connected — reading busy/free time from{" "}
              <strong>{connection?.google_calendar_id}</strong> since{" "}
              {new Date(connection!.connected_at as string).toLocaleDateString()}.
            </p>
            <form action={syncAllEventsNow} style={{ marginBottom: "0.75rem" }}>
              <button type="submit" className="button">
                Sync all upcoming events now
              </button>
              <p style={{ color: "var(--color-muted)", fontSize: "0.9rem", margin: "0.5rem 0 0" }}>
                New and edited events sync on their own. Use this to catch up
                events made before syncing was turned on, or if anything looks off.
              </p>
            </form>
            <form action={disconnectGoogleCalendar}>
              <button
                type="submit"
                style={{
                  background: "none",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  padding: "0.5rem 0.9rem",
                  cursor: "pointer",
                }}
              >
                Disconnect
              </button>
            </form>
          </>
        ) : (
          <>
            <p style={{ margin: "0 0 1rem" }}>Not connected yet.</p>
            <a href="/api/google/connect" className="button">
              Connect Google Calendar
            </a>
          </>
        )}
      </div>
    </div>
  );
}
