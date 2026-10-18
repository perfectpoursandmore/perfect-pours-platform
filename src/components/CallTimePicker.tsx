"use client";

import { useEffect, useMemo, useState } from "react";

type SlotsResponse = {
  timeZone: string;
  slots: { start: string; end: string }[];
  error?: string;
};

export type PickedCall = { start: string; label: string };

function formatDateHeading(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" }).format(
    new Date(iso)
  );
}

function formatTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** Step one of the contact form: the open call times, grouped by day. */
export function CallTimePicker({ onPick }: { onPick: (call: PickedCall) => void }) {
  const [data, setData] = useState<SlotsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/book/slots")
      .then((res) => res.json())
      .then((json) => (json.error ? setLoadError(json.error) : setData(json)))
      .catch(() => setLoadError("Couldn't load available times. Please refresh and try again."));
  }, []);

  const dateGroups = useMemo(() => {
    if (!data) return [];
    const groups = new Map<string, { start: string; end: string }[]>();
    for (const slot of data.slots) {
      const key = new Intl.DateTimeFormat("en-CA", { timeZone: data.timeZone }).format(new Date(slot.start));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(slot);
    }
    return Array.from(groups.entries());
  }, [data]);

  if (loadError) {
    return (
      <div className="card">
        <p style={{ color: "var(--color-danger)", margin: 0 }}>{loadError}</p>
      </div>
    );
  }

  if (!data) return <p style={{ color: "var(--color-muted)" }}>Loading available times…</p>;

  if (dateGroups.length === 0) {
    return (
      <div className="card">
        <p style={{ margin: 0 }}>
          No call times are open right now. Please check back soon, or email{" "}
          <a href="mailto:faith@perfectpoursandmore.com">faith@perfectpoursandmore.com</a> or text{" "}
          <a href="sms:+19142636709">914-263-6709</a> and we&apos;ll find a time.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: "grid", gap: "1.25rem" }}>
      <p style={{ margin: 0, color: "var(--color-muted)" }}>Times shown are Eastern Time.</p>
      {dateGroups.map(([date, slots]) => (
        <div key={date}>
          <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>{formatDateHeading(slots[0].start, data.timeZone)}</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {slots.map((slot) => (
              <button
                key={slot.start}
                type="button"
                onClick={() =>
                  onPick({
                    start: slot.start,
                    label: `${formatDateHeading(slot.start, data.timeZone)} at ${formatTime(slot.start, data.timeZone)}`,
                  })
                }
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
