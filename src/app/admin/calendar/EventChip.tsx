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
  const cancelled = event.status === "cancelled";
  return (
    <a
      href={`/admin/events/${event.id}`}
      onClick={handleClick(event.id)}
      style={{
        display: "block",
        fontSize: "0.78rem",
        padding: "0.15rem 0.35rem",
        borderRadius: 4,
        marginBottom: 2,
        textDecoration: cancelled ? "line-through" : "none",
        color: cancelled ? "var(--color-muted)" : "inherit",
        background: cancelled ? "transparent" : "var(--color-highlight, #f1e9dd)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
      title={`${event.name}${client ? ` — ${client}` : ""}`}
    >
      {event.name}
    </a>
  );
}

// Plain inline-text link used in the agenda table -- same click behavior,
// no chip styling since it already sits in a table cell.
export function EventNameLink({ event }: { event: CalendarEvent }) {
  return (
    <a href={`/admin/events/${event.id}`} onClick={handleClick(event.id)}>
      {event.name}
    </a>
  );
}
