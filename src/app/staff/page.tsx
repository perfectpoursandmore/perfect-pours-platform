import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { EVENT_TYPE_LABELS, formatDate } from "@/lib/labels";
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
};

// This login can never reach client contact info, pricing, contracts, or
// payments: those live in tables with no database access granted to staff
// at all. Every event booked shows up here automatically for the whole
// team (not just this person's own shifts) — deliberately, so staff can
// see who else is working an event and step up for an open slot. That's
// why the query below has no staff_id filter.
export default async function StaffCalendarPage({
  searchParams,
}: {
  searchParams: { view?: string; date?: string };
}) {
  const supabase = createClient();
  const user = await getCurrentUser();

  const { data: myStaffRow } = user
    ? await supabase.from("staff").select("id").eq("user_id", user.id).single()
    : { data: null };
  const myStaffId = myStaffRow?.id ?? null;

  const { count: pendingCount } = myStaffId
    ? await supabase
        .from("event_staff_invites")
        .select("id", { count: "exact", head: true })
        .eq("staff_id", myStaffId)
        .eq("status", "pending")
    : { count: 0 };

  // Default to Agenda rather than Month: staff mostly check this on their
  // phones, and a 7-column month grid has too little room per day to show
  // a full event name there — Agenda lists only the days that actually
  // have something on them, full names, no truncation. Month/Week are
  // still one tap away for anyone who wants the grid view.
  const view: ViewMode =
    searchParams.view === "week" || searchParams.view === "month" ? (searchParams.view as ViewMode) : "agenda";

  const today = todayDateString();
  const anchor = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : today;

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
    .select("id, name, event_type, event_date, venue_name, city")
    .eq("status", "booked")
    .gte("event_date", rangeStart)
    .lte("event_date", rangeEnd)
    .order("event_date", { ascending: true });

  const eventIds = (events ?? []).map((e) => e.id);

  // Just enough about each event's staffing to flag it on the calendar —
  // "you're on this one" / "still needs someone" — without pulling every
  // assignment's full detail here (that's what the event's own page is for).
  const { data: assignments } = eventIds.length
    ? await supabase.from("event_staff").select("event_id, is_open, staff_id").in("event_id", eventIds)
    : { data: [] };

  const myEventIds = new Set<string>();
  const openEventIds = new Set<string>();
  for (const row of assignments ?? []) {
    if (myStaffId && row.staff_id === myStaffId) myEventIds.add(row.event_id);
    if (row.is_open && !row.staff_id) openEventIds.add(row.event_id);
  }

  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const event of (events ?? []) as CalendarEvent[]) {
    const list = eventsByDate.get(event.event_date) ?? [];
    list.push(event);
    eventsByDate.set(event.event_date, list);
  }

  const [y, m] = anchor.split("-").map(Number);

  const prevHref =
    view === "month"
      ? `/staff?view=month&date=${addMonths(firstOfMonth(y, m), -1)}`
      : view === "week"
        ? `/staff?view=week&date=${addDays(anchor, -7)}`
        : `/staff?view=agenda`;
  const nextHref =
    view === "month"
      ? `/staff?view=month&date=${addMonths(firstOfMonth(y, m), 1)}`
      : view === "week"
        ? `/staff?view=week&date=${addDays(anchor, 7)}`
        : `/staff?view=agenda`;
  const todayHref = `/staff?view=${view}&date=${today}`;

  const heading = view === "month" ? monthLabel(y, m) : view === "week" ? weekLabel(anchor) : "Upcoming";

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      {!!pendingCount && (
        <Link
          href="/staff/availability"
          style={{
            display: "block",
            padding: "0.85rem 1.1rem",
            borderRadius: 10,
            background: "var(--color-accent)",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          {pendingCount === 1
            ? "You have 1 availability request waiting — click here to answer it"
            : `You have ${pendingCount} availability requests waiting — click here to answer them`}
        </Link>
      )}

      <h1 style={{ margin: 0 }}>Calendar</h1>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <ViewTab href={`/staff?view=agenda`} active={view === "agenda"} label="Agenda" />
          <ViewTab href={`/staff?view=month&date=${anchor}`} active={view === "month"} label="Month" />
          <ViewTab href={`/staff?view=week&date=${anchor}`} active={view === "week"} label="Week" />
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

      <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", fontSize: "0.8rem", color: "var(--color-muted)" }}>
        <Legend swatch="var(--color-accent)" label="You're staffed on this one" />
        <Legend swatch="#c0392b" label="Still needs someone" outline />
      </div>

      {(events ?? []).length === 0 ? (
        <div className="card">
          <p style={{ margin: 0, color: "var(--color-muted)" }}>Nothing booked in this range.</p>
        </div>
      ) : view === "month" ? (
        <MonthGrid gridDates={gridDates} currentMonth={m} eventsByDate={eventsByDate} myEventIds={myEventIds} openEventIds={openEventIds} />
      ) : view === "week" ? (
        <WeekGrid gridDates={gridDates} eventsByDate={eventsByDate} myEventIds={myEventIds} openEventIds={openEventIds} />
      ) : (
        <Agenda events={(events as CalendarEvent[]) ?? []} myEventIds={myEventIds} openEventIds={openEventIds} />
      )}
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
        background: active ? "var(--color-accent, #7a3b2e)" : "none",
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

function Legend({ swatch, label, outline }: { swatch: string; label: string; outline?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 3,
          background: outline ? "none" : swatch,
          border: outline ? `2px solid ${swatch}` : "none",
        }}
      />
      {label}
    </span>
  );
}

