import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/labels";
import { isEmailConfigured } from "@/lib/email";
import {
  addProposalItem,
  removeProposalItem,
  updateProposalAdjustments,
  generateContract,
  sendBookingDocuments,
  markDepositReceived,
  markBalanceReceived,
  createInvoiceDraft,
  refreshInvoiceStatus,
} from "./actions";
import { AddProposalItemFields } from "./AddProposalItemFields";

export default async function EventBookingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const supabase = createClient();
  const eventId = params.id;

  const [
    { data: proposalRow },
    { data: contract },
    { data: catalogItems },
    { data: templates },
    { data: financials },
    { data: qboConnection },
    { data: emailTemplates },
  ] = await Promise.all([
    supabase
      .from("proposals")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from("contracts")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from("catalog_items")
      .select("id, name, description, default_price, pricing_type")
      .eq("active", true)
      .order("name"),
    supabase.from("contract_templates").select("id, name").eq("active", true).order("created_at"),
    supabase.from("event_financials").select("*").eq("event_id", eventId).single(),
    supabase.from("qbo_connections").select("connected_at, realm_id").eq("id", true).single(),
    supabase.from("email_templates").select("id, name").eq("active", true).order("created_at"),
  ]);

  // Every event gets a proposal row the first time this page loads -- it's
  // really just "the pricing worksheet this event's contract/invoice pull
  // from," not a client-facing quote she has to create as a separate step.
  // Faith can add line items and generate the contract/invoice right away,
  // whether or not she ever formally "sends" this as a proposal to review.
  let proposal = proposalRow;
  if (!proposal) {
    const { data: created } = await supabase
      .from("proposals")
      .insert({ event_id: eventId })
      .select("*")
      .single();
    proposal = created;
  }

  const qboConnected = Boolean(qboConnection?.connected_at && qboConnection?.realm_id);

  const { data: items } = proposal
    ? await supabase
        .from("proposal_items")
        .select("*")
        .eq("proposal_id", proposal.id)
        .order("sort_order")
    : { data: [] };

  const { data: eventRow } = await supabase.from("events").select("documents_token").eq("id", eventId).single();

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      {searchParams.error && <p style={{ color: "#a33" }}>{searchParams.error}</p>}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Booking status</h2>
        <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
          <StatusLine label="Proposal" ok={Boolean(financials?.proposal_sent)} okText="Sent" noText="Not sent" />
          <StatusLine label="Contract" ok={contract?.status === "signed"} okText="Signed" noText={contract?.status === "sent" ? "Sent, unsigned" : "Not sent"} />
          <StatusLine label="Retainer" ok={Boolean(financials?.deposit_paid)} okText="Received" noText="Outstanding" />
          <StatusLine label="Balance" ok={Boolean(financials?.balance_paid)} okText="Paid" noText="Outstanding" />
        </div>
        {financials && (
          <p style={{ marginBottom: 0, color: "var(--color-muted)" }}>
            Total {formatMoney(financials.total_amount)} — Deposit {formatMoney(financials.deposit_amount)} — Balance{" "}
            {formatMoney(financials.balance_amount)}
          </p>
        )}
      </div>

      {financials?.qbo_sync_error && (
        <p style={{ color: "#a33", margin: 0 }}>QuickBooks: {financials.qbo_sync_error}</p>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Invoice</h2>
        <p style={{ marginTop: "-0.5rem", marginBottom: "1rem", fontSize: "0.85rem", color: "var(--color-muted)" }}>
          One QuickBooks invoice for the full total, linked to this event automatically. It includes
          a note asking for the retainer amount up front, and if QuickBooks Payments has &quot;Allow
          partial payments&quot; turned on (Settings → Payments, in QuickBooks itself), the client can
          pay just that amount now and the rest later. This app only creates the invoice — you
          review it and send it yourself from inside QuickBooks.
        </p>
        {!qboConnected ? (
          <p style={{ color: "var(--color-muted)" }}>
            <a href="/admin/settings/quickbooks">Connect QuickBooks</a> to create a linked invoice
            there, or mark payments received manually below.
          </p>
        ) : financials?.balance_paid ? (
          <p style={{ color: "#2a7a2a", margin: 0 }}>✓ Paid in full.</p>
        ) : financials?.invoice_id ? (
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "var(--color-muted)", fontSize: "0.9rem" }}>
              Invoice created in QuickBooks and linked to this event.
              {financials.deposit_paid ? " Retainer received, balance outstanding." : " Review it in QuickBooks and send it from there whenever you're ready."}
            </span>
            <form action={refreshInvoiceStatus}>
              <input type="hidden" name="eventId" value={eventId} />
              <button type="submit" className="button">
                Check payment status
              </button>
            </form>
          </div>
        ) : (
          <form action={createInvoiceDraft}>
            <input type="hidden" name="eventId" value={eventId} />
            <button type="submit" className="button">
              Create invoice in QuickBooks
            </button>
          </form>
        )}
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
          {!financials?.deposit_paid && (
            <form action={markDepositReceived}>
              <input type="hidden" name="eventId" value={eventId} />
              <button
                type="submit"
                style={{ background: "none", border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.5rem 0.9rem", cursor: "pointer" }}
              >
                Mark retainer received manually (cash/check/Zelle)
              </button>
            </form>
          )}
          {!financials?.balance_paid && (
            <form action={markBalanceReceived}>
              <input type="hidden" name="eventId" value={eventId} />
              <button
                type="submit"
                style={{ background: "none", border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.5rem 0.9rem", cursor: "pointer" }}
              >
                Mark paid in full manually (cash/check/Zelle)
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Proposal</h2>
        <p style={{ marginTop: "-0.5rem", marginBottom: "1rem", fontSize: "0.85rem", color: "var(--color-muted)" }}>
          This is your pricing worksheet for the event -- add line items and adjustments here.
          It&apos;s not something the client has to approve first; the contract and invoice below
          pull straight from it whenever you&apos;re ready to send.
        </p>

        <div style={{ display: "grid", gap: "1rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ padding: "0.5rem 0" }}>Description</th>
                  <th style={{ padding: "0.5rem 0" }}>Qty</th>
                  <th style={{ padding: "0.5rem 0" }}>Unit price</th>
                  <th style={{ padding: "0.5rem 0" }}>Line total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(items ?? []).map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.5rem 0", whiteSpace: "pre-line" }}>{item.description}</td>
                    <td style={{ padding: "0.5rem 0" }}>{item.quantity}</td>
                    <td style={{ padding: "0.5rem 0" }}>{formatMoney(item.unit_price)}</td>
                    <td style={{ padding: "0.5rem 0" }}>{formatMoney(item.line_total)}</td>
                    <td style={{ padding: "0.5rem 0" }}>
                      <form action={removeProposalItem}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="proposalId" value={proposal.id} />
                        <input type="hidden" name="eventId" value={eventId} />
                        <button type="submit" style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer" }}>
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <form
              action={addProposalItem}
              style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: "0.75rem", alignItems: "end" }}
            >
              <input type="hidden" name="proposalId" value={proposal.id} />
              <input type="hidden" name="eventId" value={eventId} />
              <AddProposalItemFields catalogItems={catalogItems ?? []} />
              <input type="hidden" name="pricingType" value="flat" />
              <button type="submit" className="button">
                Add line
              </button>
            </form>

            <form
              action={updateProposalAdjustments}
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr auto", gap: "0.75rem", alignItems: "end" }}
            >
              <input type="hidden" name="proposalId" value={proposal.id} />
              <input type="hidden" name="eventId" value={eventId} />
              <div>
                <label htmlFor="discountAmount">Discount ($)</label>
                <input id="discountAmount" name="discountAmount" type="number" step="0.01" defaultValue={proposal.discount_amount} />
              </div>
              <div>
                <label htmlFor="feeAmount">Fee ($)</label>
                <input id="feeAmount" name="feeAmount" type="number" step="0.01" defaultValue={proposal.fee_amount} />
              </div>
              <div>
                <label htmlFor="gratuityRate">Gratuity (%)</label>
                <input id="gratuityRate" name="gratuityRate" type="number" step="0.001" defaultValue={proposal.gratuity_rate} />
              </div>
              <div>
                <label htmlFor="taxRate">Tax rate (%)</label>
                <input id="taxRate" name="taxRate" type="number" step="0.001" defaultValue={proposal.tax_rate} />
              </div>
              <div>
                <label htmlFor="depositAmount">Deposit ($)</label>
                <input id="depositAmount" name="depositAmount" type="number" step="0.01" defaultValue={proposal.deposit_amount} />
              </div>
              <button type="submit" className="button">
                Recalculate &amp; save
              </button>
            </form>

            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "0.75rem" }}>
              <Row label="Subtotal" value={formatMoney(proposal.subtotal)} />
              <Row label="Discount" value={`- ${formatMoney(proposal.discount_amount)}`} />
              <Row label="Fee" value={formatMoney(proposal.fee_amount)} />
              <Row label={`Gratuity (${proposal.gratuity_rate}%)`} value={formatMoney(proposal.gratuity_amount)} />
              <Row label="Tax" value={formatMoney(proposal.tax_amount)} />
              <Row label="Total" value={formatMoney(proposal.total_amount)} strong />
              <Row label="Deposit due" value={formatMoney(proposal.deposit_amount)} />
            </div>
          </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Contract</h2>
        <div style={{ display: "grid", gap: "1rem" }}>
            {contract?.status !== "signed" && (
              <form action={generateContract} style={{ display: "flex", gap: "0.75rem", alignItems: "end" }}>
                <input type="hidden" name="eventId" value={eventId} />
                <div style={{ flex: 1 }}>
                  <label htmlFor="templateId">Template</label>
                  <select id="templateId" name="templateId" style={selectStyle}>
                    {(templates ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="button">
                  {contract ? "Regenerate contract" : "Generate contract"}
                </button>
              </form>
            )}

            {contract && (
              <>
                <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--color-muted)" }}>
                  Status: <strong>{contract.status}</strong>
                  {contract.signed_at && ` — signed ${new Date(contract.signed_at).toLocaleString()}`}
                </p>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontFamily: "inherit",
                    fontSize: "0.85rem",
                    background: "#faf9f7",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    padding: "1rem",
                    maxHeight: 300,
                    overflow: "auto",
                  }}
                >
                  {contract.rendered_body}
                </pre>
              </>
            )}
          </div>
      </div>

      {proposal && contract && (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Send to client</h2>
          {proposal.status === "sent" || contract.status !== "unsent" ? (
            <>
              <p style={{ color: "#2a7a2a" }}>Sent to the client.</p>
              <p style={{ fontSize: "0.9rem" }}>
                Secure link (also useful to paste into a text message):
                <br />
                <code>/client/{eventRow?.documents_token}</code>
              </p>
            </>
          ) : (
            <form action={sendBookingDocuments} style={{ display: "grid", gap: "0.75rem" }}>
              <input type="hidden" name="eventId" value={eventId} />
              {isEmailConfigured() && (emailTemplates ?? []).length > 0 ? (
                <div>
                  <label htmlFor="emailTemplateId">Email the client using</label>
                  <select id="emailTemplateId" name="emailTemplateId" defaultValue={emailTemplates![0].id} style={selectStyle}>
                    {(emailTemplates ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-muted)" }}>
                  Email sending isn&apos;t configured yet (see <a href="/admin/settings/email">Settings → Email</a>)
                  — this will just prepare the secure link below to copy/paste.
                </p>
              )}
              {qboConnected && !financials?.invoice_id && (
                <label style={{ display: "flex", gap: "0.5rem", alignItems: "start", fontSize: "0.9rem" }}>
                  <input type="checkbox" name="alsoCreateInvoice" style={{ marginTop: "0.2rem" }} />
                  <span>
                    Also create the invoice in QuickBooks right now (you&apos;ll still review and
                    send it yourself from there).
                  </span>
                </label>
              )}
              <button type="submit" className="button" style={{ justifySelf: "start" }}>
                Send Booking Documents
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.7rem",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
};

function StatusLine({ label, ok, okText, noText }: { label: string; ok: boolean; okText: string; noText: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>{label}</div>
      <div style={{ color: ok ? "#2a7a2a" : "#a33" }}>{ok ? `✓ ${okText}` : `— ${noText}`}</div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: strong ? 600 : 400 }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
