import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { EVENT_TYPE_LABELS, formatDate, formatDateTime } from "@/lib/labels";
import { todayDateString } from "@/lib/calendar-dates";

type EventSummary = {
  id: string;
  name: string;
  event_type: string;
  event_date: string;
  venue_name: string | null;
  city: string | null;
  state: string | null;
  status: string;
  staff_arrival_time: string | null;
};

type MyShiftRow = {
  id: string;
  role: string;
  arrival_time: string | null;
  event: EventSummary | EventSummary[] | null;
};

type Shift = {
  id: string;
  role: string;
  arrival_time: string | null;
  event: EventSummary;
};

// Same access boundary as the calendar this is a tab next to: no client
// contact info, pricing, contracts, or payments — just this person's own
// confirmed assignments, pulled straight from event_staff filtered to
// their own staff_id (unlike the team calendar, which deliberately shows
// everyone's events).
export default async function MyShiftsPage() {
  const supabase = createClient();
  const user = await getCurrentUser();

  const { data: myStaffRow } = user
    ? await supabase.from("staff").select("id").eq("user_id", user.id).single()
    : { data: null };
  const myStaffId = myStaffRow?.id ?? null;

  const { data: rows } = myStaffId
    ? await supabase
        .from("event_staff")
        .select(
          "id, role, arrival_time, event:events(id, name, event_type, event_date, venue_name, city, state, status, staff_arrival_time)"
        )
        .eq("staff_id", myStaffId)
    : { data: [] };

  const shifts: Shift[] = ((rows ?? []) as MyShiftRow[])
    .map((row) => {
      const event = Array.isArray(row.event) ? row.event[0] : row.event;
      if (!event || event.status !== "booked") return null;
      return { id: row.id, role: row.role, arrival_time: row.arrival_time, event };
    })
    .filter((s): s is Shift => s !== null)
    .sort((a, b) => a.event.event_date.localeCompare(b.event.event_date));

  const today = todayDateString();
  const upcoming = shifts.filter((s) => s.event.event_date >= today);
  const past = shifts.filter((s) => s.event.event_date < today).reverse();

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div>
        <h1 style={{ margin: 0 }}>My shifts</h1>
        <p style={{ color: "var(--color-muted)", margin: "0.25rem 0 0" }}>
          Every event you&apos;re confirmed to work.
        </p>
      </div>

      {upcoming.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0, color: "var(--color-muted)" }}>
            Nothing on the books for you yet — check the calendar for open shifts.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {upcoming.map((shift) => (
            <ShiftCard key={shift.id} shift={shift} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--color-muted)", fontSize: "0.9rem" }}>
            Past shifts ({past.length})
          </summary>
          <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
            {past.map((shift) => (
              <ShiftCard key={shift.id} shift={shift} muted />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ShiftCard({ shift, muted }: { shift: Shift; muted?: boolean }) {
  const { event } = shift;
  const location = [event.venue_name, event.city, event.state].filter(Boolean).join(", ");
  const arrival = shift.arrival_time ?? event.staff_arrival_time;

  const detailParts: string[] = [];
  if (arrival) detailParts.push(`Arrive ${formatDateTime(arrival)}`);
  if (location) detailParts.push(location);
  if (detailParts.length === 0) detailParts.push("Details on the event page");

  return (
    <Link
      href={`/staff/events/${event.id}`}
      className="card"
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        opacity: muted ? 0.65 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 600 }}>{event.name}</div>
          <div style={{ fontSize: "0.85rem", color: "var(--color-muted)" }}>
            {EVENT_TYPE_LABELS[event.event_type] ?? event.event_type} — {formatDate(event.event_date)}
          </div>
        </div>
        <div style={{ fontSize: "0.8rem", textTransform: "capitalize", color: "var(--color-accent)", fontWeight: 600 }}>
          {shift.role}
        </div>
      </div>

      <div style={{ fontSize: "0.85rem", color: "var(--color-muted)", marginTop: "0.5rem" }}>
        {detailParts.join(" — ")}
      </div>
    </Link>
  );
}
