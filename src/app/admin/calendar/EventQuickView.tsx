"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { EVENT_STATUS_LABELS, EVENT_TYPE_LABELS, formatDate } from "@/lib/labels";
import { assignStaffToEvent, removeEventStaffAssignment, updateEventStaffRole } from "../events/actions";
import { QUICKVIEW_OPEN_EVENT } from "./quickview-bus";

// Keep in sync with ROLE_OPTIONS on the full Staff tab
// (src/app/admin/events/[id]/staff/page.tsx) -- same three roles, just
// duplicated here so this modal doesn't need to import a server page.
const ROLE_OPTIONS = ["bartender", "server", "barback"];

type QuickViewEvent = {
  id: string;
  name: string;
  event_type: string;
  event_date: string;
  venue_name: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  guest_count: number | null;
  status: string;
  client: { first_name: string; last_name: string } | null;
  client_id: string | null;
};

type Assignment = {
  id: string;
  role: string;
  is_open: boolean;
  staff_id: string | null;
  staff: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
};

type ActiveStaff = { id: string; first_name: string; last_name: string };

type QuickViewData = {
  event: QuickViewEvent;
  assignments: Assignment[];
  activeStaff: ActiveStaff[];
};

export function EventQuickView() {
  const [eventId, setEventId] = useState<string | null>(null);
  const [data, setData] = useState<QuickViewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/events/${id}/quickview`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't load that event.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load that event.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ eventId: string }>).detail;
      if (!detail?.eventId) return;
      setEventId(detail.eventId);
      void load(detail.eventId);
    }
    window.addEventListener(QUICKVIEW_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(QUICKVIEW_OPEN_EVENT, onOpen);
  }, [load]);

  const close = useCallback(() => {
    setEventId(null);
    setData(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!eventId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [eventId, close]);

  async function handleAssign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!eventId) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("eventId", eventId);
    if (!String(formData.get("role") ?? "").trim()) return;
    setBusy(true);
    try {
      await assignStaffToEvent(formData);
      await load(eventId);
      form.reset();
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(assignmentId: string) {
    if (!eventId) return;
    const formData = new FormData();
    formData.set("id", assignmentId);
    formData.set("eventId", eventId);
    setBusy(true);
    try {
      await removeEventStaffAssignment(formData);
      await load(eventId);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateRole(assignmentId: string, role: string) {
    if (!eventId || !role) return;
    const formData = new FormData();
    formData.set("id", assignmentId);
    formData.set("eventId", eventId);
    formData.set("role", role);
    setBusy(true);
    try {
      await updateEventStaffRole(formData);
      await load(eventId);
    } finally {
      setBusy(false);
    }
  }

  if (!eventId) return null;

  return (
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
        style={{ width: "100%", maxWidth: 520, display: "grid", gap: "1rem" }}
      >
        {loading && <p style={{ margin: 0 }}>Loading…</p>}
        {error && <p style={{ margin: 0, color: "#a33" }}>{error}</p>}

        {data && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "1rem" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.15rem" }}>{data.event.name}</h2>
                <p style={{ margin: "0.25rem 0 0", color: "var(--color-muted)", fontSize: "0.9rem" }}>
                  {EVENT_TYPE_LABELS[data.event.event_type] ?? data.event.event_type} —{" "}
                  {formatDate(data.event.event_date)} —{" "}
                  {EVENT_STATUS_LABELS[data.event.status] ?? data.event.status}
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", fontSize: "0.9rem" }}>
              {data.event.client && (
                <InfoField
                  label="Client"
                  value={
                    data.event.client_id ? (
                      <a href={`/admin/clients/${data.event.client_id}`}>
                        {data.event.client.first_name} {data.event.client.last_name}
                      </a>
                    ) : (
                      `${data.event.client.first_name} ${data.event.client.last_name}`
                    )
                  }
                />
              )}
              <InfoField
                label="Location"
                value={[data.event.venue_name, data.event.address_line, data.event.city, data.event.state]
                  .filter(Boolean)
                  .join(", ") || "TBD"}
              />
              <InfoField label="Guest count" value={data.event.guest_count ? String(data.event.guest_count) : "—"} />
            </div>

            <div>
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>Staffing</h3>
              {data.assignments.length === 0 ? (
                <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "0.9rem" }}>No one assigned yet.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
                  {data.assignments.map((a) => {
                    const person = Array.isArray(a.staff) ? a.staff[0] : a.staff;
                    const roleIsValid = ROLE_OPTIONS.includes(a.role);
                    return (
                      <li
                        key={a.id}
                        style={{
                          fontSize: "0.9rem",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "0.5rem",
                          padding: "0.4rem 0",
                          borderBottom: "1px solid var(--color-border)",
                        }}
                      >
                        <span>
                          {a.is_open ? (
                            <em style={{ color: "var(--color-muted)", fontStyle: "normal" }}>Open</em>
                          ) : person ? (
                            `${person.first_name} ${person.last_name}`
                          ) : (
                            "—"
                          )}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <select
                            aria-label="Role"
                            value={a.role}
                            disabled={busy}
                            onChange={(e) => handleUpdateRole(a.id, e.target.value)}
                            style={{
                              padding: "0.3rem 0.45rem",
                              borderRadius: 6,
                              border: "1px solid var(--color-border)",
                              fontSize: "0.85rem",
                              color: roleIsValid ? "inherit" : "#a33",
                            }}
                          >
                            {(roleIsValid ? ROLE_OPTIONS : [a.role, ...ROLE_OPTIONS]).map((role) => (
                              <option key={role} value={role}>
                                {ROLE_OPTIONS.includes(role) ? role[0].toUpperCase() + role.slice(1) : `⚠ ${role} — pick a role`}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleRemove(a.id)}
                            style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", fontSize: "0.85rem" }}
                          >
                            Remove
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <form onSubmit={handleAssign} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "0.6rem", alignItems: "end" }}>
              <div>
                <label htmlFor="qv-staffId" style={{ fontSize: "0.8rem" }}>
                  Person
                </label>
                <select id="qv-staffId" name="staffId" defaultValue="" style={{ width: "100%", padding: "0.5rem 0.6rem", borderRadius: 8, border: "1px solid var(--color-border)" }}>
                  <option value="">— Open position (unfilled) —</option>
                  {data.activeStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="qv-role" style={{ fontSize: "0.8rem" }}>
                  Role
                </label>
                <select id="qv-role" name="role" defaultValue="" required style={{ width: "100%", padding: "0.5rem 0.6rem", borderRadius: 8, border: "1px solid var(--color-border)" }}>
                  <option value="" disabled>
                    — choose a role —
                  </option>
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role[0].toUpperCase() + role.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="button" disabled={busy}>
                Add
              </button>
            </form>

            <a href={`/admin/events/${data.event.id}`} style={{ fontSize: "0.9rem" }}>
              Open full event details →
            </a>
          </>
        )}
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}
