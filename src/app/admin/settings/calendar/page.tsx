import { createClient } from "@/lib/supabase/server";
import { disconnectGoogleCalendar } from "./actions";

export default async function CalendarSettingsPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string };
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
          Lets the consultation scheduler check your real calendar for conflicts.
          Prospective clients only ever see &quot;unavailable&quot; — never what the
          appointment is or any other detail.
        </p>
      </div>

      {searchParams.connected && (
        <p style={{ color: "#2a7a2a" }}>Google Calendar connected successfully.</p>
      )}
      {searchParams.error && <p style={{ color: "#a33" }}>{searchParams.error}</p>}

      <div className="card">
        {isConnected ? (
          <>
            <p style={{ margin: "0 0 1rem" }}>
              ✓ Connected — reading busy/free time from{" "}
              <strong>{connection?.google_calendar_id}</strong> since{" "}
              {new Date(connection!.connected_at as string).toLocaleDateString()}.
            </p>
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
