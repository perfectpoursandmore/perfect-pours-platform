import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, EVENT_TYPE_LABELS } from "@/lib/labels";
import { requestDayAvailability, withdrawDayAvailabilityRequest } from "../actions";

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting to hear back",
  available: "Said yes",
  unavailable: "Said no",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "var(--color-muted)",
  available: "#2a7a2a",
  unavailable: "#a33",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default async function StaffAvailabilityPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const supabase = createClient();
  const date = searchParams.date || todayISO();

  const [{ data: eventsOnDate }, { data: activeStaff }, { data: responses }] = await Promise.all([
    supabase
      .from("events")
      .select("id, name, event_type, status")
      .eq("event_date", date)
      .order("name"),
    supabase.from("staff").select("id, first_name, last_name").eq("active", true).order("first_name"),
    supabase
      .from("staff_date_availability")
      .select("id, status, responded_at, staff_id, staff:staff_id(first_name, last_name)")
      .eq("date", date)
      .order("created_at"),
  ]);

  const respondedStaffIds = new Set((responses ?? []).map((r) => r.staff_id));

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div>
        <h1 style={{ margin: 0 }}>Staff availability</h1>
        <p style={{ color: "var(--color-muted)", maxWidth: 620 }}>
          Ask who&apos;s free on a whole day, once — instead of asking separately for every
          event booked that day. Once people answer, go assign them on whichever event(s) they&apos;re
          working from that event&apos;s Staff tab.
        </p>
      </div>

      <div className="card">
        <form method="get" style={{ display: "flex", alignItems: "end", gap: "0.75rem" }}>
          <div>
            <label htmlFor="date">Date</label>
            <input
              id="date"
              name="date"
              type="date"
              defaultValue={date}
              style={{ padding: "0.55rem 0.7rem", borderRadius: 8, border: "1px solid var(--color-border)" }}
            />
          </div>
          <button type="submit" className="button">
            Go
          </button>
        </form>

        {eventsOnDate && eventsOnDate.length > 0 ? (
          <div style={{ marginTop: "1rem" }}>
            <p style={{ margin: "0 0 0.4rem", fontSize: "0.9rem", color: "var(--color-muted)" }}>
              {eventsOnDate.length} event{eventsOnDate.length === 1 ? "" : "s"} on {formatDate(date)}:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.3rem" }}>
              {eventsOnDate.map((e) => (
                <li key={e.id} style={{ fontSize: "0.9rem" }}>
                  <a href={`/admin/events/${e.id}/staff`}>{e.name}</a>{" "}
                  <span style={{ color: "var(--color-muted)" }}>
                    ({EVENT_TYPE_LABELS[e.event_type] ?? e.event_type})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p style={{ marginTop: "1rem", color: "var(--color-muted)", fontSize: "0.9rem" }}>
            No events booked on {formatDate(date)} yet.
          </p>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Ask who&apos;s available on {formatDate(date)}</h2>
        <form action={requestDayAvailability} style={{ display: "grid", gap: "0.75rem" }}>
          <input type="hidden" name="date" value={date} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
            {(activeStaff ?? []).map((s) => (
              <label key={s.id} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem" }}>
                <input type="checkbox" name="staffIds" value={s.id} defaultChecked={!respondedStaffIds.has(s.id)} />
                {s.first_name} {s.last_name}
                {respondedStaffIds.has(s.id) && (
                  <span style={{ color: "var(--color-muted)", fontSize: "0.8rem" }}>(already asked)</span>
                )}
              </label>
            ))}
          </div>
          <button type="submit" className="button" style={{ justifySelf: "start" }}>
            Send availability request
          </button>
        </form>

        {responses && responses.length > 0 && (
          <div style={{ marginTop: "1rem", display: "grid", gap: "0.5rem" }}>
            {responses.map((r) => {
              const person = Array.isArray(r.staff) ? r.staff[0] : r.staff;
              return (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.9rem",
                    borderTop: "1px solid var(--color-border)",
                    paddingTop: "0.5rem",
                  }}
                >
                  <span>
                    {person ? `${person.first_name} ${person.last_name}` : "—"} —{" "}
                    <span style={{ color: STATUS_COLOR[r.status] ?? "var(--color-muted)" }}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                    {r.responded_at && (
                      <span style={{ color: "var(--color-muted)" }}> ({formatDateTime(r.responded_at)})</span>
                    )}
                  </span>
                  <form action={withdrawDayAvailabilityRequest}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="date" value={date} />
                    <button
                      type="submit"
                      style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
