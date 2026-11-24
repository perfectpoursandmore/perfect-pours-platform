import { getValidConnection, listQboExpenses } from "@/lib/quickbooks";

// Brings Faith's QuickBooks expenses into the app so she never has to
// photograph receipts. New ones land untagged (so they count as Stock until
// she gives some to an event). Edits in QuickBooks update the amount/date
// but never touch her event amounts.

type SupabaseLike = any;

/**
 * Categories left out so nothing counts twice or counts as a cost when it
 * isn't one: staff pay is already on Payouts, and owner draws / transfers
 * aren't business spending. Left-out expenses are still listed (collapsed)
 * on the Money page with a "Count it" button in case one was wrong.
 */
const LEFT_OUT = /contract labor|contractor|subcontract|wage|payroll|salar|staff|owner|draw|transfer|loan|credit card payment/i;

export function isLeftOutCategory(category: string | null): boolean {
  return Boolean(category && LEFT_OUT.test(category));
}

const SYNC_EVERY_MS = 30 * 60 * 1000;

export type SyncResult = { connected: boolean; added: number; error?: string };

export async function syncQboExpenses(supabase: SupabaseLike, opts: { force?: boolean } = {}): Promise<SyncResult> {
  const { data: conn } = await supabase.from("qbo_connections").select("realm_id, expenses_synced_at").eq("id", true).maybeSingle();
  if (!conn?.realm_id) return { connected: false, added: 0 };

  const last = conn.expenses_synced_at ? new Date(conn.expenses_synced_at).getTime() : 0;
  if (!opts.force && last && Date.now() - last < SYNC_EVERY_MS) return { connected: true, added: 0 };

  const qbo = await getValidConnection();
  if (!qbo) return { connected: false, added: 0, error: "QuickBooks needs to be reconnected (Settings → QuickBooks)." };

  const startedAt = new Date().toISOString();
  let expenses;
  try {
    expenses = await listQboExpenses(
      qbo,
      last
        ? { changedSince: new Date(last - 24 * 60 * 60 * 1000).toISOString() } // a day of overlap, to be safe
        : { fromDate: `${new Date().getFullYear()}-01-01` } // first time: this whole year
    );
  } catch (err) {
    console.error("QuickBooks expense sync failed:", err);
    return { connected: true, added: 0, error: "Couldn't reach QuickBooks just now. Try again in a bit." };
  }

  let added = 0;
  if (expenses.length) {
    const { data: existing } = await supabase
      .from("expenses")
      .select("id, qbo_id")
      .in("qbo_id", expenses.map((e) => e.qboId));
    const idByQbo = new Map<string, string>(((existing ?? []) as { id: string; qbo_id: string }[]).map((r) => [r.qbo_id, r.id]));

    const fresh = expenses.filter((e) => !idByQbo.has(e.qboId));
    if (fresh.length) {
      const { error } = await supabase.from("expenses").insert(
        fresh.map((e) => ({
          source: "quickbooks",
          qbo_id: e.qboId,
          spent_on: e.date,
          store: e.payee,
          total: e.total,
          is_return: e.isRefund,
          category: e.category,
          note: e.note,
          counts: !isLeftOutCategory(e.category),
        }))
      );
      if (error) return { connected: true, added: 0, error: "Couldn't save the QuickBooks expenses." };
      added = fresh.length;
    }

    for (const e of expenses.filter((x) => idByQbo.has(x.qboId))) {
      await supabase
        .from("expenses")
        .update({ spent_on: e.date, store: e.payee, total: e.total, is_return: e.isRefund, category: e.category })
        .eq("id", idByQbo.get(e.qboId));
    }
  }

  await supabase.from("qbo_connections").update({ expenses_synced_at: startedAt }).eq("id", true);
  return { connected: true, added };
}
