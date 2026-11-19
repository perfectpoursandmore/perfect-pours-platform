"use client";

import type { MouseEvent } from "react";
import type { CalendarEvent } from "./types";
import { clientName } from "./types";
import { isPlainLeftClick, openEventQuickView } from "./quickview-bus";

// A plain left-click opens the quick-view popover in place; cmd/ctrl/shift
// -click and middle-click still fall through to the real link, so the
// event's full page is one modifier-click away as always.
function handleClick(eventId: string) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainLeftClick(e)) return;
    e.preventDefault();
    openEventQuickView(eventId);
  };
}

// Small block chip used in the month and week grids.
export function EventChip({ event }: { event: CalendarEvent }) {
  const client = clientName(event);
  const hold = event.status === "inquiry";
  // Yellow = hold, green = booked, gray = done (see globals.css).
  const chipClass = hold ? "chip-hold" : event.status === "completed" ? "chip-done" : "chip-booked";
  return (
    <a
      href={`/admin/events/${event.id}`}
      onClick={handleClick(event.id)}
      className={chipClass}
      style={{
        display: "block",
        fontSize: "0.78rem",
        padding: "0.15rem 0.35rem",
        borderRadius: 4,
        marginBottom: 2,
        textDecoration: "none",
        color: "inherit",
        border: "1px solid transparent",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
      title={`${hold ? "HOLD: " : ""}${event.name}${client ? ` — ${client}` : ""}`}
    >
      {hold && <strong>HOLD </strong>}
      {event.name}
    </a>
  );
}

// Plain inline-text link used in the agenda table -- same click behavior,
// no chip styling since it already sits in a table cell.
export function EventNameLink({ event }: { event: CalendarEvent }) {
  return (
    <a href={`/admin/events/${event.id}`} onClick={handleClick(event.id)}>
      {event.status === "inquiry" ? "HOLD: " : ""}
      {event.name}
    </a>
  );
}
