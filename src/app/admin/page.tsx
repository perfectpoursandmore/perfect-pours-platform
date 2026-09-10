import { createClient } from "@/lib/supabase/server";
import { LEAD_STATUS_LABELS, formatDate, formatDateTime } from "@/lib/labels";

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

  const [{ data: thisWeeksEvents }, { data: upcomingConsultations }, { data: attentionLeads }] =
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
