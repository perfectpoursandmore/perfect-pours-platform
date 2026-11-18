"use client";

import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { quickAddEvent } from "../events/actions";
import { openEventQuickView } from "./quickview-bus";
import { EVENT_TYPE_LABELS } from "@/lib/labels";

// Sits on the calendar page itself so getting something onto the calendar
// never requires leaving it. Only a name and a date are required: the name
// doubles as the client (matched to an existing client by first + last
// name). Event type is optional; everything else is tucked under "More
// details". Times are typed the quick way ("3" = 3 PM). Once it's added, the event's quick view opens so staff can be
// assigned straight away.
export function QuickAddEvent({
  defaultDate,
  autoOpen = false,
}: {
  defaultDate: string;
  autoOpen?: boolean; // the Home Screen app opens straight into this
}) {
  const [open, setOpen] = useState(autoOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = e.currentTarget;
    try {
      const formData = new FormData(form);
      const result = await quickAddEvent(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      form.reset();
      setOpen(false);
      openEventQuickView(result.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="button" onClick={() => setOpen(true)}>
        + Quick add
      </button>

      {open && (
        <div
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(31, 27, 22, 0.45)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "5vh 1rem",
            zIndex: 1000,
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: "100%", maxWidth: 460, display: "grid", gap: "1rem" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "1rem" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Quick add an event</h2>
                <p style={{ margin: "0.25rem 0 0", color: "var(--color-muted)", fontSize: "0.85rem" }}>
                  A name and a date is all it needs.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.3rem",
                  lineHeight: 1,
                  cursor: "pointer",
                  color: "var(--color-muted)",
                  padding: "0.2rem",
                }}
              >
                ×
              </button>
            </div>

            {error && <p style={{ margin: 0, color: "var(--color-danger)", fontSize: "0.9rem" }}>{error}</p>}

            <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.85rem" }}>
              <div>
                <label htmlFor="qa-name" style={{ fontSize: "0.85rem" }}>
                  Event / client name
                </label>
                <input id="qa-name" name="name" required placeholder="e.g. Jane Doe" autoComplete="off" style={inputStyle} />
                <span style={hint}>If this matches a client&apos;s first and last name, it goes under them.</span>
              </div>

              <div style={twoCol}>
                <div>
                  <label htmlFor="qa-date" style={{ fontSize: "0.85rem" }}>
                    Date
                  </label>
                  <input id="qa-date" name="eventDate" type="date" required defaultValue={defaultDate} style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="qa-guestArrivalTime" style={{ fontSize: "0.85rem" }}>
                    Start time
                  </label>
                  <input id="qa-guestArrivalTime" name="guestArrivalTime" placeholder="e.g. 3 or 3:30" autoComplete="off" style={inputStyle} />
                </div>
              </div>

              <div>
                <label htmlFor="qa-eventType" style={{ fontSize: "0.85rem" }}>
                  Event type (optional)
                </label>
                <select id="qa-eventType" name="eventType" defaultValue="" style={inputStyle}>
                  <option value="">Skip</option>
                  {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <details>
                <summary style={{ fontSize: "0.9rem", color: "var(--color-muted)" }}>More details (optional)</summary>
                <div style={{ display: "grid", gap: "0.85rem", marginTop: "0.75rem" }}>
                  <div style={twoCol}>
                    <div>
                      <label htmlFor="qa-staffArrivalTime" style={{ fontSize: "0.85rem" }}>
                        Staff arrival
                      </label>
                      <input id="qa-staffArrivalTime" name="staffArrivalTime" placeholder="e.g. 2" autoComplete="off" style={inputStyle} />
                    </div>
                    <div>
                      <label htmlFor="qa-staffEndTime" style={{ fontSize: "0.85rem" }}>
                        Staff end
                      </label>
                      <input id="qa-staffEndTime" name="staffEndTime" placeholder="e.g. 9:30" autoComplete="off" style={inputStyle} />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="qa-guestCount" style={{ fontSize: "0.85rem" }}>
                      Guest count
                    </label>
                    <input id="qa-guestCount" name="guestCount" type="number" min={1} style={inputStyle} />
                  </div>

                  <div>
                    <label htmlFor="qa-addressLine" style={{ fontSize: "0.85rem" }}>
                      Address (blank = their home address)
                    </label>
                    <input id="qa-addressLine" name="addressLine" style={inputStyle} />
                  </div>

                  <div style={threeCol}>
                    <div>
                      <label htmlFor="qa-city" style={{ fontSize: "0.85rem" }}>
                        City
                      </label>
                      <input id="qa-city" name="city" style={inputStyle} />
                    </div>
                    <div>
                      <label htmlFor="qa-state" style={{ fontSize: "0.85rem" }}>
                        State
                      </label>
                      <input id="qa-state" name="state" style={inputStyle} />
                    </div>
                    <div>
                      <label htmlFor="qa-zip" style={{ fontSize: "0.85rem" }}>
                        ZIP
                      </label>
                      <input id="qa-zip" name="zip" style={inputStyle} />
                    </div>
                  </div>

                  <label style={radioLabel}>
                    <input type="checkbox" name="status" value="booked" />
                    Already booked (otherwise it&apos;s a hold)
                  </label>
                </div>
              </details>

              <p style={{ ...hint, margin: 0 }}>Times: 3 means 3:00 PM, 3:30 means 3:30 PM. Add &quot;am&quot; for morning.</p>

              <button type="submit" className="button" disabled={busy} style={{ justifySelf: "start" }}>
                {busy ? "Adding…" : "Add to calendar"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const radioLabel: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  margin: 0,
  color: "var(--color-text)",
  fontSize: "0.95rem",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.7rem",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
};

const twoCol: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" };

const hint: CSSProperties = { display: "block", fontSize: "0.8rem", color: "var(--color-muted)", marginTop: "0.25rem" };

const threeCol: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem" };
