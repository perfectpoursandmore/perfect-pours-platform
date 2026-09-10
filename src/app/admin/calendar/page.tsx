import { createClient } from "@/lib/supabase/server";
import { EVENT_TYPE_LABELS, EVENT_STATUS_LABELS, formatDate } from "@/lib/labels";
import {
  addDays,
  addMonths,
  firstOfMonth,
  monthGridDates,
  monthLabel,
  todayDateString,
  weekDates,
  weekLabel,
} from "@/lib/calendar-dates";

type ViewMode = "month" | "week" | "agenda";

type CalendarEvent = {
  id: string;
  name: string;
  event_type: string;
  event_date: string;
  venue_name: string | null;
  city: string | null;
  status: string;
  clients: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
};

function clientName(event: CalendarEvent): string | null {
  const client = Array.isArray(event.clients) ? event.clients[0] : event.clients;
  return client ? `${client.first_name} ${client.last_name}` : null;
}

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: { view?: string; date?: string };
}) {
  const supabase = createClient();
  const view: ViewMode =
    searchParams.view === "week" || searchParams.view === "agenda" ? (searchParams.view as ViewMode) : "month";

  const today = todayDateString();
  const anchor = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : today;

  // Only real bookings belong on the master calendar — not bare inquiries
  // that haven't been won yet, and not cancelled ones (still fetched so we
  // can show them crossed out rather than making a slot look silently open).
  const relevantStatuses = ["booked", "completed", "cancelled"];

  let rangeStart = anchor;
  let rangeEnd = anchor;
  let gridDates: string[] = [];

  if (view === "month") {
    const [y, m] = anchor.split("-").map(Number);
    gridDates = monthGridDates(y, m);
    rangeStart = gridDates[0];
    rangeEnd = gridDates[gridDates.length - 1];
  } else if (view === "week") {
    gridDates = weekDates(anchor);
    rangeStart = gridDates[0];
    rangeEnd = gridDates[6];
  } else {
    rangeStart = today;
    rangeEnd = addDays(today, 180);
  }

  const { data: events } = await supabase
    .from("events")
    .select("id, name, event_type, event_date, venue_name, city, status, clients(first_name, last_name)")
    .in("status", relevantStatuses)
    .gte("event_date", rangeStart)
    .lte("event_date", rangeEnd)
    .order("event_date", { ascending: true });

  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const event of (events ?? []) as CalendarEvent[]) {
    const list = eventsByDate.get(event.event_date) ?? [];
    list.push(event);
    eventsByDate.set(event.event_date, list);
  }

  const [y, m] = anchor.split("-").map(Number);

  const prevHref =
    view === "month"
      ? `/admin/calendar?view=month&date=${addMonths(firstOfMonth(y, m), -1)}`
      : view === "week"
        ? `/admin/calendar?view=week&date=${addDays(anchor, -7)}`
        : `/admin/calendar?view=agenda`;
  const nextHref =
    view === "month"
      ? `/admin/calendar?view=month&date=${addMonths(firstOfMonth(y, m), 1)}`
      : view === "week"
        ? `/admin/calendar?view=week&date=${addDays(anchor, 7)}`
        : `/admin/calendar?view=agenda`;
  const todayHref = `/admin/calendar?view=${view}&date=${today}`;

  const heading = view === "month" ? monthLabel(y, m) : view === "week" ? weekLabel(anchor) : "Upcoming";

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div>
        <h1 style={{ margin: 0 }}>Calendar</h1>
        <p style={{ color: "var(--color-muted)" }}>Every booked event — click one to open its full record.</p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <ViewTab href={`/admin/calendar?view=month&date=${anchor}`} active={view === "month"} label="Month" />
          <ViewTab href={`/admin/calendar?view=week&date=${anchor}`} active={view === "week"} label="Week" />
          <ViewTab href={`/admin/calendar?view=agenda`} active={view === "agenda"} label="Agenda" />
        </div>

        {view !== "agenda" && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <a href={prevHref} aria-label="Previous" style={navButtonStyle}>
              ←
            </a>
            <strong style={{ minWidth: 160, textAlign: "center" }}>{heading}</strong>
            <a href={nextHref} aria-label="Next" style={navButtonStyle}>
              →
            </a>
            <a href={todayHref} style={{ ...navButtonStyle, width: "auto", padding: "0 0.75rem" }}>
              Today
            </a>
          </div>
        )}
      </div>

      {view === "month" && (
        <MonthGrid gridDates={gridDates} currentMonth={m} eventsByDate={eventsByDate} />
      )}

      {view === "week" && <WeekGrid gridDates={gridDates} eventsByDate={eventsByDate} />}

      {view === "agenda" && <Agenda events={(events ?? []) as CalendarEvent[]} />}
    </div>
  );
}

function ViewTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <a
      href={href}
      style={{
        padding: "0.5rem 0.9rem",
        borderRadius: 8,
        border: "1px solid var(--color-border)",
        background: active ? "var(--color-accent, #7a5c3e)" : "none",
        color: active ? "#fff" : "inherit",
        textDecoration: "none",
        fontSize: "0.9rem",
      }}
    >
      {label}
    </a>
  );
}

const navButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  textDecoration: "none",
  color: "inherit",
};

function EventChip({ event }: { event: CalendarEvent }) {
  const client = clientName(event);
  const cancelled = event.status === "cancelled";
  return (
    <a
      href={`/admin/events/${event.id}`}
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

function MonthGrid({
  gridDates,
  currentMonth,
  eventsByDate,
}: {
  gridDates: string[];
  currentMonth: number;
  eventsByDate: Map<string, CalendarEvent[]>;
}) {
  const weeks: string[][] = [];
  for (let i = 0; i < gridDates.length; i += 7) weeks.push(gridDates.slice(i, i + 7));

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--color-border)" }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} style={{ padding: "0.5rem", fontSize: "0.8rem", color: "var(--color-muted)", textAlign: "center" }}>
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {week.map((dateStr) => {
            const dayNum = Number(dateStr.split("-")[2]);
            const inMonth = Number(dateStr.split("-")[1]) === currentMonth;
            const dayEvents = eventsByDate.get(dateStr) ?? [];
            return (
              <div
                key={dateStr}
                style={{
                  minHeight: 90,
                  padding: "0.35rem",
                  borderTop: "1px solid var(--color-border)",
                  borderLeft: "1px solid var(--color-border)",
                  opacity: inMonth ? 1 : 0.4,
                }}
              >
                <div style={{ fontSize: "0.8rem", color: "var(--color-muted)", marginBottom: "0.25rem" }}>{dayNum}</div>
                {dayEvents.slice(0, 3).map((event) => (
                  <EventChip key={event.id} event={event} />
                ))}
                {dayEvents.length > 3 && (
                  <div style={{ fontSize: "0.72rem", color: "var(--color-muted)" }}>+{dayEvents.length - 3} more</div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function WeekGrid({
  gridDates,
  eventsByDate,
}: {
  gridDates: string[];
  eventsByDate: Map<string, CalendarEvent[]>;
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {gridDates.map((dateStr) => {
          const [, monthNum, dayNum] = dateStr.split("-").map(Number);
          const dayEvents = eventsByDate.get(dateStr) ?? [];
          return (
            <div key={dateStr} style={{ minHeight: 220, padding: "0.5rem", borderTop: "1px solid var(--color-border)", borderLeft: "1px solid var(--color-border)" }}>
              <div style={{ fontSize: "0.8rem", color: "var(--color-muted)", marginBottom: "0.5rem" }}>
                {monthNum}/{dayNum}
              </div>
              {dayEvents.length === 0 ? (
                <div style={{ fontSize: "0.78rem", color: "var(--color-muted)" }}>—</div>
              ) : (
                dayEvents.map((event) => (
                  <div key={event.id} style={{ marginBottom: "0.5rem" }}>
                    <EventChip event={event} />
                    {clientName(event) && (
                      <div style={{ fontSize: "0.72rem", color: "var(--color-muted)" }}>{clientName(event)}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Agenda({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="card">
        <p style={{ margin: 0, color: "var(--color-muted)" }}>Nothing booked in the next 6 months.</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
            <th style={{ padding: "0.75rem 1rem" }}>Date</th>
            <th style={{ padding: "0.75rem 1rem" }}>Event</th>
            <th style={{ padding: "0.75rem 1rem" }}>Client</th>
            <th style={{ padding: "0.75rem 1rem" }}>Location</th>
            <th style={{ padding: "0.75rem 1rem" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
              <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>{formatDate(event.event_date)}</td>
              <td style={{ padding: "0.75rem 1rem" }}>
                <a href={`/admin/events/${event.id}`}>{event.name}</a>{" "}
                <span style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>
                  ({EVENT_TYPE_LABELS[event.event_type] ?? event.event_type})
                </span>
              </td>
              <td style={{ padding: "0.75rem 1rem" }}>{clientName(event) ?? "—"}</td>
              <td style={{ padding: "0.75rem 1rem" }}>{[event.venue_name, event.city].filter(Boolean).join(", ") || "—"}</td>
              <td style={{ padding: "0.75rem 1rem" }}>{EVENT_STATUS_LABELS[event.status] ?? event.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
