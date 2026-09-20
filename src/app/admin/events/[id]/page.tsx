import { createClient } from "@/lib/supabase/server";
import { EVENT_STATUS_LABELS } from "@/lib/labels";
import { timeOfDayInZone } from "@/lib/calendar-dates";
import { updateEventOverview, reassignEventClient, createClientAndAssignToEvent, deleteEvent } from "../actions";
import { DeleteEventButton } from "../DeleteEventButton";

export default async function EventOverviewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const supabase = createClient();
  const { data: event } = await supabase.from("events").select("*").eq("id", params.id).single();

  if (!event) return null;

  const { data: allClients } = await supabase
    .from("clients")
    .select("id, first_name, last_name, email")
    .order("first_name");

  return (
    <>
      {searchParams.error && <p style={{ color: "#a33" }}>{searchParams.error}</p>}

      <div className="card" style={{ display: "grid", gap: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Client for this event</h2>
        <p style={{ margin: 0, color: "var(--color-muted)" }}>
          Wrong person attached to this event? Pick the right one, or if they&apos;re not in your
          list at all yet, add them below — only this event moves, nothing else on the current
          client changes.
        </p>

        <form
          action={reassignEventClient}
          style={{ display: "flex", gap: "0.75rem", alignItems: "end" }}
        >
          <input type="hidden" name="eventId" value={event.id} />
          <div style={{ flex: 1 }}>
            <label htmlFor="clientId">Client</label>
            <select
              id="clientId"
              name="clientId"
              defaultValue={event.client_id}
              style={{ width: "100%", padding: "0.55rem 0.7rem", borderRadius: 8, border: "1px solid var(--color-border)" }}
            >
              {(allClients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name}
                  {c.email ? ` (${c.email})` : ""}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="button">
            Save
          </button>
        </form>

        <details>
          <summary style={{ cursor: "pointer" }}>This client isn&apos;t in the list — add a new one</summary>
          <form
            action={createClientAndAssignToEvent}
            style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}
          >
            <input type="hidden" name="eventId" value={event.id} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label htmlFor="newFirstName">First name</label>
                <input id="newFirstName" name="firstName" required />
              </div>
              <div>
                <label htmlFor="newLastName">Last name</label>
                <input id="newLastName" name="lastName" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label htmlFor="newEmail">Email (optional)</label>
                <input id="newEmail" name="email" type="email" />
              </div>
              <div>
                <label htmlFor="newPhone">Phone (optional)</label>
                <input id="newPhone" name="phone" />
              </div>
            </div>
            <button type="submit" className="button" style={{ justifySelf: "start" }}>
              Create client &amp; move this event to them
            </button>
          </form>
        </details>
      </div>

      <form action={updateEventOverview} className="card" style={{ display: "grid", gap: "1rem" }}>
        <input type="hidden" name="id" value={event.id} />

      <div>
        <label htmlFor="name">Event name</label>
        <input id="name" name="name" defaultValue={event.name} required />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div>
          <label htmlFor="eventType">Event type</label>
          <input id="eventType" name="eventType" defaultValue={event.event_type} required />
        </div>
        <div>
          <label htmlFor="status">Status</label>
          <select
            id="status"
            name="status"
            defaultValue={event.status}
            style={{ width: "100%", padding: "0.55rem 0.7rem", borderRadius: 8, border: "1px solid var(--color-border)" }}
          >
            {Object.entries(EVENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div>
          <label htmlFor="eventDate">Event date</label>
          <input id="eventDate" name="eventDate" type="date" defaultValue={event.event_date} required />
        </div>
        <div>
          <label htmlFor="guestCount">Guest count</label>
          <input id="guestCount" name="guestCount" type="number" min={1} defaultValue={event.guest_count ?? ""} />
        </div>
      </div>

      <div>
        <label htmlFor="venueName">Venue name</label>
        <input id="venueName" name="venueName" defaultValue={event.venue_name ?? ""} />
      </div>

      <div>
        <label htmlFor="addressLine">Address</label>
        <input id="addressLine" name="addressLine" defaultValue={event.address_line ?? ""} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
        <div>
          <label htmlFor="city">City</label>
          <input id="city" name="city" defaultValue={event.city ?? ""} />
        </div>
        <div>
          <label htmlFor="state">State</label>
          <input id="state" name="state" defaultValue={event.state ?? ""} />
        </div>
        <div>
          <label htmlFor="zip">ZIP</label>
          <input id="zip" name="zip" defaultValue={event.zip ?? ""} />
        </div>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid var(--color-border)" }} />
      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-muted)" }}>
        The fields below are what staff see on their calendar — never client contact info or
        pricing.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
        <div>
          <label htmlFor="staffArrivalTime">Staff arrival time</label>
          <input
            id="staffArrivalTime"
            name="staffArrivalTime"
            type="time"
            defaultValue={timeOfDayInZone(event.staff_arrival_time)}
          />
        </div>
        <div>
          <label htmlFor="guestArrivalTime">Event start (guest arrival)</label>
          <input
            id="guestArrivalTime"
            name="guestArrivalTime"
            type="time"
            defaultValue={timeOfDayInZone(event.guest_arrival_time)}
          />
        </div>
        <div>
          <label htmlFor="staffEndTime">Staff end time</label>
          <input
            id="staffEndTime"
            name="staffEndTime"
            type="time"
            defaultValue={timeOfDayInZone(event.staff_end_time)}
          />
        </div>
      </div>

      <div>
        <label htmlFor="staffInstructions">Operational notes for staff</label>
        <textarea
          id="staffInstructions"
          name="staffInstructions"
          rows={3}
          defaultValue={event.staff_instructions ?? ""}
          style={{
            width: "100%",
            padding: "0.55rem 0.7rem",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            fontFamily: "inherit",
            fontSize: "0.95rem",
          }}
        />
      </div>

      <button type="submit" className="button" style={{ justifySelf: "start" }}>
        Save
      </button>
    </form>

      <div className="card" style={{ display: "grid", gap: "0.75rem", borderColor: "#a33" }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem", color: "#a33" }}>Delete event</h2>
        <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "0.9rem" }}>
          For an accidental duplicate or a mistake — this permanently removes the event and
          everything tied to it (staffing, proposal, contract). For a real cancellation, use the
          Status dropdown above instead, so you keep a record of it.
        </p>
        <form action={deleteEvent}>
          <input type="hidden" name="id" value={event.id} />
          <DeleteEventButton eventName={event.name} />
        </form>
      </div>
    </>
  );
}
