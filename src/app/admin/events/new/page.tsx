import { createClient } from "@/lib/supabase/server";
import { EVENT_STATUS_LABELS } from "@/lib/labels";
import { createEventDirect } from "../actions";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: { error?: string; clientId?: string };
}) {
  const supabase = createClient();
  const { data: allClients } = await supabase
    .from("clients")
    .select("id, first_name, last_name, email")
    .order("first_name");

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 640 }}>
      <div>
        <h1 style={{ margin: 0 }}>Add a booking</h1>
        <p style={{ color: "var(--color-muted)" }}>
          For a client who booked directly with you — by text, call, or in person — rather than
          through the online consultation request. This creates the client (if they&apos;re not
          already in your list) and the event in one step.
        </p>
      </div>

      {searchParams.error && <p style={{ color: "#a33" }}>{searchParams.error}</p>}

      <form action={createEventDirect} className="card" style={{ display: "grid", gap: "1rem" }}>
        <div>
          <label htmlFor="clientId">Client</label>
          <select
            id="clientId"
            name="clientId"
            defaultValue={searchParams.clientId ?? ""}
            style={{
              width: "100%",
              padding: "0.55rem 0.7rem",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
            }}
          >
            <option value="">— New client (fill in below) —</option>
            {(allClients ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.first_name} {c.last_name}
                {c.email ? ` (${c.email})` : ""}
              </option>
            ))}
          </select>
        </div>

        <details>
          <summary style={{ cursor: "pointer" }}>New client details (only if you didn&apos;t pick one above)</summary>
          <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label htmlFor="newFirstName">First name</label>
                <input id="newFirstName" name="newFirstName" />
              </div>
              <div>
                <label htmlFor="newLastName">Last name</label>
                <input id="newLastName" name="newLastName" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label htmlFor="newEmail">Email (optional)</label>
                <input id="newEmail" name="newEmail" type="email" />
              </div>
              <div>
                <label htmlFor="newPhone">Phone (optional)</label>
                <input id="newPhone" name="newPhone" />
              </div>
            </div>
          </div>
        </details>

        <hr style={{ border: "none", borderTop: "1px solid var(--color-border)" }} />

        <div>
          <label htmlFor="name">Event name</label>
          <input id="name" name="name" placeholder="e.g. Smith Birthday" required />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label htmlFor="eventType">Event type</label>
            <input id="eventType" name="eventType" placeholder="e.g. Birthday" />
          </div>
          <div>
            <label htmlFor="status">Status</label>
            <select
              id="status"
              name="status"
              defaultValue="booked"
              style={{
                width: "100%",
                padding: "0.55rem 0.7rem",
                borderRadius: 8,
                border: "1px solid var(--color-border)",
              }}
            >
              {Object.entries(EVENT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p style={{ margin: "-0.5rem 0 0", fontSize: "0.8rem", color: "var(--color-muted)" }}>
          Leave this on &quot;Booked&quot; for a confirmed booking — that&apos;s what makes it show
          up on the staff calendar.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label htmlFor="eventDate">Event date</label>
            <input id="eventDate" name="eventDate" type="date" required />
          </div>
          <div>
            <label htmlFor="guestCount">Guest count</label>
            <input id="guestCount" name="guestCount" type="number" min={1} />
          </div>
        </div>

        <div>
          <label htmlFor="venueName">Venue name</label>
          <input id="venueName" name="venueName" />
        </div>

        <div>
          <label htmlFor="addressLine">Address</label>
          <input id="addressLine" name="addressLine" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
          <div>
            <label htmlFor="city">City</label>
            <input id="city" name="city" />
          </div>
          <div>
            <label htmlFor="state">State</label>
            <input id="state" name="state" />
          </div>
          <div>
            <label htmlFor="zip">ZIP</label>
            <input id="zip" name="zip" />
          </div>
        </div>

        <button type="submit" className="button" style={{ justifySelf: "start" }}>
          Create event
        </button>
      </form>
    </div>
  );
}
