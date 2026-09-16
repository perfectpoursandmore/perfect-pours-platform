import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDate } from "@/lib/labels";
import { SignaturePad } from "@/components/SignaturePad";
import { signContract } from "./actions";

export default async function ClientDocumentsPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { error?: string };
}) {
  const supabase = createAdminClient();

  const { data: event } = await supabase
    .from("events")
    .select("*, clients(first_name, last_name)")
    .eq("documents_token", params.token)
    .single();

  if (!event) notFound();

  const { data: proposal } = await supabase
    .from("proposals")
    .select("*")
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: contract } = await supabase
    .from("contracts")
    .select("*")
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: items } = proposal
    ? await supabase.from("proposal_items").select("*").eq("proposal_id", proposal.id).order("sort_order")
    : { data: [] };

  const { data: financials } = await supabase
    .from("event_financials")
    .select("deposit_paid, deposit_invoice_sent_at, balance_paid, balance_invoice_sent_at")
    .eq("event_id", event.id)
    .single();

  const client = Array.isArray(event.clients) ? event.clients[0] : event.clients;
  const ready = proposal && contract && contract.status !== "unsent";

  return (
    <main style={{ padding: "2rem 1.5rem", maxWidth: 640, margin: "0 auto" }}>
      <h1>{event.name}</h1>

      {!ready ? (
        <p style={{ color: "var(--color-muted)" }}>
          Your proposal and contract aren&apos;t ready yet — check back soon, or reach out to{" "}
          <a href="mailto:faith@perfectpoursandmore.com">faith@perfectpoursandmore.com</a> if you
          were expecting this link to be active.
        </p>
      ) : (
        <div style={{ display: "grid", gap: "1.5rem" }}>
          {searchParams.error && <p style={{ color: "#a33" }}>{searchParams.error}</p>}

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Proposal</h2>
            <p style={{ color: "var(--color-muted)" }}>
              {client?.first_name} {client?.last_name} — {formatDate(event.event_date)}
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {(items ?? []).map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.5rem 0", whiteSpace: "pre-line" }}>
                      {item.description} {item.quantity > 1 ? `(x${item.quantity})` : ""}
                    </td>
                    <td style={{ padding: "0.5rem 0", textAlign: "right" }}>{formatMoney(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.25rem" }}>
              <SummaryRow label="Subtotal" value={formatMoney(proposal!.subtotal)} />
              {Number(proposal!.discount_amount) > 0 && (
                <SummaryRow label="Discount" value={`- ${formatMoney(proposal!.discount_amount)}`} />
              )}
              {Number(proposal!.fee_amount) > 0 && <SummaryRow label="Fee" value={formatMoney(proposal!.fee_amount)} />}
              {Number(proposal!.tax_amount) > 0 && <SummaryRow label="Tax" value={formatMoney(proposal!.tax_amount)} />}
              <SummaryRow label="Total" value={formatMoney(proposal!.total_amount)} strong />
              <SummaryRow label="Deposit due" value={formatMoney(proposal!.deposit_amount)} />
            </div>
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Contract</h2>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
                fontSize: "0.9rem",
                background: "#faf9f7",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: "1rem",
              }}
            >
              {contract!.rendered_body}
            </pre>

            {contract!.status === "signed" ? (
              <p style={{ color: "#2a7a2a" }}>
                Signed by {contract!.signed_name} on {new Date(contract!.signed_at as string).toLocaleString()}.
              </p>
            ) : (
              <form action={signContract} style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}>
                <input type="hidden" name="token" value={params.token} />
                <div>
                  <label>Sign here</label>
                  <SignaturePad name="signatureData" />
                </div>
                <div>
                  <label htmlFor="signedName">Type your full legal name</label>
                  <input id="signedName" name="signedName" required style={{ maxWidth: 320 }} />
                </div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.9rem" }}>
                  <input type="checkbox" name="agree" required style={{ width: "auto", marginTop: "0.2rem" }} />
                  I have reviewed the agreement above and agree to its terms.
                </label>
                <button type="submit" className="button" style={{ justifySelf: "start" }}>
                  Sign contract
                </button>
              </form>
            )}
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Payment</h2>
            {financials?.deposit_paid ? (
              <p style={{ color: "#2a7a2a", margin: 0 }}>✓ Deposit received — thank you!</p>
            ) : financials?.deposit_invoice_sent_at ? (
              <p style={{ color: "var(--color-muted)", margin: 0 }}>
                We&apos;ve emailed you a secure QuickBooks invoice for your deposit — look for it
                from QuickBooks and use the &quot;Pay Now&quot; link there.
              </p>
            ) : (
              <p style={{ color: "var(--color-muted)", margin: 0 }}>
                Once your contract is signed, we&apos;ll follow up with a secure invoice for your
                deposit.
              </p>
            )}
            {financials?.deposit_paid && !financials?.balance_paid && financials?.balance_invoice_sent_at && (
              <p style={{ color: "var(--color-muted)", margin: "0.75rem 0 0" }}>
                We&apos;ve also emailed a secure QuickBooks invoice for your remaining balance.
              </p>
            )}
            {financials?.balance_paid && (
              <p style={{ color: "#2a7a2a", margin: "0.75rem 0 0" }}>✓ Balance paid in full — thank you!</p>
            )}
          </section>
        </div>
      )}

      <p style={{ color: "var(--color-muted)", fontSize: "0.85rem", marginTop: "2rem" }}>
        Questions about your event or this page? Email{" "}
        <a href="mailto:faith@perfectpoursandmore.com">faith@perfectpoursandmore.com</a>.
      </p>
    </main>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: strong ? 600 : 400 }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
