import { createClient } from "@/lib/supabase/server";
import { LEAD_STATUS_LABELS, formatDate, formatDateTime } from "@/lib/labels";
import { addDashboardNote, removeDashboardNote } from "./actions";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNowISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function AdminDashboardPage() {
  const supabase = createClient();

  const [{ data: thisWeeksEvents }, { data: upcomingConsultations }, { data: attentionLeads }, { data: dashboardNotes }] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, name, event_date, event_type")
        .eq("status", "booked")
        .gte("event_date", todayISO())
        .lte("event_date", daysFromNowISO(7))
        .order("event_date"),
      supabase
        .from("leads")
        .select("id, first_name, last_name, consultation_at")
        .not("consultation_at", "is", null)
        .gte("consultation_at", new Date().toISOString())
        .order("consultation_at")
        .limit(5),
      supabase
        .from("leads")
        .select("id, first_name, last_name, status")
        .in("status", ["new_inquiry", "consultation_completed", "quote_needed"])
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("dashboard_notes").select("id, note, created_at").order("created_at", { ascending: false }),
    ]);

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <h1 style={{ margin: 0 }}>Dashboard</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>This week</h2>
          {thisWeeksEvents && thisWeeksEvents.length > 0 ? (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
              {thisWeeksEvents.map((e) => (
                <li key={e.id}>
                  <a href={`/admin/events/${e.id}`}>{e.name}</a>{" "}
                  <span style={{ color: "var(--color-muted)" }}>— {formatDate(e.event_date)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--color-muted)", margin: 0 }}>Nothing booked this week.</p>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Upcoming consultations</h2>
          {upcomingConsultations && upcomingConsultations.length > 0 ? (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
              {upcomingConsultations.map((lead) => (
                <li key={lead.id}>
                  <a href={`/admin/leads/${lead.id}`}>
                    {lead.first_name} {lead.last_name}
                  </a>{" "}
                  <span style={{ color: "var(--color-muted)" }}>
                    — {formatDateTime(lead.consultation_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--color-muted)", margin: 0 }}>None scheduled.</p>
          )}

          {dashboardNotes && dashboardNotes.length > 0 && (
            <ul
              style={{
                margin: "0.75rem 0 0",
                padding: 0,
                listStyle: "none",
                display: "grid",
                gap: "0.4rem",
                borderTop: "1px solid var(--color-border)",
                paddingTop: "0.75rem",
              }}
            >
              {dashboardNotes.map((n) => (
                <li key={n.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.92rem" }}>{n.note}</span>
                  <form action={removeDashboardNote}>
                    <input type="hidden" name="id" value={n.id} />
                    <button
                      type="submit"
                      title="Done — remove"
                      style={{ background: "none", border: "none", color: "var(--color-muted)", cursor: "pointer", flexShrink: 0 }}
                    >
                      ✕
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <form
            action={addDashboardNote}
            style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}
          >
            <input
              type="text"
              name="note"
              placeholder='e.g. "Call with Nicole at 1:30pm — follow up"'
              style={{
                flex: 1,
                padding: "0.5rem 0.65rem",
                borderRadius: 8,
                border: "1px solid var(--color-border)",
                fontSize: "0.9rem",
              }}
            />
            <button type="submit" className="button">
              Add
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Needs attention</h2>
        {attentionLeads && attentionLeads.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
            {attentionLeads.map((lead) => (
              <li key={lead.id}>
                <a href={`/admin/leads/${lead.id}`}>
                  {lead.first_name} {lead.last_name}
                </a>{" "}
                <span style={{ color: "var(--color-muted)" }}>— {LEAD_STATUS_LABELS[lead.status]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "var(--color-muted)", margin: 0 }}>Nothing waiting on you.</p>
        )}
      </div>

      <p style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>
        Proposal/contract/deposit indicators join this dashboard in Phase 5-6, once those
        workflows exist.
      </p>
    </div>
  );
}
