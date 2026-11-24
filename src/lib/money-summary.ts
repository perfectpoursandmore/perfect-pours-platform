import { moneyForEvents, round2, signed } from "@/lib/money";
import { getMoneySettings, mileageTotals, type TripRow } from "@/lib/mileage";

type SupabaseLike = any;

export type MoneySummary = { sales: number; spent: number; staff: number; gratuity: number; kept: number; miles: number; mileageDeduction: number; setAside: number; setAsidePct: number };

/** The Money page's top numbers for one period, for the monthly email. */
export async function moneySummary(supabase: SupabaseLike, start: string, end: string): Promise<MoneySummary> {
  const [{ data: events }, { data: expenses }, { data: trips }, settings] = await Promise.all([
    supabase.from("events").select("id").in("status", ["booked", "completed"]).gte("event_date", start).lt("event_date", end),
    supabase.from("expenses").select("total, is_return, counts").gte("spent_on", start).lt("spent_on", end),
    supabase.from("mileage_trips").select("*").gte("trip_date", start).lt("trip_date", end),
    getMoneySettings(supabase),
  ]);
  const ids = ((events ?? []) as { id: string }[]).map((e) => e.id);
  const money = await moneyForEvents(supabase, ids);
  let sales = 0;
  let staff = 0;
  let gratuity = 0;
  for (const id of ids) {
    const m = money.get(id)!;
    sales += m.moneyIn;
    staff += m.staffPay;
    gratuity += m.gratuity;
  }
  const spent = ((expenses ?? []) as { total: unknown; is_return: boolean; counts: boolean }[])
    .filter((x) => x.counts !== false)
    .reduce((s, x) => s + signed(x.total, x.is_return), 0);
  const kept = round2(sales - staff - spent);
  const mileage = mileageTotals((trips ?? []) as TripRow[]);
  return {
    sales: round2(sales),
    spent: round2(spent),
    staff: round2(staff),
    gratuity: round2(gratuity),
    kept,
    miles: mileage.miles,
    mileageDeduction: mileage.deduction,
    setAside: round2(Math.max(0, kept - mileage.deduction) * (settings.set_aside_pct / 100)),
    setAsidePct: settings.set_aside_pct,
  };
}
