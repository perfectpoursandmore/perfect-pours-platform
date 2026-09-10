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

type StaffEvent = {
  id: string;
  name: string;
  event_type: string;
  event_date: string;
  venue_name: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  indoor_outdoor: string | null;
  guest_count: number | null;
  staff_arrival_time: string | null;
  guest_arrival_time: string | null;
  staff_end_time: string | null;
  staff_instructions: string | null;
  dress_code: string | null;
  parking_instructions: string | null;
  venue_instructions: string | null;
};

export default async function StaffCalendarPage() {
  const supabase = createClient();
  const user = await getCurrentUser();

  // Only used to bold this person's own assignment among the team on each
  // event — every field read below (events, event_staff, staff directory)
  // is already something this login is allowed to see for EVERY event, per
  // the "staff can read all" policies from Phase 1-2. There is no
  // client-contact, pricing, contract, or payout column in any of these
  // queries — those tables simply have no policy granting staff access.
  const { data: myStaffRow } = user
    ? await supabase.from("staff").select("id").eq("user_id", user.id).single()
    : { data: null };
  const myStaffId = myStaffRow?.id ?? null;

  const todayLocal = new Date().toISOString().slice(0, 10);

  const { data: events } = await supabase
    .from("events")
    .select(
      "id, name, event_type, event_date, venue_name, address_line, city, state, indoor_outdoor, guest_count, staff_arrival_time, guest_arrival_time, staff_end_time, staff_instructions, dress_code, parking_instructions, venue_instructions"
    )
    .eq("status", "booked")
    .gte("event_date", todayLocal)
    .order("event_date", { ascending: true });

  const eventIds = (events ?? []).map((e) => e.id);

  const { data: assignments } = eventIds.length
    ? await supabase
        .from("event_staff")
        .select("id, event_id, role, is_open, arrival_time, staff_id, staff(first_name, last_name)")
        .in("event_id", eventIds)
    : { data: [] };

  const assignmentsByEvent = new Map<string, EventStaffRow[]>();
  for (const row of (assignments ?? []) as (EventStaffRow & { event_id: string })[]) {
    const list = assignmentsByEvent.get(row.event_id) ?? [];
    list.push(row);
    assignmentsByEvent.set(row.event_id, list);
  }

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div>
        <h1 style={{ margin: 0 }}>Upcoming events</h1>
        <p style={{ color: "var(--color-muted)", maxWidth: 620 }}>
          Every booked event shows up here automatically — no individual invitation
          needed. This login can never reach client contact info, pricing, contracts,
          or payments: those live in tables with no database access granted to staff
          at all.
        </p>
      </div>

      {(events ?? []).length === 0 ? (
        <div className="card">
          <p style={{ margin: 0, color: "var(--color-muted)" }}>Nothing booked yet.</p>
        </div>
      ) : (
        (events as StaffEvent[]).map((event) => {
          const staffing = assignmentsByEvent.get(event.id) ?? [];
          const location = [event.venue_name, event.address_line, event.city, event.state]
            .filter(Boolean)
            .join(", ");

          return (
            <div key={event.id} className="card" style={{ display: "grid", gap: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <strong style={{ fontSize: "1.05rem" }}>{event.name}</strong>{" "}
                  <span style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>
                    ({EVENT_TYPE_LABELS[event.event_type] ?? event.event_type})
                  </span>
                </div>
                <span style={{ color: "var(--color-muted)" }}>{formatDate(event.event_date)}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", fontSize: "0.9rem" }}>
                <Field label="Location" value={location || "TBD"} />
                <Field label="Indoor/Outdoor" value={event.indoor_outdoor ?? "—"} />
                <Field label="Guest count" value={event.guest_count ? String(event.guest_count) : "—"} />
                <Field label="Staff arrival" value={formatDateTime(event.staff_arrival_time)} />
                <Field label="Guest arrival" value={formatDateTime(event.guest_arrival_time)} />
                <Field label="Staff end time" value={formatDateTime(event.staff_end_time)} />
                <Field label="Dress code" value={event.dress_code ?? "—"} />
                <Field label="Parking" value={event.parking_instructions ?? "—"} />
              </div>

              {event.venue_instructions && (
                <Field label="Venue instructions" value={event.venue_instructions} />
              )}
              {event.staff_instructions && (
                <Field label="Notes for staff" value={event.staff_instructions} />
              )}

              <div>
                <div style={{ fontSize: "0.8rem", color: "var(--color-muted)", marginBottom: "0.35rem" }}>
                  Staffing
                </div>
                {staffing.length === 0 ? (
                  <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "0.9rem" }}>
                    No one assigned yet.
                  </p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "grid", gap: "0.25rem" }}>
                    {staffing.map((row) => {
                      const person = Array.isArray(row.staff) ? row.staff[0] : row.staff;
                      const isMe = myStaffId && row.staff_id === myStaffId;
                      return (
                        <li key={row.id} style={{ fontSize: "0.9rem" }}>
                          <span style={{ textTransform: "capitalize" }}>{row.role}</span>:{" "}
                          {row.is_open && !row.staff_id ? (
                            <span style={{ color: "var(--color-accent)" }}>Open — let Faith know if you can cover it</span>
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
        })
      )}
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
