import { createClient } from "@/lib/supabase/server";
import { EVENT_TYPE_LABELS, EVENT_STATUS_LABELS, formatDate } from "@/lib/labels";

export default async function EventsPage() {
  const supabase = createClient();
  const { data: events } = await supabase
    .from("events")
    .select("id, name, event_type, event_date, status, clients(first_name, last_name)")
    .order("event_date", { ascending: false });

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Events</h1>
          <p style={{ color: "var(--color-muted)" }}>Every event, past and upcoming.</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <a
            href="/admin/events/import-times"
            className="button"
            style={{ background: "none", border: "1px solid var(--color-border)", color: "inherit" }}
          >
            Import times &amp; staff from spreadsheet
          </a>
          <a href="/admin/events/new" className="button">
            + Add booking
          </a>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {events && events.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.75rem 1rem" }}>Event</th>
                <th style={{ padding: "0.75rem 1rem" }}>Client</th>
                <th style={{ padding: "0.75rem 1rem" }}>Date</th>
                <th style={{ padding: "0.75rem 1rem" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const client = Array.isArray(event.clients) ? event.clients[0] : event.clients;
                return (
                  <tr key={event.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <a href={`/admin/events/${event.id}`}>{event.name}</a>{" "}
                      <span style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>
                        ({EVENT_TYPE_LABELS[event.event_type] ?? event.event_type})
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      {client ? `${client.first_name} ${client.last_name}` : "—"}
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>{formatDate(event.event_date)}</td>
                    <td style={{ padding: "0.75rem 1rem" }}>{EVENT_STATUS_LABELS[event.status]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p style={{ padding: "1.5rem", color: "var(--color-muted)", margin: 0 }}>
            No events yet — they show up here once a lead is converted, or you add a booking
            directly above.
          </p>
        )}
      </div>
    </div>
  );
}
