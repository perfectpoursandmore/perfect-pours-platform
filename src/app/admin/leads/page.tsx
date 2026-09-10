import { createClient } from "@/lib/supabase/server";
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER, EVENT_TYPE_LABELS, formatDate, formatDateTime } from "@/lib/labels";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const supabase = createClient();
  const statusFilter = searchParams.status;

  let query = supabase.from("leads").select("*").order("created_at", { ascending: false });
  if (statusFilter) query = query.eq("status", statusFilter);

  const { data: leads } = await query;

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div>
        <h1 style={{ margin: 0 }}>Leads</h1>
        <p style={{ color: "var(--color-muted)" }}>
          Everyone who's booked a consultation or come in as an inquiry, in one pipeline.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <a
          href="/admin/leads"
          className="button"
          style={{
            background: !statusFilter ? "var(--color-accent)" : "#fff",
            color: !statusFilter ? "#fff" : "var(--color-text)",
            border: "1px solid var(--color-border)",
          }}
        >
          All
        </a>
        {LEAD_STATUS_ORDER.map((status) => (
          <a
            key={status}
            href={`/admin/leads?status=${status}`}
            className="button"
            style={{
              background: statusFilter === status ? "var(--color-accent)" : "#fff",
              color: statusFilter === status ? "#fff" : "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
          >
            {LEAD_STATUS_LABELS[status]}
          </a>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {leads && leads.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.75rem 1rem" }}>Name</th>
                <th style={{ padding: "0.75rem 1rem" }}>Event</th>
                <th style={{ padding: "0.75rem 1rem" }}>Consultation</th>
                <th style={{ padding: "0.75rem 1rem" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <a href={`/admin/leads/${lead.id}`}>
                      {lead.first_name} {lead.last_name}
                    </a>
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    {EVENT_TYPE_LABELS[lead.event_type] ?? lead.event_type} —{" "}
                    {formatDate(lead.event_date)}
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>{formatDateTime(lead.consultation_at)}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>{LEAD_STATUS_LABELS[lead.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ padding: "1.5rem", color: "var(--color-muted)", margin: 0 }}>
            No leads {statusFilter ? "in this stage" : "yet"}.
          </p>
        )}
      </div>
    </div>
  );
}
