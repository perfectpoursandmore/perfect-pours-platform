import { createClient } from "@/lib/supabase/server";
import { LEAD_STATUS_LABELS, formatDate, formatDateTime } from "@/lib/labels";
import { customQuoteReason } from "@/lib/price-list";
import { addDashboardNote, removeDashboardNote, addTodo, toggleTodo, removeTodo } from "./actions";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNowISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type FollowUpRow = {
  id: string;
  name: string;
  event_date: string;
  created_at: string;
  event_type: string | null;
  guest_count: number | null;
  proposals:
    | { sent_at: string | null; status: string; requested_addons: string[] | null; addons_handled_at: string | null }[]
    | null;
};

const DAY_MS = 86400000;
const CHECK_IN_AFTER_DAYS = 3;

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

function ago(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

type TodoRow = {
  id: string;
  list_type: string;
  item: string;
  is_done: boolean;
  created_at: string;
};

export default async function AdminDashboardPage() {
  const supabase = createClient();

  const [
    { data: thisWeeksEvents },
    { data: upcomingConsultations },
    { data: attentionLeads },
    { data: dashboardNotes },
    { data: todos },
    { data: openHolds },
  ] = await Promise.all([
      supabase
        .from("events")
        .select("id, name, event_date, event_type")
        .eq("status", "booked")
        .gte("event_date", todayISO())
        .lte("event_date", daysFromNowISO(7))
        .order("event_date"),
      supabase
        .from("leads")
        .select("id, first_name, last_name, consultation_at")
        .not("consultation_at", "is", null)
        .gte("consultation_at", new Date().toISOString())
        .order("consultation_at")
        .limit(5),
      supabase
        .from("leads")
        .select("id, first_name, last_name, status")
        .in("status", ["new_inquiry", "consultation_completed", "quote_needed"])
        // Leads already turned into an event are tracked under "Needs follow-up" instead.
        .is("event_id", null)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("dashboard_notes").select("id, note, created_at").order("created_at", { ascending: false }),
      supabase
        .from("todos")
        .select("id, list_type, item, is_done, created_at")
        .order("is_done", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("events")
        .select("id, name, status, event_date, created_at, event_type, guest_count, proposals(sent_at, status, requested_addons, addons_handled_at)")
        .in("status", ["inquiry", "booked"])
        .gte("event_date", todayISO())
        .order("event_date"),
    ]);

  // Every HOLD still waiting on something: either pricing hasn't gone out
  // yet, or it went out a few days ago with no answer. This is the list that
  // keeps a request from quietly sitting for two weeks.
  const upcoming = (openHolds ?? []) as unknown as (FollowUpRow & { status?: string })[];
  // Add-on requests can come in before OR after booking.
  const addonRequests = upcoming.filter((e) =>
    (e.proposals ?? []).some((p) => (p.requested_addons ?? []).length > 0 && !p.addons_handled_at)
  );
  const holdIds = new Set(
    ((openHolds ?? []) as unknown as { id: string; status?: string }[]).filter((e) => e.status !== "booked").map((e) => e.id)
  );
  const holds = upcoming.filter((e) => holdIds.has(e.id));
  const needsPricing = holds
    .filter((e) => !(e.proposals ?? []).some((p) => p.sent_at))
    .map((e) => ({ ...e, waiting: daysSince(e.created_at), customQuote: customQuoteReason(e.event_type, e.guest_count) }));
  const needsCheckIn = holds
    .map((e) => {
      const sent = (e.proposals ?? [])
        .map((p) => p.sent_at)
        .filter((d): d is string => Boolean(d))
        .sort()
        .pop();
      return sent ? { ...e, sentDaysAgo: daysSince(sent) } : null;
    })
    .filter((e): e is FollowUpRow & { sentDaysAgo: number } => e !== null && e.sentDaysAgo >= CHECK_IN_AFTER_DAYS);

  const allTodos = (todos ?? []) as TodoRow[];
  const dailyTodos = allTodos.filter((t) => t.list_type === "daily");
  const weeklyTodos = allTodos.filter((t) => t.list_type === "weekly");

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <h1 style={{ margin: 0 }}>Dashboard</h1>

      <div className="card" style={{ borderColor: needsPricing.length + needsCheckIn.length + addonRequests.length > 0 ? "var(--color-accent)" : undefined }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Needs follow-up</h2>
        {needsPricing.length + needsCheckIn.length + addonRequests.length === 0 ? (
          <p style={{ color: "var(--color-muted)", margin: 0 }}>You&apos;re all caught up. Every hold has pricing out and isn&apos;t overdue for a check-in.</p>
        ) : (
          <div style={{ display: "grid", gap: "1rem" }}>
            {needsPricing.length > 0 && (
              <div>
                <h3 style={{ margin: "0 0 0.4rem", fontSize: "0.9rem" }}>Send pricing</h3>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.4rem" }}>
                  {needsPricing.map((e) => (
                    <li key={e.id}>
                      <a href={`/admin/events/${e.id}/booking`}>{e.name}</a>{" "}
                      <span style={{ color: "var(--color-muted)" }}>
                        — event {formatDate(e.event_date)} · came in {ago(e.waiting)}
                      </span>
                      {e.customQuote && (
                        <span style={{ marginLeft: "0.4rem", fontSize: "0.78rem", padding: "0.05rem 0.4rem", borderRadius: 4, background: "#f1e9dd" }}>
                          custom quote
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {addonRequests.length > 0 && (
              <div>
                <h3 style={{ margin: "0 0 0.4rem", fontSize: "0.9rem" }}>Price requested add-ons</h3>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.4rem" }}>
                  {addonRequests.map((e) => (
                    <li key={e.id}>
                      <a href={`/admin/events/${e.id}/booking`}>{e.name}</a>{" "}
                      <span style={{ color: "var(--color-muted)" }}>— event {formatDate(e.event_date)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {needsCheckIn.length > 0 && (
              <div>
                <h3 style={{ margin: "0 0 0.4rem", fontSize: "0.9rem" }}>Check in (no answer yet)</h3>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.4rem" }}>
                  {needsCheckIn.map((e) => (
                    <li key={e.id}>
                      <a href={`/admin/events/${e.id}`}>{e.name}</a>{" "}
                      <span style={{ color: "var(--color-muted)" }}>
                        — event {formatDate(e.event_date)} · pricing sent {ago(e.sentDaysAgo)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--color-muted)" }}>
              A hold leaves this list once it&apos;s marked Booked or Cancelled.
            </p>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>This week</h2>
          {thisWeeksEvents && thisWeeksEvents.length > 0 ? (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
              {thisWeeksEvents.map((e) => (
                <li key={e.id}>
                  <a href={`/admin/events/${e.id}`}>{e.name}</a>{" "}
                  <span style={{ color: "var(--color-muted)" }}>— {formatDate(e.event_date)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--color-muted)", margin: 0 }}>Nothing booked this week.</p>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Upcoming consultations</h2>
          {upcomingConsultations && upcomingConsultations.length > 0 ? (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
              {upcomingConsultations.map((lead) => (
                <li key={lead.id}>
                  <a href={`/admin/leads/${lead.id}`}>
                    {lead.first_name} {lead.last_name}
                  </a>{" "}
                  <span style={{ color: "var(--color-muted)" }}>
                    — {formatDateTime(lead.consultation_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--color-muted)", margin: 0 }}>None scheduled.</p>
          )}

          {dashboardNotes && dashboardNotes.length > 0 && (
            <ul
              style={{
                margin: "0.75rem 0 0",
                padding: 0,
                listStyle: "none",
                display: "grid",
                gap: "0.4rem",
                borderTop: "1px solid var(--color-border)",
                paddingTop: "0.75rem",
              }}
            >
              {dashboardNotes.map((n) => (
                <li key={n.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.92rem" }}>{n.note}</span>
                  <form action={removeDashboardNote}>
                    <input type="hidden" name="id" value={n.id} />
                    <button
                      type="submit"
                      title="Done — remove"
                      style={{ background: "none", border: "none", color: "var(--color-muted)", cursor: "pointer", flexShrink: 0 }}
                    >
                      ✕
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <form
            action={addDashboardNote}
            style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}
          >
            <input
              type="text"
              name="note"
              placeholder='e.g. "Call with Nicole at 1:30pm — follow up"'
              style={{
                flex: 1,
                padding: "0.5rem 0.65rem",
                borderRadius: 8,
                border: "1px solid var(--color-border)",
                fontSize: "0.9rem",
              }}
            />
            <button type="submit" className="button">
              Add
            </button>
          </form>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        <TodoListCard
          title="Daily to-do"
          listType="daily"
          placeholder='e.g. "Call the venue about parking"'
          items={dailyTodos}
        />
        <TodoListCard
          title="Weekly to-do"
          listType="weekly"
          placeholder='e.g. "Restock bar cart supplies"'
          items={weeklyTodos}
        />
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Needs attention</h2>
        {attentionLeads && attentionLeads.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
            {attentionLeads.map((lead) => (
              <li key={lead.id}>
                <a href={`/admin/leads/${lead.id}`}>
                  {lead.first_name} {lead.last_name}
                </a>{" "}
                <span style={{ color: "var(--color-muted)" }}>— {LEAD_STATUS_LABELS[lead.status]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "var(--color-muted)", margin: 0 }}>Nothing waiting on you.</p>
        )}
      </div>

    </div>
  );
}

/**
 * One checklist card (Daily or Weekly) -- add an item, check it off (stays
 * visible, crossed out, ordered to the bottom), remove it with the ✕ once
 * it's no longer needed. Nothing here clears itself out; Faith manages
 * both lists herself, on purpose -- see the migration for why.
 */
function TodoListCard({
  title,
  listType,
  placeholder,
  items,
}: {
  title: string;
  listType: "daily" | "weekly";
  placeholder: string;
  items: TodoRow[];
}) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0, fontSize: "1rem" }}>{title}</h2>

      {items.length > 0 ? (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.4rem" }}>
          {items.map((t) => (
            <li key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
              <form action={toggleTodo} style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="done" value={String(!t.is_done)} />
                <button
                  type="submit"
                  title={t.is_done ? "Mark not done" : "Mark done"}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "1.05rem",
                    lineHeight: 1,
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  {t.is_done ? "☑" : "☐"}
                </button>
                <span
                  style={{
                    fontSize: "0.92rem",
                    textDecoration: t.is_done ? "line-through" : "none",
                    color: t.is_done ? "var(--color-muted)" : "inherit",
                    overflowWrap: "anywhere",
                  }}
                >
                  {t.item}
                </span>
              </form>
              <form action={removeTodo}>
                <input type="hidden" name="id" value={t.id} />
                <button
                  type="submit"
                  title="Remove"
                  style={{ background: "none", border: "none", color: "var(--color-muted)", cursor: "pointer", flexShrink: 0 }}
                >
                  ✕
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: "var(--color-muted)", margin: 0 }}>Nothing on this list yet.</p>
      )}

      <form action={addTodo} style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <input type="hidden" name="listType" value={listType} />
        <input
          type="text"
          name="item"
          placeholder={placeholder}
          style={{
            flex: 1,
            padding: "0.5rem 0.65rem",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            fontSize: "0.9rem",
          }}
        />
        <button type="submit" className="button">
          Add
        </button>
      </form>
    </div>
  );
}
