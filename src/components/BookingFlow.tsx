"use client";

import { useEffect, useMemo, useState } from "react";

type SlotsResponse = {
  timeZone: string;
  appointmentLengthMinutes: number;
  calendarConnected: boolean;
  slots: { start: string; end: string }[];
  error?: string;
};

const EVENT_TYPES: { value: string; label: string }[] = [
  { value: "wedding", label: "Wedding" },
  { value: "birthday", label: "Birthday" },
  { value: "bridal_shower", label: "Bridal shower" },
  { value: "baby_shower", label: "Baby shower" },
  { value: "corporate", label: "Corporate event" },
  { value: "holiday_party", label: "Holiday party" },
  { value: "graduation", label: "Graduation" },
  { value: "engagement_party", label: "Engagement party" },
  { value: "anniversary", label: "Anniversary" },
  { value: "other", label: "Other" },
];

function formatDateHeading(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

function formatTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function BookingFlow() {
  const [data, setData] = useState<SlotsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ consultationAt: string } | null>(null);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    eventType: "",
    eventDate: "",
    venueOrAddress: "",
    guestCount: "",
    howHeard: "",
  });

  useEffect(() => {
    fetch("/api/book/slots")
      .then((res) => res.json())
      .then((json) => {
        if (json.error) setLoadError(json.error);
        else setData(json);
      })
      .catch(() => setLoadError("Couldn't load available times. Please refresh and try again."));
  }, []);

  const dateGroups = useMemo(() => {
    if (!data) return [];
    const groups = new Map<string, { start: string; end: string }[]>();
    for (const slot of data.slots) {
      const key = new Intl.DateTimeFormat("en-CA", { timeZone: data.timeZone }).format(
        new Date(slot.start)
      );
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(slot);
    }
    return Array.from(groups.entries());
  }, [data]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotStart: selectedSlot, ...form }),
      });
      const json = await res.json();

      if (!res.ok) {
        setSubmitError(json.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      setConfirmed({ consultationAt: json.consultationAt });
    } catch {
      setSubmitError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <div className="card" style={{ maxWidth: 480 }}>
        <h2 style={{ marginTop: 0 }}>You&apos;re booked!</h2>
        <p>
          Your consultation is set for{" "}
          <strong>
            {new Intl.DateTimeFormat("en-US", {
              dateStyle: "full",
              timeStyle: "short",
              timeZone: data?.timeZone,
            }).format(new Date(confirmed.consultationAt))}
          </strong>
          . We&apos;ll be in touch beforehand with anything you need to know.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="card" style={{ maxWidth: 480 }}>
        <p style={{ color: "#a33" }}>{loadError}</p>
      </div>
    );
  }

  if (!data) {
    return <p style={{ color: "var(--color-muted)" }}>Loading available times…</p>;
  }

  if (dateGroups.length === 0) {
    return (
      <div className="card" style={{ maxWidth: 480 }}>
        <p>No consultation times are available right now — please check back soon.</p>
      </div>
    );
  }

  if (!selectedSlot) {
    return (
      <div style={{ display: "grid", gap: "1.5rem", maxWidth: 640 }}>
        <p style={{ color: "var(--color-muted)" }}>
          Times shown are Eastern Time. Pick a day, then a time.
        </p>
        {dateGroups.map(([date, slots]) => (
          <div key={date}>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>
              {formatDateHeading(slots[0].start, data.timeZone)}
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {slots.map((slot) => (
                <button
                  key={slot.start}
                  onClick={() => {
                    setSelectedDate(date);
                    setSelectedSlot(slot.start);
                  }}
                  style={{
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    padding: "0.45rem 0.8rem",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                  }}
                >
                  {formatTime(slot.start, data.timeZone)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 520, display: "grid", gap: "1rem" }}>
      <div>
        <button
          type="button"
          onClick={() => {
            setSelectedSlot(null);
            setSelectedDate(null);
          }}
          style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", padding: 0 }}
        >
          ← Choose a different time
        </button>
      </div>

      <div>
        <strong>
          {formatDateHeading(selectedSlot, data.timeZone)} at {formatTime(selectedSlot, data.timeZone)}
        </strong>
      </div>

      {submitError && <p style={{ color: "#a33", margin: 0 }}>{submitError}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div>
          <label htmlFor="firstName">First name</label>
          <input
            id="firstName"
            required
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="lastName">Last name</label>
          <input
            id="lastName"
            required
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>

      <div>
        <label htmlFor="phone">Phone</label>
        <input
          id="phone"
          type="tel"
          required
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
      </div>

      <div>
        <label htmlFor="eventType">Event type</label>
        <select
          id="eventType"
          required
          value={form.eventType}
          onChange={(e) => setForm({ ...form, eventType: e.target.value })}
          style={{ width: "100%", padding: "0.55rem 0.7rem", borderRadius: 8, border: "1px solid var(--color-border)" }}
        >
          <option value="" disabled>
            Select one
          </option>
          {EVENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="eventDate">Event date</label>
        <input
          id="eventDate"
          type="date"
          required
          value={form.eventDate}
          onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
        />
      </div>

      <div>
        <label htmlFor="venueOrAddress">Event address or venue</label>
        <input
          id="venueOrAddress"
          required
          value={form.venueOrAddress}
          onChange={(e) => setForm({ ...form, venueOrAddress: e.target.value })}
        />
      </div>

      <div>
        <label htmlFor="guestCount">Estimated guest count</label>
        <input
          id="guestCount"
          type="number"
          min={1}
          value={form.guestCount}
          onChange={(e) => setForm({ ...form, guestCount: e.target.value })}
        />
      </div>

      <div>
        <label htmlFor="howHeard">How did you hear about us?</label>
        <input
          id="howHeard"
          value={form.howHeard}
          onChange={(e) => setForm({ ...form, howHeard: e.target.value })}
        />
      </div>

      <button type="submit" className="button" disabled={submitting}>
        {submitting ? "Booking…" : "Confirm consultation"}
      </button>
    </form>
  );
}
