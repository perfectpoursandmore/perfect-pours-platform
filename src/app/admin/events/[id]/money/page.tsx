import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatDate } from "@/lib/labels";
import { expensesReady, moneyForEvents, signed } from "@/lib/money";
import { ExpensesSetupBox } from "../../../money/SetupBox";

function Row({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.45rem 0", borderTop: strong ? "1px solid var(--color-border-strong)" : undefined }}>
      <div>
        <div style={{ fontWeight: strong ? 700 : 400 }}>{label}</div>
        {hint && <div className="muted small">{hint}</div>}
      </div>
      <div style={{ fontWeight: strong ? 700 : 400, whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

/** The event's money box: what came in, what went out, what Faith kept. */
export default async function EventMoneyPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const ready = await expensesReady(supabase);
  const m = (await moneyForEvents(supabase, [params.id])).get(params.id)!;

  type SplitRow = {
    amount: number | string;
    expenses: { id: string; spent_on: string; store: string | null; total: number | string; is_return: boolean; receipt_path: string | null } | null;
  };
  let receipts: SplitRow[] = [];
  const photoUrls = new Map<string, string>();
  if (ready) {
    const { data } = await supabase
      .from("expense_splits")
      .select("amount, expenses(id, spent_on, store, total, is_return, receipt_path)")
      .eq("event_id", params.id);
    receipts = ((data ?? []) as unknown as (Omit<SplitRow, "expenses"> & { expenses: SplitRow["expenses"] | SplitRow["expenses"][] })[])
      .map((r) => ({ amount: r.amount, expenses: Array.isArray(r.expenses) ? r.expenses[0] ?? null : r.expenses }))
      .filter((r) => r.expenses)
      .sort((a, b) => a.expenses!.spent_on.localeCompare(b.expenses!.spent_on));
    const paths = receipts.map((r) => r.expenses!.receipt_path).filter((p): p is string => Boolean(p));
    if (paths.length) {
      const { data: signedUrls } = await supabase.storage.from("receipts").createSignedUrls(paths, 3600);
      for (const s of signedUrls ?? []) if (s.signedUrl && s.path) photoUrls.set(s.path, s.signedUrl);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      {!ready && <ExpensesSetupBox />}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Money for this event</h2>
        <Row
          label="Money in"
          value={formatMoney(m.moneyIn)}
          hint={m.hasQuote ? "From the Quote, not counting gratuity or sales tax" : "No Quote yet, so nothing to count"}
        />
        <Row
          label="Staff pay"
          value={`− ${formatMoney(m.staffPay)}`}
          hint={
            m.staffMissingPay > 0
              ? `${m.staffMissingPay} staff ${m.staffMissingPay === 1 ? "person has" : "people have"} no pay entered yet (on the Staff tab)`
              : "From Payouts"
          }
        />
        <Row label="Supplies" value={`− ${formatMoney(m.supplies)}`} hint={`${receipts.length} receipt${receipts.length === 1 ? "" : "s"}`} />
        <Row label="You kept" value={formatMoney(m.kept)} strong />

        {(m.gratuity > 0 || m.salesTax > 0) && (
          <div className="notice small" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
            {m.gratuity > 0 && (
              <div>
                Gratuity <strong>{formatMoney(m.gratuity)}</strong> goes to staff. It&apos;s left out of Money in, so it never
                looks like your income.
              </div>
            )}
            {m.salesTax > 0 && (
              <div>
                Sales tax <strong>{formatMoney(m.salesTax)}</strong> goes to the state, so it&apos;s left out too.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ display: "grid", gap: "0.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Receipts for this event</h2>
          <a className="button" href={`/admin/money/new?event=${params.id}`}>
            + Add a receipt
          </a>
        </div>
        {receipts.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            None yet. That&apos;s fine if this event only needed staff.
          </p>
        ) : (
          receipts.map((r, i) => {
            const e = r.expenses!;
            const url = e.receipt_path ? photoUrls.get(e.receipt_path) : undefined;
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", borderTop: "1px solid var(--color-border)", paddingTop: "0.6rem" }}>
                <div>
                  <div>
                    {e.store || "Receipt"}
                    {e.is_return ? " (return)" : ""}
                  </div>
                  <div className="muted small">
                    {formatDate(e.spent_on)} · receipt total {formatMoney(Number(e.total))}
                    {url && (
                      <>
                        {" · "}
                        <a href={url} target="_blank" rel="noreferrer">
                          photo
                        </a>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ whiteSpace: "nowrap" }}>{formatMoney(signed(r.amount, e.is_return))}</div>
              </div>
            );
          })
        )}
      </div>

      <a href="/admin/money" className="muted small">
        See all months →
      </a>
    </div>
  );
}
