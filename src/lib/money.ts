// Money in / money out for events and months. Kept to totals on purpose:
// Faith types each receipt's total once and how much went to each event,
// and never itemizes.
//
// Money in   = the Quote's total minus gratuity and sales tax (gratuity goes
//              to staff and sales tax goes to the state, so neither is hers).
// Staff      = the expected pay already entered on Payouts.
// Supplies   = her receipts' amounts for that event (returns count as minus).
// You kept   = Money in - Staff - Supplies.

// Same reason as lib/event-financials.ts: the real Supabase client's
// generics are too deep for a hand-written structural type.
type SupabaseLike = any;

const num = (v: unknown) => Number(v ?? 0) || 0;
export const round2 = (n: number) => Math.round(n * 100) / 100;

export type EventMoney = {
  hasQuote: boolean;
  quoteTotal: number;
  gratuity: number;
  salesTax: number;
  moneyIn: number;
  staffPay: number;
  staffMissingPay: number; // staff assigned with no pay entered yet
  supplies: number;
  kept: number;
};

export type ExpenseRow = {
  id: string;
  spent_on: string;
  store: string | null;
  total: number | string;
  is_return: boolean;
  note: string | null;
  receipt_path: string | null;
  created_at: string;
  expense_splits?: { event_id: string; amount: number | string }[] | null;
};

/** Signed amount: returns count as minus. */
export function signed(amount: unknown, isReturn: boolean): number {
  return isReturn ? -num(amount) : num(amount);
}

/** Quote numbers for many events at once (latest Quote per event). */
async function quotesFor(supabase: SupabaseLike, eventIds: string[]) {
  const byEvent = new Map<string, { total: number; gratuity: number; tax: number }>();
  if (eventIds.length === 0) return byEvent;
  const { data } = await supabase
    .from("proposals")
    .select("*")
    .in("event_id", eventIds)
    .order("created_at", { ascending: false });
  for (const p of (data ?? []) as Record<string, unknown>[]) {
    const id = String(p.event_id);
    if (byEvent.has(id)) continue; // keep the newest one
    byEvent.set(id, { total: num(p.total_amount), gratuity: num(p.gratuity_amount), tax: num(p.tax_amount) });
  }
  return byEvent;
}

/** Staff pay for many events at once, from Payouts. */
async function staffPayFor(supabase: SupabaseLike, eventIds: string[]) {
  const byEvent = new Map<string, { pay: number; missing: number }>();
  if (eventIds.length === 0) return byEvent;
  const { data: assignments } = await supabase
    .from("event_staff")
    .select("id, event_id")
    .in("event_id", eventIds)
    .not("staff_id", "is", null);
  const rows = (assignments ?? []) as { id: string; event_id: string }[];
  const ids = rows.map((a) => a.id);
  const { data: payouts } = ids.length
    ? await supabase.from("event_staff_payouts").select("event_staff_id, expected_pay").in("event_staff_id", ids)
    : { data: [] };
  const payByAssignment = new Map<string, number>(
    ((payouts ?? []) as { event_staff_id: string; expected_pay: unknown }[]).map((p) => [p.event_staff_id, num(p.expected_pay)])
  );
  for (const a of rows) {
    const cur = byEvent.get(a.event_id) ?? { pay: 0, missing: 0 };
    const pay = payByAssignment.get(a.id) ?? 0;
    if (pay > 0) cur.pay += pay;
    else cur.missing += 1;
    byEvent.set(a.event_id, cur);
  }
  return byEvent;
}

/** Receipt amounts given to each event (returns as minus). Empty if not set up yet. */
async function suppliesFor(supabase: SupabaseLike, eventIds: string[]) {
  const byEvent = new Map<string, number>();
  if (eventIds.length === 0) return byEvent;
  const { data, error } = await supabase
    .from("expense_splits")
    .select("event_id, amount, expenses(is_return)")
    .in("event_id", eventIds);
  if (error) return byEvent;
  for (const s of (data ?? []) as { event_id: string; amount: unknown; expenses: { is_return: boolean } | { is_return: boolean }[] | null }[]) {
    const exp = Array.isArray(s.expenses) ? s.expenses[0] : s.expenses;
    byEvent.set(s.event_id, (byEvent.get(s.event_id) ?? 0) + signed(s.amount, Boolean(exp?.is_return)));
  }
  return byEvent;
}

export async function moneyForEvents(supabase: SupabaseLike, eventIds: string[]): Promise<Map<string, EventMoney>> {
  const [quotes, staff, supplies] = await Promise.all([
    quotesFor(supabase, eventIds),
    staffPayFor(supabase, eventIds),
    suppliesFor(supabase, eventIds),
  ]);
  const out = new Map<string, EventMoney>();
  for (const id of eventIds) {
    const q = quotes.get(id);
    const s = staff.get(id) ?? { pay: 0, missing: 0 };
    const sup = round2(supplies.get(id) ?? 0);
    const moneyIn = q ? round2(q.total - q.gratuity - q.tax) : 0;
    out.set(id, {
      hasQuote: Boolean(q),
      quoteTotal: q?.total ?? 0,
      gratuity: q?.gratuity ?? 0,
      salesTax: q?.tax ?? 0,
      moneyIn,
      staffPay: round2(s.pay),
      staffMissingPay: s.missing,
      supplies: sup,
      kept: round2(moneyIn - s.pay - sup),
    });
  }
  return out;
}

/** True once the expenses SQL has been run in Supabase. */
export async function expensesReady(supabase: SupabaseLike): Promise<boolean> {
  const { error } = await supabase.from("expenses").select("id").limit(1);
  return !error;
}