function EventChip({
  event,
  isMine,
  isOpen,
}: {
  event: CalendarEvent;
  isMine: boolean;
  isOpen: boolean;
}) {
  return (
    <a
      href={`/staff/events/${event.id}`}
      style={{
        display: "block",
        fontSize: "0.78rem",
        padding: "0.15rem 0.35rem",
        borderRadius: 4,
        marginBottom: 2,
        textDecoration: "none",
        color: isMine ? "#fff" : "inherit",
        background: isMine ? "var(--color-accent)" : "var(--color-highlight, #f1e9dd)",
        border: isOpen ? "2px solid #c0392b" : "none",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
      title={`${event.name} (${EVENT_TYPE_LABELS[event.event_type] ?? event.event_type})`}
    >
      {event.name}
    </a>
  );
}

function MonthGrid({
  gridDates,
  currentMonth,
  eventsByDate,
  myEventIds,
  openEventIds,
}: {
  gridDates: string[];
  currentMonth: number;
  eventsByDate: Map<string, CalendarEvent[]>;
  myEventIds: Set<string>;
  openEventIds: Set<string>;
}) {
  const weeks: string[][] = [];
  for (let i = 0; i < gridDates.length; i += 7) weeks.push(gridDates.slice(i, i + 7));

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="calendar-grid" style={{ display: "grid", borderBottom: "1px solid var(--color-border)" }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} style={{ padding: "0.5rem", fontSize: "0.8rem", color: "var(--color-muted)", textAlign: "center" }}>
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week, i) => (
        <div key={i} className="calendar-grid" style={{ display: "grid" }}>
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
                  <EventChip key={event.id} event={event} isMine={myEventIds.has(event.id)} isOpen={openEventIds.has(event.id)} />
                ))}
                {dayEvents.length > 3 && (
                  <a
                    href={`/staff?view=week&date=${dateStr}`}
                    style={{ display: "block", fontSize: "0.72rem", color: "var(--color-accent)", textDecoration: "none" }}
                  >
                    +{dayEvents.length - 3} more
                  </a>
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
  myEventIds,
  openEventIds,
}: {
  gridDates: string[];
  eventsByDate: Map<string, CalendarEvent[]>;
  myEventIds: Set<string>;
  openEventIds: Set<string>;
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="calendar-grid" style={{ display: "grid" }}>
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
                    <EventChip event={event} isMine={myEventIds.has(event.id)} isOpen={openEventIds.has(event.id)} />
                    <div style={{ fontSize: "0.72rem", color: "var(--color-muted)" }}>
                      {[event.venue_name, event.city].filter(Boolean).join(", ") || "—"}
                    </div>
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

function Agenda({
  events,
  myEventIds,
  openEventIds,
}: {
  events: CalendarEvent[];
  myEventIds: Set<string>;
  openEventIds: Set<string>;
}) {
  if (events.length === 0) {
    return (
      <div className="card">
        <p style={{ margin: 0, color: "var(--color-muted)" }}>Nothing booked in the next 6 months.</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
            <th style={{ padding: "0.75rem 1rem" }}>Date</th>
            <th style={{ padding: "0.75rem 1rem" }}>Event</th>
            <th style={{ padding: "0.75rem 1rem" }}>Location</th>
            <th style={{ padding: "0.75rem 1rem" }} />
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
              <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>{formatDate(event.event_date)}</td>
              <td style={{ padding: "0.75rem 1rem" }}>
                <a href={`/staff/events/${event.id}`}>{event.name}</a>{" "}
                <span style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>
                  ({EVENT_TYPE_LABELS[event.event_type] ?? event.event_type})
                </span>
              </td>
              <td style={{ padding: "0.75rem 1rem" }}>{[event.venue_name, event.city].filter(Boolean).join(", ") || "—"}</td>
              <td style={{ padding: "0.75rem 1rem", fontSize: "0.8rem" }}>
                {myEventIds.has(event.id) && <span style={{ color: "var(--color-accent)", fontWeight: 600 }}>You&apos;re on this</span>}
                {openEventIds.has(event.id) && <span style={{ color: "#c0392b" }}>Needs someone</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
