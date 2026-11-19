import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/labels";
import { addInboxText, handleInboxItem, saveInboxNote, removeInboxItem, setPreference } from "./actions";
import { getPreferences } from "@/lib/preferences";
import { TodoList, type TodoItem } from "./TodoList";
import { getMoneySettings } from "@/lib/mileage";
import { upcomingTaxDates, whenText } from "@/lib/tax-dates";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNowISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Same as supabase/migrations/0026_one_todo_list.sql: adds colors and moves
// any notes from the old "Upcoming consultations" note box onto the list.
const COLOR_SQL = `alter table public.todos add column if not exists color text;
do $$
begin
  if to_regclass('public.dashboard_notes') is not null then
    insert into public.todos (list_type, item, created_by, created_at)
    select 'daily', note, created_by, created_at from public.dashboard_notes;
    delete from public.dashboard_notes;
  end if;
end $$;`;

// Same as supabase/migrations/0027_app_preferences.sql: the on/off switches.
const PREFS_SQL = `create table if not exists public.app_preferences (
  id boolean primary key default true check (id),
  morning_email boolean not null default true,
  clear_done_overnight boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.app_preferences (id) values (true) on conflict (id) do nothing;

alter table public.app_preferences enable row level security;

drop policy if exists "app_preferences: admin only" on public.app_preferences;
create policy "app_preferences: admin only"
  on public.app_preferences for all
  using (public.is_admin())
  with check (public.is_admin());`;

/**
 * The Today screen: Faith's running To do list, client texts waiting on
 * her, and what's coming up this week (calls + booked events). On purpose
 * there's no "needs follow-up" list of inquiries anymore: people book a
 * call or they don't, and she didn't want to chase the ones who don't.
 */
