import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { EVENT_TYPE_LABELS, formatDate } from "@/lib/labels";
import { respondToAvailability, respondToDayAvailability } from "./actions";

type EventShape = {
  id: string;
  name: string;
  event_type: string;
  event_date: string;
  venue_name: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
};

type InviteRow = {
  id: string;
  status: string;
  responded_at: string | null;
  event: EventShape | EventShape[] | null;
};

type DayRow = {
  id: string;
  date: string;
  status: string;
  responded_at: string | null;
};

export default async function StaffAvailabilityPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = createClient();
  const user = await getCurrentUser();

  const { data: staffRow } = user
    ? await supabase.from("staff").select("id").eq("user_id", user.id).single()
    : { data: null };

  const [{ data: invites }, { data: dayInvites }] = staffRow
    ? await Promise.all([
        supabase
          .from("event_staff_invites")
          .select(
            "id, status, responded_at, event:event_id(id, name, event_type, event_date, venue_name, address_line, city, state)"
          )
          .eq("staff_id", staffRow.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("staff_date_availability")
          .select("id, date, status, responded_at")
          .eq("staff_id", staffRow.id)
          .order("date", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  const rows = (invites ?? []) as InviteRow[];
  const pending = rows.filter((i) => i.status === "pending");
  const answered = rows.filter((i) => i.status !== "pending");

  const dayRows = (dayInvites ?? []) as DayRow[];
  const dayPending = dayRows.filter((d) => d.status === "pending");
  const dayAnswered = dayRows.filter((d) => d.status !== "pending");

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      {searchParams.error && <p style={{ color: "#a33", margin: 0 }}>{searchParams.error}</p>}

      <div>
        <h1 style={{ margin: 0 }}>Availability requests</h1>
        <p style={{ color: "var(--color-muted)", maxWidth: 620 }}>
          Saying yes doesn&apos;t put you on the schedule by itself — Faith picks who&apos;s
          actually working once she&apos;s heard back from everyone she asked. If you&apos;re
          confirmed, it&apos;ll show up under &quot;Staffing&quot; on the calendar with your name on it.
        </p>
      </div>

      {dayPending.length > 0 && (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Are you free these days?</h2>
          {dayPending.map((day) => (
            <div key={day.id} className="card" style={{ display: "grid", gap: "0.75rem" }}>
              <strong style={{ fontSize: "1.05rem" }}>{formatDate(day.date)}</strong>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <form action={respondToDayAvailability}>
                  <input type="hidden" name="id" value={day.id} />
                  <input type="hidden" name="status" value="available" />
                  <button type="submit" className="button">
                    Yes, I&apos;m available
                  </button>
                </form>
                <form action={respondToDayAvailability}>
                  <input type="hidden" name="id" value={day.id} />
                  <input type="hidden" name="status" value="unavailable" />
                  <button
                    type="submit"
                    style={{
                      background: "none",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      padding: "0.55rem 1rem",
                      cursor: "pointer",
                    }}
                  >
                    Not available
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      {pending.length === 0 ? (
        dayPending.length === 0 && (
          <div className="card">
            <p style={{ margin: 0, color: "var(--color-muted)" }}>No open requests right now.</p>
          </div>
        )
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {pending.length > 0 && dayPending.length > 0 && (
            <h2 style={{ fontSize: "1rem", margin: 0 }}>Specific events</h2>
          )}
          {pending.map((invite) => {
            const event = Array.isArray(invite.event) ? invite.event[0] : invite.event;
            if (!event) return null;
            const location = [event.venue_name, event.address_line, event.city, event.state]
              .filter(Boolean)
              .join(", ");

            return (
              <div key={invite.id} className="card" style={{ display: "grid", gap: "0.75rem" }}>
                <div>
                  <strong style={{ fontSize: "1.05rem" }}>{event.name}</strong>{" "}
                  <span style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>
                    ({EVENT_TYPE_LABELS[event.event_type] ?? event.event_type})
                  </span>
                  <div style={{ color: "var(--color-muted)" }}>
                    {formatDate(event.event_date)}
                    {location ? ` — ${location}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <form action={respondToAvailability}>
                    <input type="hidden" name="inviteId" value={invite.id} />
                    <input type="hidden" name="status" value="available" />
                    <button type="submit" className="button">
                      Yes, I&apos;m available
                    </button>
                  </form>
                  <form action={respondToAvailability}>
                    <input type="hidden" name="inviteId" value={invite.id} />
                    <input type="hidden" name="status" value="unavailable" />
                    <button
                      type="submit"
                      style={{
                        background: "none",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        padding: "0.55rem 1rem",
                        cursor: "pointer",
                      }}
                    >
                      Not available
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(dayAnswered.length > 0 || answered.length > 0) && (
        <div>
          <h2 style={{ fontSize: "1rem" }}>Already answered</h2>
          <div className="card" style={{ padding: 0 }}>
            {dayAnswered.map((day) => (
              <div
                key={day.id}
                style={{
                  padding: "0.75rem 1rem",
                  borderBottom: "1px solid var(--color-border)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <span>{formatDate(day.date)} (whole day)</span>
                <span style={{ color: day.status === "available" ? "#2a7a2a" : "var(--color-muted)" }}>
                  {day.status === "available" ? "You said yes" : "You said no"}
                </span>
              </div>
            ))}
            {answered.map((invite) => {
              const event = Array.isArray(invite.event) ? invite.event[0] : invite.event;
              if (!event) return null;
              return (
                <div
                  key={invite.id}
                  style={{
                    padding: "0.75rem 1rem",
                    borderBottom: "1px solid var(--color-border)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                    flexWrap: "wrap",
                  }}
                >
                  <span>
                    {event.name} — {formatDate(event.event_date)}
                  </span>
                  <span style={{ color: invite.status === "available" ? "#2a7a2a" : "var(--color-muted)" }}>
                    {invite.status === "available" ? "You said yes" : "You said no"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
