import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatDate } from "@/lib/labels";
import { expensesReady, moneyForEvents, round2, signed, type ExpenseRow } from "@/lib/money";
import { deleteExpense } from "./actions";
import { ExpensesSetupBox } from "./SetupBox";

function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return { start, nextStart: `${next}-01`, next, prev, label: new Date(y, m - 1, 15).toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
}

function Stat({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="card" style={{ padding: "0.9rem 1rem", ...(strong ? { borderColor: "var(--color-accent)" } : {}) }}>
      <div className="muted small">{label}</div>
      <div style={{ fontSize: "1.35rem", fontWeight: 700 }}>{value}</div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  );
}

/**
 * Money by month: what came in, what went out, what Faith kept, and every
 * receipt for the month. Receipts count in the month they were paid, so
 * the monthly numbers line up with what taxes need.
 */
export default async function MoneyPage({ searchParams }: { searchParams: { m?: string; saved?: string } }) {
  const supabase = createClient();
  const thisMonth = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(0, 7);
  const ym = /^\d{4}-\d{2}$/.test(searchParams.m ?? "") ? searchParams.m! : thisMonth;
  const { start, nextStart, next, prev, label } = monthBounds(ym);

  const ready = await expensesReady(supabase);

  const [{ data: monthEvents }, expenseResult] = await Promise.all([
    supabase
      .from("events")
      .select("id, name, event_date")
      .in("status", ["booked", "completed"])
      .gte("event_date", start)
      .lt("event_date", nextStart)
      .order("event_date"),
    ready
      ? supabase
          .from("expenses")
          .select("*, expense_splits(event_id, amount)")
          .gte("spent_on", start)
          .lt("spent_on", nextStart)
          .order("spent_on", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const events = (monthEvents ?? []) as { id: string; name: string; event_date: string }[];
  const money = await moneyForEvents(supabase, events.map((e) => e.id));
  const expenses = (expenseResult.data ?? []) as ExpenseRow[];

  let moneyIn = 0;
  let gratuity = 0;
  let staffPay = 0;
  for (const e of events) {
    const m = money.get(e.id)!;
    moneyIn += m.moneyIn;
    gratuity += m.gratuity;
    staffPay += m.staffPay;
  }
  let receiptsNet = 0;
  let stock = 0;
  for (const x of expenses) {
    const given = (x.expense_splits ?? []).reduce((s, sp) => s + Number(sp.amount), 0);
    receiptsNet += signed(x.total, x.is_return);
    stock += signed(Number(x.total) - given, x.is_return);
  }
  const kept = round2(moneyIn - staffPay - receiptsNet);

  const paths = expenses.map((x) => x.receipt_path).filter((p): p is string => Boolean(p));
  const photoUrls = new Map<string, string>();
  if (paths.length) {
    const { data: signedUrls } = await supabase.storage.from("receipts").createSignedUrls(paths, 3600);
    for (const s of signedUrls ?? []) if (s.signedUrl && s.path) photoUrls.set(s.path, s.signedUrl);
  }
  const eventName = new Map(events.map((e) => [e.id, e.name]));
  const otherIds = Array.from(new Set(expenses.flatMap((x) => (x.expense_splits ?? []).map((s) => s.event_id)))).filter((id) => !eventName.has(id));
  if (otherIds.length) {
    const { data } = await supabase.from("events").select("id, name").in("id", otherIds);
    for (const e of (data ?? []) as { id: string; name: string }[]) eventName.set(e.id, e.name);
  }

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 820 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Money</h1>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginTop: "0.3rem" }}>
            <a href={`/admin/money?m=${prev}`} aria-label="Previous month" style={{ textDecoration: "none" }}>
              ←
            </a>
            <strong>{label}</strong>
            <a href={`/admin/money?m=${next}`} aria-label="Next month" style={{ textDecoration: "none" }}>
              →
            </a>
          </div>
        </div>
        <a className="button" href="/admin/money/new">
          + Add a receipt
        </a>
      </div>

      {searchParams.saved && <p className="notice" style={{ margin: 0 }}>Saved.</p>}
      {!ready && <ExpensesSetupBox />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.75rem" }}>
        <Stat label="Money in" value={formatMoney(moneyIn)} hint="This month's events, not counting gratuity or tax" />
        <Stat label="Staff pay" value={formatMoney(staffPay)} />
        <Stat label="Supplies" value={formatMoney(receiptsNet)} hint={stock ? `Includes ${formatMoney(stock)} of Stock` : "Receipts paid this month"} />
        <Stat label="You kept" value={formatMoney(kept)} strong />
      </div>
      {gratuity > 0 && (
        <p className="muted small" style={{ margin: 0 }}>
          Gratuity passed to staff this month: {formatMoney(gratuity)}. It isn&apos;t counted as your money.
        </p>
      )}

      <div className="card" style={{ padding: 0 }}>
        <h2 style={{ margin: 0, padding: "1rem 1rem 0.5rem", fontSize: "1rem" }}>Events</h2>
        {events.length === 0 ? (
          <p className="muted" style={{ padding: "0 1rem 1rem", margin: 0 }}>No booked events this month.</p>
        ) : (
          events.map((e) => {
            const m = money.get(e.id)!;
            return (
              <a
                key={e.id}
                href={`/admin/events/${e.id}/money`}
                style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.7rem 1rem", borderTop: "1px solid var(--color-border)", textDecoration: "none", color: "inherit" }}
              >
                <div>
                  <div>{e.name}</div>
                  <div className="muted small">
                    {formatDate(e.event_date)} · in {formatMoney(m.moneyIn)} · staff {formatMoney(m.staffPay)} · supplies {formatMoney(m.supplies)}
                  </div>
                </div>
                <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{formatMoney(m.kept)}</div>
              </a>
            );
          })
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <h2 style={{ margin: 0, padding: "1rem 1rem 0.5rem", fontSize: "1rem" }}>Receipts</h2>
        {expenses.length === 0 ? (
          <p className="muted" style={{ padding: "0 1rem 1rem", margin: 0 }}>No receipts this month.</p>
        ) : (
          expenses.map((x) => {
            const splits = x.expense_splits ?? [];
            const given = splits.reduce((s, sp) => s + Number(sp.amount), 0);
            const left = round2(Number(x.total) - given);
            const url = x.receipt_path ? photoUrls.get(x.receipt_path) : undefined;
            const parts = splits.map((s) => `${eventName.get(s.event_id) ?? "Event"} ${formatMoney(Number(s.amount))}`);
            if (left > 0) parts.push(`Stock ${formatMoney(left)}`);
            return (
              <div key={x.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.7rem 1rem", borderTop: "1px solid var(--color-border)" }}>
                <div>
                  <div>
                    {x.store || "Receipt"}
                    {x.is_return ? " (return)" : ""} · {formatDate(x.spent_on)}
                  </div>
                  <div className="muted small">
                    {parts.join(" · ")}
                    {url && (
                      <>
                        {" · "}
                        <a href={url} target="_blank" rel="noreferrer">
                          photo
                        </a>
                      </>
                    )}
                    {x.note ? ` · ${x.note}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "start", whiteSpace: "nowrap" }}>
                  <span style={{ fontWeight: 600 }}>{formatMoney(signed(x.total, x.is_return))}</span>
                  <form action={deleteExpense}>
                    <input type="hidden" name="id" value={x.id} />
                    <input type="hidden" name="back" value={`/admin/money?m=${ym}`} />
                    <button type="submit" className="link-button" aria-label="Delete receipt">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