export default async function TodayPage({ searchParams }: { searchParams: { inboxError?: string } }) {
  const supabase = createClient();

  const [{ data: thisWeeksEvents }, { data: upcomingCalls }, { data: todos }, colorCheck, { data: inboxItems }, { data: clientList }] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, name, event_date")
        .eq("status", "booked")
        .gte("event_date", todayISO())
        .lte("event_date", daysFromNowISO(7))
        .order("event_date"),
      supabase
        .from("leads")
        .select("id, first_name, last_name, consultation_at, event_id")
        .not("consultation_at", "is", null)
        .gte("consultation_at", new Date().toISOString())
        .order("consultation_at")
        .limit(8),
      // "*" so the list still loads before the color column has been added.
      supabase.from("todos").select("*").order("created_at", { ascending: true }),
      supabase.from("todos").select("color").limit(1),
      // "*" so the page keeps working even before the note column exists.
      supabase.from("inbox_items").select("*").order("created_at"),
      supabase.from("clients").select("id, first_name, last_name").order("first_name"),
    ]);

  const colorsReady = !colorCheck.error;
  const prefs = await getPreferences(supabase);
  const todayEt = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  // Tax due dates show up two weeks ahead, nowhere else to check.
  const taxDates = upcomingTaxDates(todayEt, 14, (await getMoneySettings(supabase)).sales_tax_filing);
  const setupSql = [colorsReady ? "" : COLOR_SQL, prefs.ready ? "" : PREFS_SQL].filter(Boolean).join("\n\n");
  const todoItems: TodoItem[] = ((todos ?? []) as (TodoItem & { color?: string | null })[]).map((t) => ({
    id: t.id,
    item: t.item,
    is_done: t.is_done,
    color: (t.color ?? null) as TodoItem["color"],
    created_at: t.created_at,
  }));

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" });

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div>
        <h1 style={{ margin: 0 }}>Today</h1>
        <p className="muted" style={{ margin: "0.2rem 0 0" }}>{today}</p>
      </div>

      {setupSql && (
        <details className="notice">
          <summary>
            <strong>One-time setup</strong> (turns on to-do colors and the on/off switches below). Tap to see how.
          </summary>
          <p style={{ margin: "0.5rem 0 0.4rem" }}>In Supabase, open the SQL Editor, paste all of this in and click Run. This box goes away after.</p>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "0.82rem", background: "#fff", padding: "0.6rem", borderRadius: 6 }}>
            {setupSql}
          </pre>
        </details>
      )}

      {taxDates.map((t) => (
        <a key={t.date + t.title} href="/admin/money" className="notice" style={{ display: "block", margin: 0, textDecoration: "none", color: "inherit" }}>
          <strong>{t.title} {whenText(todayEt, t.date)}.</strong> {t.detail}
        </a>
      ))}

      <div className="today-grid">
        <TodoList initialItems={todoItems} colorsReady={colorsReady} />

        <div style={{ display: "grid", gap: "1.5rem" }}>
          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: "1.2rem" }}>Coming up this week</h2>
            {(upcomingCalls ?? []).length === 0 && (thisWeeksEvents ?? []).length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Nothing on the books. Enjoy it.</p>
            ) : (
              <div style={{ display: "grid", gap: "1rem" }}>
                {(upcomingCalls ?? []).length > 0 && (
                  <div>
                    <h3 style={subhead}>Calls</h3>
                    <ul style={list}>
                      {(upcomingCalls ?? []).map((c) => (
                        <li key={c.id}>
                          <a href={c.event_id ? `/admin/events/${c.event_id}/booking` : `/admin/leads/${c.id}`}>
                            {c.first_name} {c.last_name}
                          </a>{" "}
                          <span className="muted">· {formatDateTime(c.consultation_at)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(thisWeeksEvents ?? []).length > 0 && (
                  <div>
                    <h3 style={subhead}>Events</h3>
                    <ul style={list}>
                      {(thisWeeksEvents ?? []).map((e) => (
                        <li key={e.id}>
                          <a href={`/admin/events/${e.id}`}>{e.name}</a> <span className="muted">· {formatDate(e.event_date)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <InboxCard
            items={(inboxItems ?? []) as InboxRow[]}
            clients={(clientList ?? []) as ClientOption[]}
            error={searchParams?.inboxError}
          />
        </div>
      </div>

      <div className="muted small" style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
        <Toggle
          name="morning_email"
          on={prefs.morning_email}
          label="Morning email at 7 AM"
          disabled={!prefs.ready}
        />
        <Toggle
          name="clear_done_overnight"
          on={prefs.clear_done_overnight}
          label="Clear checked items overnight"
          disabled={!prefs.ready}
        />
      </div>
    </div>
  );
}

/** One on/off switch: a small form whose button flips the setting. */
function Toggle({ name, on, label, disabled }: { name: string; on: boolean; label: string; disabled: boolean }) {
  return (
    <form action={setPreference} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
      <input type="hidden" name="key" value={name} />
      <input type="hidden" name="value" value={String(!on)} />
      <button
        type="submit"
        disabled={disabled}
        aria-pressed={on}
        title={disabled ? "Finish the one-time setup above first" : on ? "Turn off" : "Turn on"}
        style={{
          width: 40,
          height: 24,
          borderRadius: 999,
          border: "none",
          padding: 2,
          cursor: disabled ? "not-allowed" : "pointer",
          background: on ? "var(--color-booked-border)" : "var(--color-border-strong)",
          opacity: disabled ? 0.5 : 1,
          display: "flex",
          justifyContent: on ? "flex-end" : "flex-start",
        }}
      >
        <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", display: "block" }} />
      </button>
      <span>{label}</span>
    </form>
  );
}

const subhead = { margin: "0 0 0.4rem", fontSize: "0.85rem", color: "var(--color-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" } as const;
const list = { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" } as const;

type InboxRow = {
  id: string;
  body: string;
  kind: "booking" | "send" | "todo";
  guessed_date: string | null;
  client_id: string | null;
  note?: string | null;
  created_at: string;
};

type ClientOption = { id: string; first_name: string; last_name: string | null };

/**
 * Client texts/emails Faith forwarded from her iPhone ("Send to Perfect
 * Pours" Shortcut) or pasted below. Kept deliberately simple: the text, a
 * box to type what she needs to do about it, and an ✕ to delete it. The
 * booking/event shortcuts are tucked under "More" so they don't clutter
 * the card. Oldest first, so nothing sits forgotten at the bottom.
 */
function InboxCard({ items, clients, error }: { items: InboxRow[]; clients: ClientOption[]; error?: string }) {
  const field = {
    padding: "0.5rem 0.65rem",
    borderRadius: 8,
    border: "1px solid var(--color-border)",
    fontSize: "0.9rem",
  };
  const small = { padding: "0.35rem 0.6rem", fontSize: "0.8rem", background: "none", color: "inherit", border: "1px solid var(--color-border)" };
  return (
    <div id="inbox" className="card">
      <h2 style={{ marginTop: 0, fontSize: "1.2rem" }}>
        Texts to handle{items.length > 0 ? ` (${items.length})` : ""}
      </h2>
      {error && <p style={{ color: "var(--color-danger)", margin: "0 0 0.75rem" }}>{error}</p>}
      {items.length === 0 ? (
        <p style={{ color: "var(--color-muted)", margin: 0 }}>
          Nothing waiting. <a href="/admin/settings/text-inbox">Set up the iPhone button</a>
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.75rem" }}>
          {items.map((it) => (
            <li key={it.id} style={{ borderTop: "1px solid var(--color-border)", paddingTop: "0.65rem" }}>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                <p style={{ margin: 0, flex: 1, minWidth: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "0.92rem" }}>
                  {it.body}
                </p>
                <form action={removeInboxItem}>
                  <input type="hidden" name="id" value={it.id} />
                  <button
                    type="submit"
                    title="Delete"
                    aria-label="Delete"
                    style={{ background: "none", border: "none", color: "var(--color-muted)", cursor: "pointer", fontSize: "1.1rem", lineHeight: 1, padding: "0.1rem 0.25rem" }}
                  >
                    ✕
                  </button>
                </form>
              </div>

              <form action={saveInboxNote} style={{ display: "flex", gap: "0.4rem", marginTop: "0.45rem" }}>
                <input type="hidden" name="id" value={it.id} />
                <input
                  type="text"
                  name="note"
                  defaultValue={it.note ?? ""}
                  placeholder="Note: e.g. send an invoice"
                  style={{ ...field, flex: 1, minWidth: 0 }}
                />
                <button type="submit" className="button" style={{ padding: "0.45rem 0.8rem", fontSize: "0.85rem" }}>
                  Save
                </button>
              </form>

              <details style={{ marginTop: "0.4rem" }}>
                <summary style={{ cursor: "pointer", fontSize: "0.8rem", color: "var(--color-muted)" }}>More</summary>
                <form action={handleInboxItem} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center", marginTop: "0.4rem" }}>
                  <input type="hidden" name="id" value={it.id} />
                  <select
                    name="clientId"
                    defaultValue={it.client_id ?? ""}
                    aria-label="Who it's from"
                    style={{ ...field, padding: "0.35rem 0.5rem", fontSize: "0.8rem", maxWidth: "100%" }}
                  >
                    <option value="">Who&apos;s it from?</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.first_name} {c.last_name ?? ""}
                      </option>
                    ))}
                  </select>
                  <button type="submit" name="do" value="booking" className="button" style={small}>
                    Add booking
                  </button>
                  <button type="submit" name="do" value="open" className="button" style={small}>
                    Open their event
                  </button>
                  <button type="submit" name="do" value="todo" className="button" style={small}>
                    Move to to-do
                  </button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}
      <form action={addInboxText} style={{ display: "grid", gap: "0.4rem", marginTop: "0.9rem" }}>
        <input type="text" name="text" placeholder="Paste a text or email here" style={field} />
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <input type="text" name="note" placeholder="Note (optional): e.g. send an invoice" style={{ ...field, flex: 1, minWidth: 0 }} />
          <button type="submit" className="button">
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
