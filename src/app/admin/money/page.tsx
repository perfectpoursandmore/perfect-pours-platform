import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatDate } from "@/lib/labels";
import { expensesReady, moneyForEvents, round2, signed, staffPayByPerson, type ExpenseRow } from "@/lib/money";
import { syncQboExpenses } from "@/lib/expense-sync";
import { addTrip, deleteExpense, markAsStock, refreshFromQuickBooks, removeTrip, saveMoneySettings, setExpenseCounts, updateTripMiles } from "./actions";
import { fillEventTrips, getMoneySettings, mileageTotals, type TripRow } from "@/lib/mileage";
import { upcomingTaxDates, whenText } from "@/lib/tax-dates";
import { ExpensesSetupBox } from "./SetupBox";

// 1099-NEC: for payments made in 2026 onward the threshold is $2,000 (it was
// $600 before). Shown as a hint only; her accountant has the final say.
const FORM_1099_THRESHOLD = 2000;

type Row = ExpenseRow & { source?: string; category?: string | null; counts?: boolean; reviewed?: boolean };

function periodFor(searchParams: { m?: string; y?: string }) {
  const nowEt = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  if (/^\d{4}-\d{2}$/.test(searchParams.m ?? "")) {
    const ym = searchParams.m!;
    const [y, m] = ym.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    return {
      kind: "month" as const,
      start: `${ym}-01`,
      end: `${next}-01`,
      label: new Date(y, m - 1, 15).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      prevHref: `/admin/money?m=${prev}`,
      nextHref: `/admin/money?m=${next}`,
      self: `/admin/money?m=${ym}`,
      year: y,
    };
  }
  const y = /^\d{4}$/.test(searchParams.y ?? "") ? Number(searchParams.y) : Number(nowEt.slice(0, 4));
  return {
    kind: "year" as const,
    start: `${y}-01-01`,
    end: `${y + 1}-01-01`,
    label: String(y),
    prevHref: `/admin/money?y=${y - 1}`,
    nextHref: `/admin/money?y=${y + 1}`,
    self: `/admin/money?y=${y}`,
    year: y,
  };
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

const cell = { padding: "0.6rem 1rem", textAlign: "right" as const, whiteSpace: "nowrap" as const };

/**
 * Money at a glance, for the whole year or one month: sales, what she
 * spent, staff pay, gratuity passed to staff, and what she kept. Expenses
 * come in from QuickBooks on their own; she tags the ones that were for an
 * event and anything untagged counts as Stock.
 */
export default async function MoneyPage({
  searchParams,
}: {
  searchParams: { m?: string; y?: string; saved?: string; synced?: string; qboError?: string };
}) {
  const supabase = createClient();
  const p = periodFor(searchParams);
  const ready = await expensesReady(supabase);
  const sync = ready ? await syncQboExpenses(supabase) : { connected: false, added: 0 };
  const settings = await getMoneySettings(supabase);
  if (ready) await fillEventTrips(supabase, settings, { from: p.start, to: p.end, limit: 4 });
  const { data: tripData } = ready
    ? await supabase.from("mileage_trips").select("*").gte("trip_date", p.start).lt("trip_date", p.end).order("trip_date", { ascending: false })
    : { data: [] };
  const trips = (tripData ?? []) as TripRow[];
  const mileage = mileageTotals(trips);
  const todayEt = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const taxDates = upcomingTaxDates(todayEt, 30, settings.sales_tax_filing);

  const [{ data: periodEvents }, expenseResult, toTagResult] = await Promise.all([
    supabase
      .from("events")
      .select("id, name, event_date")
      .in("status", ["booked", "completed"])
      .gte("event_date", p.start)
      .lt("event_date", p.end)
      .order("event_date"),
    ready
      ? supabase.from("expenses").select("*, expense_splits(event_id, amount)").gte("spent_on", p.start).lt("spent_on", p.end).order("spent_on", { ascending: false })
      : Promise.resolve({ data: [] }),
    ready
      ? supabase
          .from("expenses")
          .select("*")
          .eq("reviewed", false)
          .eq("counts", true)
          .gte("spent_on", new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10))
          .order("spent_on", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const events = (periodEvents ?? []) as { id: string; name: string; event_date: string }[];
  const eventIds = events.map((e) => e.id);
  const [money, staffRows] = await Promise.all([moneyForEvents(supabase, eventIds), staffPayByPerson(supabase, eventIds)]);
  const allExpenses = (expenseResult.data ?? []) as Row[];
  const expenses = allExpenses.filter((x) => x.counts !== false);
  const leftOut = allExpenses.filter((x) => x.counts === false);
  const toTag = (toTagResult.data ?? []) as Row[];

  // Totals.
  let sales = 0;
  let gratuity = 0;
  let staffPay = 0;
  for (const id of eventIds) {
    const m = money.get(id)!;
    sales += m.moneyIn;
    gratuity += m.gratuity;
    staffPay += m.staffPay;
  }
  let spent = 0;
  let stock = 0;
  for (const x of expenses) {
    const given = (x.expense_splits ?? []).reduce((s, sp) => s + Number(sp.amount), 0);
    spent += signed(x.total, x.is_return);
    stock += signed(Number(x.total) - given, x.is_return);
  }
  const kept = round2(sales - staffPay - spent);
  // A rough "put this aside" number: her % of what she kept, after the
  // mileage deduction. Not a tax calculation; it just keeps April calm.
  const setAside = round2(Math.max(0, kept - mileage.deduction) * (settings.set_aside_pct / 100));

  // Year view: one row per month.
  const months =
    p.kind === "year"
      ? Array.from({ length: 12 }, (_, i) => {
          const ym = `${p.year}-${String(i + 1).padStart(2, "0")}`;
          let mSales = 0;
          let mStaff = 0;
          for (const e of events.filter((ev) => ev.event_date.startsWith(ym))) {
            mSales += money.get(e.id)!.moneyIn;
            mStaff += money.get(e.id)!.staffPay;
          }
          const mSpent = expenses.filter((x) => x.spent_on.startsWith(ym)).reduce((s, x) => s + signed(x.total, x.is_return), 0);
          return { ym, label: new Date(p.year, i, 15).toLocaleDateString("en-US", { month: "short" }), sales: mSales, staff: mStaff, spent: mSpent, kept: round2(mSales - mStaff - mSpent) };
        }).filter((m) => m.sales || m.staff || m.spent)
      : [];

  // Event names for the expense list.
  const eventName = new Map(events.map((e) => [e.id, e.name]));
  const otherIds = Array.from(
    new Set([...allExpenses.flatMap((x) => (x.expense_splits ?? []).map((s) => s.event_id)), ...trips.map((t) => t.event_id).filter((id): id is string => Boolean(id))])
  ).filter((id) => !eventName.has(id));
  if (otherIds.length) {
    const { data } = await supabase.from("events").select("id, name").in("id", otherIds);
    for (const e of (data ?? []) as { id: string; name: string }[]) eventName.set(e.id, e.name);
  }

  // Photo links (cash receipts only).
  const photoUrls = new Map<string, string>();
  const paths = expenses.map((x) => x.receipt_path).filter((x): x is string => Boolean(x));
  if (p.kind === "month" && paths.length) {
    const { data: signedUrls } = await supabase.storage.from("receipts").createSignedUrls(paths, 3600);
    for (const s of signedUrls ?? []) if (s.signedUrl && s.path) photoUrls.set(s.path, s.signedUrl);
  }

  const tagHref = (id: string) => `/admin/money/${id}?back=${encodeURIComponent(p.self)}`;

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 860 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Money</h1>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginTop: "0.3rem", flexWrap: "wrap" }}>
            <a href={p.prevHref} aria-label="Earlier" style={{ textDecoration: "none" }}>
              ←
            </a>
            <strong>{p.label}</strong>
            <a href={p.nextHref} aria-label="Later" style={{ textDecoration: "none" }}>
              →
            </a>
            {p.kind === "month" ? (
              <a href={`/admin/money?y=${p.year}`} className="small">
                Whole year
              </a>
            ) : (
              <a href={`/admin/money?m=${new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(0, 7)}`} className="small">
                This month
              </a>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {sync.connected && (
            <form action={refreshFromQuickBooks}>
              <button type="submit" className="button-secondary">
                Check QuickBooks now
              </button>
            </form>
          )}
          <a className="button" href="/admin/money/new">
            + Cash receipt
          </a>
        </div>
      </div>

      {searchParams.saved && <p className="notice" style={{ margin: 0 }}>Saved.</p>}
      {searchParams.synced !== undefined && (
        <p className="notice" style={{ margin: 0 }}>
          {Number(searchParams.synced) > 0 ? `${searchParams.synced} new from QuickBooks.` : "Up to date with QuickBooks."}
        </p>
      )}
      {(searchParams.qboError || ("error" in sync && sync.error)) && (
        <p className="notice" style={{ margin: 0, color: "var(--color-danger)" }}>
          {searchParams.qboError || ("error" in sync ? sync.error : "")}
        </p>
      )}
      {!ready && <ExpensesSetupBox />}
      {taxDates.map((t) => (
        <div key={t.date + t.title} className="notice" style={{ margin: 0 }}>
          <strong>{t.title} {whenText(todayEt, t.date)}.</strong> {t.detail}
        </div>
      ))}
      {ready && !sync.connected && !("error" in sync && sync.error) && (
        <p className="notice" style={{ margin: 0 }}>
          Connect QuickBooks (Settings → QuickBooks Online) and your expenses will show up here on their own.
        </p>
      )}

      {toTag.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "1rem 1rem 0.5rem" }}>
            <h2 style={{ margin: 0, fontSize: "1rem" }}>New from QuickBooks ({toTag.length})</h2>
            <div className="muted small">
              Tap one that was for an event. Anything you skip just counts as Stock, so there&apos;s no need to clear this list.
            </div>
          </div>
          {toTag.slice(0, 12).map((x) => (
            <div key={x.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", padding: "0.6rem 1rem", borderTop: "1px solid var(--color-border)" }}>
              <a href={tagHref(x.id)} style={{ textDecoration: "none", color: "inherit", flex: 1 }}>
                <div>
                  {x.store || "Expense"}
                  {x.is_return ? " (refund)" : ""} · <strong>{formatMoney(signed(x.total, x.is_return))}</strong>
                </div>
                <div className="muted small">
                  {formatDate(x.spent_on)}
                  {x.category ? ` · ${x.category}` : ""}
                </div>
              </a>
              <a href={tagHref(x.id)} className="button" style={{ whiteSpace: "nowrap" }}>
                For an event
              </a>
              <form action={markAsStock}>
                <input type="hidden" name="id" value={x.id} />
                <button type="submit" className="link-button">
                  Stock
                </button>
              </form>
            </div>
          ))}
          {toTag.length > 12 && <p className="muted small" style={{ padding: "0.5rem 1rem 1rem", margin: 0 }}>And {toTag.length - 12} more.</p>}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
        <Stat label="Sales" value={formatMoney(sales)} hint="Booked events, not counting gratuity or sales tax" />
        <Stat label="Spent" value={formatMoney(spent)} hint={stock ? `${formatMoney(stock)} of it is Stock` : "Supplies and other costs"} />
        <Stat label="Paid to staff" value={formatMoney(staffPay)} hint="From Payouts" />
        <Stat label="Gratuity to staff" value={formatMoney(gratuity)} hint="Passed along, not your money" />
        <Stat label="You kept" value={formatMoney(kept)} strong />
        <Stat label="Miles driven" value={mileage.miles.toLocaleString("en-US")} hint={`${formatMoney(mileage.deduction)} tax deduction`} />
        <Stat label="Set aside for taxes" value={formatMoney(setAside)} hint={`${settings.set_aside_pct}% of what you kept, after mileage`} />
      </div>
      {ready && !settings.home_address && (
        <p className="notice" style={{ margin: 0 }}>
          Add your home address in <a href="#money-settings">Money settings</a> below and your miles to each event get filled in on
          their own.
        </p>
      )}

      {p.kind === "year" && months.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ ...cell, textAlign: "left" }}>Month</th>
                <th style={cell}>Sales</th>
                <th style={cell}>Spent</th>
                <th style={cell}>Staff</th>
                <th style={cell}>Kept</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.ym} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ ...cell, textAlign: "left" }}>
                    <a href={`/admin/money?m=${m.ym}`}>{m.label}</a>
                  </td>
                  <td style={cell}>{formatMoney(m.sales)}</td>
                  <td style={cell}>{formatMoney(m.spent)}</td>
                  <td style={cell}>{formatMoney(m.staff)}</td>
                  <td style={{ ...cell, fontWeight: 600 }}>{formatMoney(m.kept)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {staffRows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "1rem 1rem 0.5rem" }}>
            <h2 style={{ margin: 0, fontSize: "1rem" }}>Paid to each person {p.kind === "year" ? `in ${p.year}` : "this month"}</h2>
            {p.kind === "year" && (
              <div className="muted small">
                Anyone at {formatMoney(FORM_1099_THRESHOLD)} or more usually needs a 1099 in January. Gratuity you passed along isn&apos;t
                split by person here, so give your accountant that total too.
              </div>
            )}
          </div>
          {staffRows.map((s) => (
            <div key={s.staffId} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.6rem 1rem", borderTop: "1px solid var(--color-border)" }}>
              <div>
                <a href={`/admin/staff/${s.staffId}`}>{s.name}</a>
                <div className="muted small">
                  {s.events} event{s.events === 1 ? "" : "s"}
                  {s.missing > 0 ? ` · ${s.missing} with no pay entered` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <strong>{formatMoney(s.pay)}</strong>
                {p.kind === "year" && s.pay >= FORM_1099_THRESHOLD && <div className="small" style={{ color: "var(--color-accent)" }}>1099</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {p.kind === "month" && (
        <>
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
            <h2 style={{ margin: 0, padding: "1rem 1rem 0.5rem", fontSize: "1rem" }}>Spending</h2>
            {expenses.length === 0 ? (
              <p className="muted" style={{ padding: "0 1rem 1rem", margin: 0 }}>Nothing this month.</p>
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
                    <a href={tagHref(x.id)} style={{ textDecoration: "none", color: "inherit" }}>
                      <div>
                        {x.store || "Expense"}
                        {x.is_return ? " (refund)" : ""} · {formatDate(x.spent_on)}
                      </div>
                      <div className="muted small">
                        {parts.join(" · ")}
                        {x.category ? ` · ${x.category}` : ""}
                      </div>
                    </a>
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "start", whiteSpace: "nowrap" }}>
                      <span style={{ fontWeight: 600 }}>{formatMoney(signed(x.total, x.is_return))}</span>
                      {url && (
                        <a href={url} target="_blank" rel="noreferrer" className="small">
                          photo
                        </a>
                      )}
                      {x.source === "quickbooks" ? (
                        <form action={setExpenseCounts}>
                          <input type="hidden" name="id" value={x.id} />
                          <input type="hidden" name="counts" value="0" />
                          <input type="hidden" name="back" value={p.self} />
                          <button type="submit" className="link-button" title="Not a business cost, or already counted on Payouts">
                            Leave out
                          </button>
                        </form>
                      ) : (
                        <form action={deleteExpense}>
                          <input type="hidden" name="id" value={x.id} />
                          <input type="hidden" name="back" value={p.self} />
                          <button type="submit" className="link-button">
                            Delete
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>


          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: "1rem 1rem 0.5rem" }}>
              <h2 style={{ margin: 0, fontSize: "1rem" }}>Mileage</h2>
              <div className="muted small">Event round trips fill in on their own. Change a number if it&apos;s off, or add a shopping run.</div>
            </div>
            {trips.map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", padding: "0.5rem 1rem", borderTop: "1px solid var(--color-border)", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div>{t.event_id ? eventName.get(t.event_id) ?? "Event" : t.note || "Trip"}</div>
                  <div className="muted small">
                    {formatDate(t.trip_date)}
                    {t.event_id && t.note ? ` · ${t.note}` : ""}
                  </div>
                </div>
                <form action={updateTripMiles} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="back" value={p.self} />
                  <input name="miles" defaultValue={Number(t.miles)} inputMode="decimal" aria-label="Miles" style={{ width: 80 }} />
                  <span className="muted small">mi</span>
                  <button type="submit" className="link-button">
                    Save
                  </button>
                </form>
                <form action={removeTrip}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="back" value={p.self} />
                  <button type="submit" className="link-button">
                    Remove
                  </button>
                </form>
              </div>
            ))}
            <form action={addTrip} style={{ display: "flex", gap: "0.5rem", alignItems: "end", padding: "0.75rem 1rem 1rem", borderTop: "1px solid var(--color-border)", flexWrap: "wrap" }}>
              <input type="hidden" name="back" value={p.self} />
              <div>
                <label htmlFor="tripDate" className="small">Date</label>
                <input id="tripDate" name="tripDate" type="date" defaultValue={todayEt} />
              </div>
              <div>
                <label htmlFor="tripMiles" className="small">Miles (round trip)</label>
                <input id="tripMiles" name="miles" inputMode="decimal" style={{ width: 110 }} required />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label htmlFor="tripNote" className="small">What for</label>
                <input id="tripNote" name="note" placeholder="Shopping" />
              </div>
              <button type="submit" className="button-secondary">
                Add trip
              </button>
            </form>
          </div>

          {leftOut.length > 0 && (
            <details className="card">
              <summary style={{ cursor: "pointer" }}>
                Left out ({leftOut.length}): staff pay and transfers from QuickBooks, so nothing counts twice
              </summary>
              {leftOut.map((x) => (
                <div key={x.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.5rem 0", borderTop: "1px solid var(--color-border)" }}>
                  <div>
                    {x.store || "Expense"} · {formatMoney(signed(x.total, x.is_return))}
                    <div className="muted small">
                      {formatDate(x.spent_on)}
                      {x.category ? ` · ${x.category}` : ""}
                    </div>
                  </div>
                  <form action={setExpenseCounts}>
                    <input type="hidden" name="id" value={x.id} />
                    <input type="hidden" name="counts" value="1" />
                    <input type="hidden" name="back" value={p.self} />
                    <button type="submit" className="link-button">
                      Count it
                    </button>
                  </form>
                </div>
              ))}
            </details>
          )}
        </>
      )}


      {ready && (
        <details className="card" id="money-settings" open={!settings.home_address}>
          <summary style={{ cursor: "pointer" }}>
            <strong>Money settings</strong>
          </summary>
          <form action={saveMoneySettings} style={{ display: "grid", gap: "0.9rem", marginTop: "0.75rem" }}>
            <input type="hidden" name="back" value={p.self} />
            <div>
              <label htmlFor="homeAddress">Where you drive from</label>
              <input id="homeAddress" name="homeAddress" defaultValue={settings.home_address ?? ""} placeholder="Street, town, ZIP" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label htmlFor="setAsidePct">Set aside for taxes (%)</label>
                <input id="setAsidePct" name="setAsidePct" type="number" min={0} max={60} step={1} defaultValue={settings.set_aside_pct} />
              </div>
              <div>
                <label htmlFor="salesTaxFiling">NY sales tax, you file</label>
                <select id="salesTaxFiling" name="salesTaxFiling" defaultValue={settings.sales_tax_filing}>
                  <option value="quarterly">Every quarter</option>
                  <option value="annual">Once a year</option>
                </select>
              </div>
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              25 to 30% is a common amount to put aside when you&apos;re self-employed. Your accountant can tell you your number.
            </p>
            <button type="submit" className="button" style={{ justifySelf: "start" }}>
              Save
            </button>
          </form>
        </details>
      )}

      {p.kind === "year" && (
        <p className="muted small" style={{ margin: 0 }}>
          Tap a month to see its events and spending.
        </p>
      )}
    </div>
  );
}
