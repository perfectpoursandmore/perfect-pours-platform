"use client";

import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { quickAddEvent } from "../events/actions";
import { openEventQuickView } from "./quickview-bus";

type Client = { id: string; first_name: string; last_name: string | null };

// Sits on the calendar page itself so getting something onto the calendar
// never requires leaving it. Only a name, a date, and a client are required;
// times, guest count and address can be filled in here too or left for
// later. Once it's added, the event's quick view opens so staff can be
// assigned straight away.
export function QuickAddEvent({
  clients,
  defaultDate,
  autoOpen = false,
}: {
  clients: Client[];
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
                  Just enough to hold the date. Times, guests and address are optional; pricing and
                  everything else can wait for the event page.
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
                  Event name
                </label>
                <input
                  id="qa-name"
                  name="name"
                  required
                  placeholder="e.g. Mom's staff holiday party"
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="qa-date" style={{ fontSize: "0.85rem" }}>
                  Date
                </label>
                <input id="qa-date" name="eventDate" type="date" required defaultValue={defaultDate} style={inputStyle} />
              </div>

              <div>
                <label htmlFor="qa-clientId" style={{ fontSize: "0.85rem" }}>
                  Who&apos;s this for
                </label>
                <select id="qa-clientId" name="clientId" defaultValue="" style={inputStyle}>
                  <option value="">+ New — type a name below</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.first_name} {c.last_name ?? ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="qa-newClientName" style={{ fontSize: "0.85rem" }}>
                  New name (skip if you picked someone above)
                </label>
                <input
                  id="qa-newClientName"
                  name="newClientName"
                  placeholder="e.g. Mom, or Mom's staff"
                  style={inputStyle}
                />
              </div>

              <div style={threeCol}>
                <div>
                  <label htmlFor="qa-staffArrivalTime" style={{ fontSize: "0.85rem" }}>
                    Staff arrival
                  </label>
                  <input id="qa-staffArrivalTime" name="staffArrivalTime" type="time" style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="qa-guestArrivalTime" style={{ fontSize: "0.85rem" }}>
                    Event start
                  </label>
                  <input id="qa-guestArrivalTime" name="guestArrivalTime" type="time" style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="qa-staffEndTime" style={{ fontSize: "0.85rem" }}>
                    Staff end
                  </label>
                  <input id="qa-staffEndTime" name="staffEndTime" type="time" style={inputStyle} />
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
                  Address (leave blank to use their home address)
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

              <div>
                <span style={{ display: "block", fontSize: "0.85rem", color: "var(--color-muted)", marginBottom: "0.35rem" }}>
                  Status
                </span>
                <div style={{ display: "grid", gap: "0.35rem" }}>
                  <label style={radioLabel}>
                    <input type="radio" name="status" value="inquiry" defaultChecked />
                    Hold, not confirmed yet
                  </label>
                  <label style={radioLabel}>
                    <input type="radio" name="status" value="booked" />
                    Booked
                  </label>
                </div>
              </div>

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

const threeCol: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem" };
