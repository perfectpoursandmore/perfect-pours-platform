import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { EVENT_TYPE_LABELS, formatDate, formatDateTime } from "@/lib/labels";

type EventStaffRow = {
  id: string;
  role: string;
  is_open: boolean;
  arrival_time: string | null;
  staff_id: string | null;
  staff: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
};

// Same access boundary as the calendar this links from: no client contact
// info, pricing, contracts, or payments — those tables grant staff no
// access at all, so there's nothing here to accidentally over-select.
export default async function StaffEventDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const user = await getCurrentUser();

  const { data: myStaffRow } = user
    ? await supabase.from("staff").select("id").eq("user_id", user.id).single()
    : { data: null };
  const myStaffId = myStaffRow?.id ?? null;

  const { data: event } = await supabase
    .from("events")
    .select(
      "id, name, event_type, event_date, venue_name, address_line, city, state, guest_count, staff_arrival_time, guest_arrival_time, staff_end_time, staff_instructions, status"
    )
    .eq("id", params.id)
    .single();

  // Only booked events are ever shown on the staff calendar — an inquiry
  // that never became a real booking, or one that later got cancelled,
  // isn't something this login should be able to browse to directly either.
  if (!event || event.status !== "booked") notFound();

  const { data: staffing } = await supabase
    .from("event_staff")
    .select("id, role, is_open, arrival_time, staff_id, staff(first_name, last_name)")
    .eq("event_id", event.id);

  const location = [event.venue_name, event.address_line, event.city, event.state].filter(Boolean).join(", ");

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 640 }}>
      <Link href="/staff" style={{ fontSize: "0.9rem" }}>
        ← Back to calendar
      </Link>

      <div>
        <h1 style={{ margin: 0 }}>{event.name}</h1>
        <p style={{ color: "var(--color-muted)", margin: "0.25rem 0 0" }}>
          {EVENT_TYPE_LABELS[event.event_type] ?? event.event_type} — {formatDate(event.event_date)}
        </p>
      </div>

      <div className="card" style={{ display: "grid", gap: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", fontSize: "0.9rem" }}>
          <Field label="Location" value={location || "TBD"} />
          <Field label="Guest count" value={event.guest_count ? String(event.guest_count) : "—"} />
          <Field label="Staff arrival" value={formatDateTime(event.staff_arrival_time)} />
          <Field label="Guest arrival" value={formatDateTime(event.guest_arrival_time)} />
          <Field label="Staff end time" value={formatDateTime(event.staff_end_time)} />
        </div>

        {event.staff_instructions && <Field label="Notes for staff" value={event.staff_instructions} />}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Staffing</h2>
        {!staffing || staffing.length === 0 ? (
          <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "0.9rem" }}>No one assigned yet.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "grid", gap: "0.4rem" }}>
            {(staffing as EventStaffRow[]).map((row) => {
              const person = Array.isArray(row.staff) ? row.staff[0] : row.staff;
              const isMe = myStaffId && row.staff_id === myStaffId;
              return (
                <li key={row.id} style={{ fontSize: "0.9rem" }}>
                  <span style={{ textTransform: "capitalize" }}>{row.role}</span>:{" "}
                  {row.is_open && !row.staff_id ? (
                    <span style={{ color: "var(--color-muted)" }}>Open</span>
                  ) : person ? (
                    <span style={{ fontWeight: isMe ? 700 : 400 }}>
                      {person.first_name} {person.last_name}
                      {isMe ? " (you)" : ""}
                    </span>
                  ) : (
                    <span style={{ color: "var(--color-muted)" }}>Unassigned</span>
                  )}
                  {row.arrival_time && (
                    <span style={{ color: "var(--color-muted)" }}> — arrive {formatDateTime(row.arrival_time)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}
