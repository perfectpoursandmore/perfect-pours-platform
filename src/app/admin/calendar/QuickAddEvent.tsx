"use client";

import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { quickAddEvent } from "../events/actions";

type Client = { id: string; first_name: string; last_name: string | null };

// Sits on the calendar page itself so getting something onto the calendar
// never requires leaving it. Only asks for what the database actually
// needs (a name, a date, and a client) -- everything else on the full
// event page (address, pricing, timing, staff) is left for later.
export function QuickAddEvent({ clients, defaultDate }: { clients: Client[]; defaultDate: string }) {
  const [open, setOpen] = useState(false);
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
                  Just enough to hold the date — add pricing, address, and everything else later
                  from the event page.
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

            {error && <p style={{ margin: 0, color: "#a33", fontSize: "0.9rem" }}>{error}</p>}

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

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.7rem",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
};
