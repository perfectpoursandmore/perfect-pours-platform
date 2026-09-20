import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER, EVENT_TYPE_LABELS, formatDate, formatDateTime } from "@/lib/labels";
import { updateLeadStatus, convertLeadToClientAndEvent, deleteLead } from "../actions";
import { DeleteLeadButton } from "../DeleteLeadButton";

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const supabase = createClient();
  const { data: lead } = await supabase.from("leads").select("*").eq("id", params.id).single();

  if (!lead) notFound();

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 640 }}>
      <div>
        <a href="/admin/leads" style={{ fontSize: "0.9rem" }}>
          ← All leads
        </a>
        <h1 style={{ margin: "0.5rem 0 0" }}>
          {lead.first_name} {lead.last_name}
        </h1>
      </div>

      {searchParams.error && <p style={{ color: "#a33" }}>{searchParams.error}</p>}

      <div className="card" style={{ display: "grid", gap: "0.5rem" }}>
        <Row label="Email" value={lead.email} />
        <Row label="Phone" value={lead.phone} />
        <Row label="Event type" value={EVENT_TYPE_LABELS[lead.event_type] ?? lead.event_type} />
        <Row label="Event date" value={formatDate(lead.event_date)} />
        <Row label="Venue / address" value={lead.venue_or_address ?? "—"} />
        <Row label="Guest count" value={lead.guest_count ? String(lead.guest_count) : "—"} />
        <Row label="How they heard about us" value={lead.how_heard ?? "—"} />
        <Row label="Consultation" value={formatDateTime(lead.consultation_at)} />
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Status</h2>
        <form action={updateLeadStatus} style={{ display: "flex", gap: "0.75rem" }}>
          <input type="hidden" name="id" value={lead.id} />
          <select
            name="status"
            defaultValue={lead.status}
            style={{ padding: "0.5rem 0.7rem", borderRadius: 8, border: "1px solid var(--color-border)" }}
          >
            {LEAD_STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {LEAD_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <button type="submit" className="button">
            Update
          </button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Client &amp; event record</h2>
        {lead.event_id ? (
          <p>
            Already converted —{" "}
            <a href={`/admin/events/${lead.event_id}`}>view the event record</a>.
          </p>
        ) : (
          <>
            <p style={{ color: "var(--color-muted)" }}>
              Once you've had the consultation, turn this lead into a real client and event
              record so you can start building a proposal.
            </p>
            <form action={convertLeadToClientAndEvent}>
              <input type="hidden" name="id" value={lead.id} />
              <button type="submit" className="button">
                Create client &amp; event record
              </button>
            </form>
          </>
        )}
      </div>

      {!lead.event_id && !lead.client_id && (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Delete this lead</h2>
          <p style={{ color: "var(--color-muted)", fontSize: "0.9rem" }}>
            For test submissions, duplicates, or spam that came through the public form --
            not for a real inquiry you&apos;ve just decided not to pursue (use a status like
            &quot;Lost / Did Not Book&quot; for that instead, so it stays in your records).
          </p>
          <form action={deleteLead}>
            <input type="hidden" name="id" value={lead.id} />
            <DeleteLeadButton leadName={`${lead.first_name} ${lead.last_name}`} />
          </form>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "1rem" }}>
      <span style={{ color: "var(--color-muted)" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
