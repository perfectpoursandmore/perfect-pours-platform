import { createClient } from "@/lib/supabase/server";
import { EVENT_TYPE_LABELS, EVENT_STATUS_LABELS } from "@/lib/labels";
import { updateEventOverview } from "../actions";

export default async function EventOverviewPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: event } = await supabase.from("events").select("*").eq("id", params.id).single();

  if (!event) return null;

  return (
    <form action={updateEventOverview} className="card" style={{ display: "grid", gap: "1rem" }}>
      <input type="hidden" name="id" value={event.id} />

      <div>
        <label htmlFor="name">Event name</label>
        <input id="name" name="name" defaultValue={event.name} required />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div>
          <label htmlFor="eventType">Event type</label>
          <select
            id="eventType"
            name="eventType"
            defaultValue={event.event_type}
            style={{ width: "100%", padding: "0.55rem 0.7rem", borderRadius: 8, border: "1px solid var(--color-border)" }}
          >
            {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
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

      <div>
        <label htmlFor="indoorOutdoor">Indoor / outdoor</label>
        <select
          id="indoorOutdoor"
          name="indoorOutdoor"
          defaultValue={event.indoor_outdoor ?? ""}
          style={{ width: "100%", padding: "0.55rem 0.7rem", borderRadius: 8, border: "1px solid var(--color-border)" }}
        >
          <option value="">Not set</option>
          <option value="indoor">Indoor</option>
          <option value="outdoor">Outdoor</option>
          <option value="both">Both</option>
        </select>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid var(--color-border)" }} />
      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-muted)" }}>
        The fields below are what staff see on their calendar — never client contact info or
        pricing.
      </p>

      <div>
        <label htmlFor="dressCode">Dress code</label>
        <input id="dressCode" name="dressCode" defaultValue={event.dress_code ?? ""} />
      </div>
      <div>
        <label htmlFor="parkingInstructions">Parking instructions</label>
        <input id="parkingInstructions" name="parkingInstructions" defaultValue={event.parking_instructions ?? ""} />
      </div>
      <div>
        <label htmlFor="venueInstructions">Venue instructions</label>
        <input id="venueInstructions" name="venueInstructions" defaultValue={event.venue_instructions ?? ""} />
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
  );
}
