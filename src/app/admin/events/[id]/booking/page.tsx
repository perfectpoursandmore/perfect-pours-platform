import { createClient } from "@/lib/supabase/server";
import { EVENT_STATUS_LABELS, formatDateTime, formatMoney, linePrice } from "@/lib/labels";
import { isEmailConfigured } from "@/lib/email";
import { timeOfDayInZone } from "@/lib/calendar-dates";
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
  saveIntroNote,
  sendPricing,
  markAddonsHandled,
  updateBookingStatus,
  saveEventDetails,
  setChosenOption,
} from "./actions";
import { buildDraftProposal } from "@/lib/auto-proposal";
import { getPriceList } from "@/lib/price-list";
import { computeProposalTotals, effectiveOption, linesForOption, proposalOptions } from "@/lib/proposals";
import { DISHWARE, EXTRA_HELP, SERVICES, SERVICE_STYLES, type Option } from "@/lib/event-details";
import { AddProposalItemFields } from "./AddProposalItemFields";

type Item = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  note: string | null;
  option_label?: string | null;
};

export default async function EventBookingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; pricingSent?: string; statusSaved?: string; detailsSaved?: string; invoiceCreated?: string };
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
    { data: eventRow },
    { data: lead },
  ] = await Promise.all([
    supabase.from("proposals").select("*").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).single(),
    supabase.from("contracts").select("*").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).single(),
    supabase.from("catalog_items").select("id, name, description, default_price, pricing_type").eq("active", true).order("name"),
    supabase.from("contract_templates").select("id, name").eq("active", true).order("created_at"),
    supabase.from("event_financials").select("*").eq("event_id", eventId).single(),
    supabase.from("qbo_connections").select("connected_at, realm_id, environment").eq("id", true).single(),
    supabase.from("email_templates").select("id, name").eq("active", true).order("created_at"),
    supabase.from("events").select("*").eq("id", eventId).single(),
    supabase.from("leads").select("message, consultation_at").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  // Every event gets a proposal row the first time this page loads -- it's
  // the pricing worksheet the contract and invoice pull from.
  let proposal = proposalRow;
  if (!proposal) {
    const { data: created } = await supabase.from("proposals").insert({ event_id: eventId }).select("*").single();
    proposal = created;
  }

  const qboConnected = Boolean(qboConnection?.connected_at && qboConnection?.realm_id);
  // Straight to the invoice inside QuickBooks, to review and send it there.
  const qboInvoiceUrl = (id: string) =>
    `https://app.${qboConnection?.environment === "production" ? "" : "sandbox."}qbo.intuit.com/app/invoice?txnId=${id}`;
  const { data: itemRows } = proposal
    ? await supabase.from("proposal_items").select("*").eq("proposal_id", proposal.id).order("sort_order")
    : { data: [] };
  const items = (itemRows ?? []) as Item[];

  const priceList = await getPriceList(supabase);
  const draft = eventRow ? buildDraftProposal(eventRow, priceList) : null;
  const pricingSent = proposal?.status === "sent";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://perfect-pours-platform.vercel.app";
  const clientLink = eventRow ? `${appUrl}/client/${eventRow.documents_token}` : "";
  const requestedAddons: string[] = proposal?.requested_addons ?? [];
  const addonsPending = requestedAddons.length > 0 && !proposal?.addons_handled_at;

  // A status Faith set by hand (paper contract, older booking) wins over the app's own.
  const contractStatus: string = financials?.contract_status_manual ?? contract?.status ?? "unsent";
  const proposalSentNow = Boolean(financials?.proposal_sent) || pricingSent;

  // Options (package vs bartender only): the client picks one.
  const options = proposalOptions(items);
  const chosen: string | null = proposal?.chosen_option && options.includes(proposal.chosen_option) ? proposal.chosen_option : null;
  const shared = items.filter((i) => !i.option_label);
  const totalFor = (option: string | null) =>
    computeProposalTotals({
      lineTotals: linesForOption(items, option).map((i) => Number(i.line_total)),
      discountAmount: Number(proposal?.discount_amount ?? 0),
      feeAmount: Number(proposal?.fee_amount ?? 0),
      gratuityRatePercent: Number(proposal?.gratuity_rate ?? 0),
      taxRatePercent: Number(proposal?.tax_rate ?? 0),
    }).totalAmount;
  const shownOption = effectiveOption(items, chosen);

  // The options feature needs a one-time database update (0022). select("*")
  // on proposals tells us whether it's been run.
  const optionsDbReady = Boolean(proposal && "chosen_option" in proposal);
  const draftHasOptions = Boolean(draft?.lines.some((l) => l.option));
  const proposalOutOfDate = draftHasOptions && items.length > 0 && options.length === 0;

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      {searchParams.error && <p style={{ margin: 0, color: "var(--color-danger)" }}>{searchParams.error}</p>}

      {!optionsDbReady && (
        <div className="notice" style={{ border: "1px solid var(--color-danger)" }}>
          <strong>One-time setup needed for package vs bartender options.</strong>
          <p style={{ margin: "0.4rem 0" }}>
            In Supabase, open the SQL Editor, paste this in, click Run, then come back and click Save &amp; rebuild quote:
          </p>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "0.82rem", background: "#fff", padding: "0.6rem", borderRadius: 6 }}>
            {OPTIONS_SQL}
          </pre>
        </div>
      )}

      {/* ---------- Status at a glance ---------- */}
      <section className="card" style={{ display: "grid", gap: "0.85rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <span className="pill pill-done">{EVENT_STATUS_LABELS[eventRow?.status ?? "inquiry"] ?? eventRow?.status}</span>
          <StatusPill label="Pricing" done={proposalSentNow} doneText="sent" />
          <StatusPill label="Contract" done={contractStatus === "signed"} doneText="signed" pendingText={contractStatus === "sent" ? "sent" : undefined} />
          <StatusPill label="Retainer" done={Boolean(financials?.deposit_paid)} doneText="paid" />
          <StatusPill label="Balance" done={Boolean(financials?.balance_paid)} doneText="paid" />
        </div>
        {financials?.total_amount != null && (
          <p className="muted small" style={{ margin: 0 }}>
            Total {formatMoney(financials.total_amount)} · Retainer {formatMoney(financials.deposit_amount)} · Balance{" "}
            {formatMoney(financials.balance_amount)}
          </p>
        )}
        {lead?.consultation_at && (
          <p className="small" style={{ margin: 0 }}>
            {new Date(lead.consultation_at) > new Date() ? "Planning call booked: " : "Planning call was "}
            <strong>{formatDateTime(lead.consultation_at)}</strong>
          </p>
        )}
        {searchParams.statusSaved && <p className="small" style={{ margin: 0 }}>✓ Booking status saved.</p>}

        <details>
          <summary className="small">Edit status</summary>
          <form action={updateBookingStatus} style={{ display: "grid", gap: "0.9rem", marginTop: "0.9rem" }}>
            <input type="hidden" name="eventId" value={eventId} />
            <p className="muted small" style={{ margin: 0 }}>
              For events booked outside the app. Contract signed + retainer received marks it Booked automatically.
            </p>
            <div style={autoGrid}>
              <Select name="eventStatus" label="Event" value={eventRow?.status ?? "inquiry"} options={Object.entries(EVENT_STATUS_LABELS)} />
              <Select name="pricing" label="Pricing" value={proposalSentNow ? "sent" : "unsent"} options={[["unsent", "Not sent"], ["sent", "Sent"]]} />
              <Select
                name="contract"
                label="Contract"
                value={contractStatus}
                options={[["unsent", "Not sent"], ["sent", "Sent, not signed"], ["signed", "Signed"]]}
              />
              <Select
                name="retainer"
                label="Retainer"
                value={financials?.deposit_paid ? "received" : "outstanding"}
                options={[["outstanding", "Outstanding"], ["received", "Received"]]}
              />
              <Select
                name="balance"
                label="Balance"
                value={financials?.balance_paid ? "paid" : "outstanding"}
                options={[["outstanding", "Outstanding"], ["paid", "Paid in full"]]}
              />
              <div>
                <label htmlFor="totalAmount">Event total ($)</label>
                <input id="totalAmount" name="totalAmount" type="number" min={0} step="0.01" defaultValue={financials?.total_amount ?? ""} />
              </div>
              <div>
                <label htmlFor="statusDepositAmount">Retainer ($)</label>
                <input id="statusDepositAmount" name="depositAmount" type="number" min={0} step="0.01" defaultValue={financials?.deposit_amount ?? ""} />
              </div>
            </div>
            <div>
              <button type="submit" className="button">
                Save status
              </button>
            </div>
          </form>
        </details>
      </section>

      {/* ---------- What they asked for ---------- */}
      <section className="card">
        <h2 style={h2}>What they asked for</h2>
        {lead?.message && (
          <div className="notice" style={{ marginTop: "0.75rem", whiteSpace: "pre-line" }}>
            <span className="muted small">Their note</span>
            <br />
            {lead.message}
          </div>
        )}
        {searchParams.detailsSaved && <p className="small" style={{ margin: "0.75rem 0 0" }}>✓ Details saved.</p>}
        <form action={saveEventDetails} style={{ display: "grid", gap: "1.1rem", marginTop: "1rem" }}>
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="proposalId" value={proposal?.id ?? ""} />

          <div style={autoGrid}>
            <div>
              <label htmlFor="guestCount">Guests</label>
              <input id="guestCount" name="guestCount" type="number" min={1} defaultValue={eventRow?.guest_count ?? ""} />
            </div>
            <div>
              <label htmlFor="staffArrivalTime">Staff arrive</label>
              <input id="staffArrivalTime" name="staffArrivalTime" type="time" defaultValue={timeOfDayInZone(eventRow?.staff_arrival_time)} />
            </div>
            <div>
              <label htmlFor="guestArrivalTime">Guests arrive</label>
              <input id="guestArrivalTime" name="guestArrivalTime" type="time" defaultValue={timeOfDayInZone(eventRow?.guest_arrival_time)} />
            </div>
            <div>
              <label htmlFor="staffEndTime">Staff end</label>
              <input id="staffEndTime" name="staffEndTime" type="time" defaultValue={timeOfDayInZone(eventRow?.staff_end_time)} />
            </div>
          </div>

          <div>
            <span style={fieldHeading}>Services</span>
            <Checks name="services" options={SERVICES} selected={eventRow?.services_interested ?? []} />
          </div>

          <div style={autoGrid}>
            <Select
              name="serviceStyle"
              label="Food"
              value={eventRow?.service_style ?? ""}
              options={[["", "—"], ...SERVICE_STYLES.map((o): [string, string] => [o.value, o.label])]}
            />
            <Select
              name="dishware"
              label="Dishware"
              value={eventRow?.dishware ?? ""}
              options={[["", "—"], ...DISHWARE.map((o): [string, string] => [o.value, o.label])]}
            />
          </div>

          <div>
            <span style={fieldHeading}>Extra help</span>
            <Checks name="extraHelp" options={EXTRA_HELP} selected={eventRow?.extra_help ?? []} />
          </div>

          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
            {!draft?.customQuote && !(contract && contract.status !== "unsent") ? (
              <>
                <button type="submit" name="intent" value="build" className="button">
                  {items.length > 0 ? "Save & rebuild quote" : "Save & build quote"}
                </button>
                <button type="submit" name="intent" value="save" className="button-secondary">
                  Save only
                </button>
                {items.length > 0 && (
                  <span className="muted small">
                    Rebuilding replaces the quote below.
                  </span>
                )}
              </>
            ) : (
              <button type="submit" name="intent" value="save" className="button">
                Save
              </button>
            )}
          </div>
          {draft?.customQuote && (
            <p className="muted small" style={{ margin: 0 }}>
              {draft.customQuote}: this one gets a custom quote, so add the lines yourself below.
            </p>
          )}
        </form>
      </section>

      {/* ---------- Send pricing ---------- */}
      <section className="card" style={{ display: "grid", gap: "0.9rem" }}>
        <div>
          <h2 style={h2}>Send pricing</h2>
          <p className="muted small" style={{ margin: "0.25rem 0 0" }}>
            Sends them a menu of the services they asked about, with prices and descriptions from your Price List, plus a
            button to book a planning call.
          </p>
        </div>

        {searchParams.pricingSent && (
          <p className="small" style={{ margin: 0 }}>
            {searchParams.pricingSent === "emailed"
              ? "✓ Sent. The client got an email with their link."
              : "✓ Marked as sent. Copy the link below and text or email it to them."}
          </p>
        )}

        {proposal && (
          <form action={saveIntroNote} style={{ display: "grid", gap: "0.5rem" }}>
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="proposalId" value={proposal.id} />
            <label htmlFor="introNote" style={{ margin: 0 }}>
              Personal note at the top of their page (optional)
            </label>
            <textarea
              id="introNote"
              name="introNote"
              rows={2}
              defaultValue={proposal.intro_note ?? ""}
              placeholder="e.g. Looking forward to making your wife's birthday fun and stress-free!"
            />
            <div>
              <button type="submit" className="link-button">
                Save note
              </button>
            </div>
          </form>
        )}

        {proposal && !pricingSent ? (
          <form action={sendPricing} style={{ display: "flex", gap: "0.9rem", alignItems: "center", flexWrap: "wrap" }}>
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="proposalId" value={proposal.id} />
            <button type="submit" className="button">
              Send pricing
            </button>
            {isEmailConfigured() && (
              <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", margin: 0, color: "var(--color-text)" }}>
                <input type="checkbox" name="emailClient" defaultChecked />
                Email them the link
              </label>
            )}
            <a href={`${clientLink}?preview=1`} target="_blank" rel="noreferrer" className="small">
              Preview their page
            </a>
          </form>
        ) : (
          <div className="small" style={{ display: "grid", gap: "0.35rem" }}>
            <span>
              Sent{proposal?.sent_at ? ` ${new Date(proposal.sent_at).toLocaleDateString()}` : ""}.{" "}
              <a href={clientLink} target="_blank" rel="noreferrer">
                Open their page
              </a>
            </span>
            <code style={{ overflowWrap: "anywhere" }}>{clientLink}</code>
          </div>
        )}

        {requestedAddons.length > 0 && (
          <div className="notice">
            <strong className="small">{addonsPending ? "They asked about add-ons. Add prices above." : "Add-ons requested (handled)"}</strong>
            <ul style={{ margin: "0.35rem 0", paddingLeft: "1.1rem" }}>
              {requestedAddons.map((a) => (
                <li key={a}>{priceList.addOns.find((o) => o.value === a)?.label ?? a}</li>
              ))}
            </ul>
            {proposal?.addons_note && <p style={{ margin: "0 0 0.5rem" }}>Their note: {proposal.addons_note}</p>}
            {addonsPending && proposal && (
              <form action={markAddonsHandled}>
                <input type="hidden" name="eventId" value={eventId} />
                <input type="hidden" name="proposalId" value={proposal.id} />
                <button type="submit" className="button-secondary">
                  Mark as handled
                </button>
              </form>
            )}
          </div>
        )}
      </section>

      {/* ---------- Proposal ---------- */}
      <section className="card" id="proposal" style={{ display: "grid", gap: "1rem" }}>
        <div>
          <h2 style={h2}>Quote</h2>
          <p className="muted small" style={{ margin: "0.25rem 0 0" }}>
            Build this after your planning call, once you know their hours. It goes into the contract and invoice. The client
            only sees it once you send the contract.
          </p>
        </div>

        {draft && draft.headsUps.length > 0 && (
          <div className="notice">
            <strong className="small">Heads up (only you see this)</strong>
            <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem", display: "grid", gap: "0.2rem" }}>
              {draft.headsUps.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
        )}

        {proposalOutOfDate && optionsDbReady && (
          <div className="notice" style={{ border: "1px solid var(--color-text)" }}>
            This quote was built before they checked both the package and bartender only. Click{" "}
            <strong>Save &amp; rebuild quote</strong> above to show both options.
          </div>
        )}

        {items.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No quote yet. After your call, update the details above (like staff times) and click Save &amp; build quote, or add lines yourself.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "1.1rem" }}>
            {options.map((opt, idx) => (
              <div key={opt} style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.9rem 1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline", flexWrap: "wrap" }}>
                  <strong>
                    Option {String.fromCharCode(65 + idx)}: {opt}
                  </strong>
                  <span className="small">
                    {chosen === opt && <span className="pill pill-done" style={{ marginRight: "0.5rem" }}>Chosen</span>}
                    Total {formatMoney(totalFor(opt))}
                  </span>
                </div>
                <Lines items={items.filter((i) => i.option_label === opt)} proposalId={proposal!.id} eventId={eventId} />
              </div>
            ))}
            {shared.length > 0 && (
              <div>
                {options.length > 0 && <strong className="small">Included with either option</strong>}
                <Lines items={shared} proposalId={proposal!.id} eventId={eventId} />
              </div>
            )}
          </div>
        )}

        {options.length > 1 && proposal && (
          <form action={setChosenOption} style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="proposalId" value={proposal.id} />
            <div style={{ minWidth: 220 }}>
              <label htmlFor="option">Option they chose</label>
              <select id="option" name="option" defaultValue={chosen ?? ""}>
                <option value="">Not picked yet</option>
                {options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="button-secondary">
              Save
            </button>
          </form>
        )}

        {proposal && items.length > 0 && (
          <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "0.75rem", display: "grid", gap: "0.2rem" }}>
            {options.length > 1 && !chosen && (
              <p className="muted small" style={{ margin: "0 0 0.25rem" }}>
                Totals shown for {shownOption} until you set which option they chose.
              </p>
            )}
            <Row label="Subtotal" value={formatMoney(proposal.subtotal)} />
            {Number(proposal.discount_amount) > 0 && <Row label="Discount" value={`- ${formatMoney(proposal.discount_amount)}`} />}
            {Number(proposal.fee_amount) > 0 && <Row label="Fee" value={formatMoney(proposal.fee_amount)} />}
            {Number(proposal.gratuity_amount) > 0 && <Row label={`Gratuity (${proposal.gratuity_rate}%)`} value={formatMoney(proposal.gratuity_amount)} />}
            {Number(proposal.tax_amount) > 0 && <Row label="Tax" value={formatMoney(proposal.tax_amount)} />}
            <Row label="Total" value={formatMoney(proposal.total_amount)} strong />
            {Number(proposal.deposit_amount) > 0 && <Row label="Retainer due" value={formatMoney(proposal.deposit_amount)} />}
          </div>
        )}

        {proposal && (
          <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
            <details>
              <summary className="small">Add a line</summary>
              <form action={addProposalItem} style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem", minWidth: "min(100%, 520px)" }}>
                <input type="hidden" name="proposalId" value={proposal.id} />
                <input type="hidden" name="eventId" value={eventId} />
                <input type="hidden" name="pricingType" value="flat" />
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "0.75rem", alignItems: "end" }}>
                  <AddProposalItemFields catalogItems={catalogItems ?? []} />
                </div>
                {options.length > 0 && (
                  <div>
                    <label htmlFor="optionLabel">Part of</label>
                    <select id="optionLabel" name="optionLabel" defaultValue="">
                      <option value="">Either option (always included)</option>
                      {options.map((o) => (
                        <option key={o} value={o}>
                          {o} only
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <button type="submit" className="button-secondary">
                    Add line
                  </button>
                </div>
              </form>
            </details>

            <details>
              <summary className="small">Discount, fees, tax &amp; retainer</summary>
              <form action={updateProposalAdjustments} style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
                <input type="hidden" name="proposalId" value={proposal.id} />
                <input type="hidden" name="eventId" value={eventId} />
                <div style={autoGrid}>
                  <NumberField name="discountAmount" label="Discount ($)" value={proposal.discount_amount} />
                  <NumberField name="feeAmount" label="Fee ($)" value={proposal.fee_amount} />
                  <NumberField name="gratuityRate" label="Gratuity (%)" value={proposal.gratuity_rate} step="0.001" />
                  <NumberField name="taxRate" label="Tax rate (%)" value={proposal.tax_rate} step="0.001" />
                  <NumberField name="depositAmount" label="Retainer ($)" value={proposal.deposit_amount} />
                </div>
                <div>
                  <button type="submit" className="button-secondary">
                    Save &amp; recalculate
                  </button>
                </div>
              </form>
            </details>
          </div>
        )}
      </section>

      {/* ---------- Contract & invoice ---------- */}
      <section className="card" style={{ display: "grid", gap: "1rem" }}>
        <h2 style={h2}>Contract &amp; invoice</h2>
        {financials?.qbo_sync_error && <p style={{ margin: 0, color: "var(--color-danger)" }}>QuickBooks: {financials.qbo_sync_error}</p>}
        {qboConnected && qboConnection?.environment !== "production" && (
          <p className="notice" style={{ margin: 0, border: "1px solid var(--color-danger)" }}>
            QuickBooks is connected in <strong>test mode</strong>, so invoices go to a practice company, not your real
            QuickBooks. See <a href="/admin/settings/quickbooks">Settings → QuickBooks</a>.
          </p>
        )}

        {contract?.status !== "signed" && (
          <form action={generateContract} style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
            <input type="hidden" name="eventId" value={eventId} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="templateId">Contract template</label>
              <select id="templateId" name="templateId">
                {(templates ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={contract ? "button-secondary" : "button"}>
              {contract ? "Regenerate contract" : "Generate contract"}
            </button>
          </form>
        )}

        {contract && (
          <details>
            <summary className="small">
              Contract: {contract.status === "unsent" ? "drafted, not sent" : contract.status}
              {contract.signed_at && `, signed ${new Date(contract.signed_at).toLocaleDateString()}`}
            </summary>
            <pre
              className="notice"
              style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.85rem", maxHeight: 300, overflow: "auto", marginTop: "0.6rem" }}
            >
              {contract.rendered_body}
            </pre>
          </details>
        )}

        {proposal && contract && contract.status === "unsent" && (
          <form action={sendBookingDocuments} style={{ display: "grid", gap: "0.75rem", borderTop: "1px solid var(--color-border)", paddingTop: "1rem" }}>
            <input type="hidden" name="eventId" value={eventId} />
            {isEmailConfigured() && (emailTemplates ?? []).length > 0 ? (
              <div>
                <label htmlFor="emailTemplateId">Email the client using</label>
                <select id="emailTemplateId" name="emailTemplateId" defaultValue={emailTemplates![0].id}>
                  {(emailTemplates ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                Email sending isn&apos;t set up (see <a href="/admin/settings/email">Settings → Email</a>), so this just
                gets the link ready to copy.
              </p>
            )}
            {qboConnected && !financials?.invoice_id && (
              <label style={{ display: "flex", gap: "0.5rem", alignItems: "start", margin: 0, color: "var(--color-text)" }}>
                <input type="checkbox" name="alsoCreateInvoice" style={{ marginTop: "0.2rem" }} />
                Also create the QuickBooks invoice now (you&apos;ll still send it from QuickBooks)
              </label>
            )}
            <div>
              <button type="submit" className="button">
                Send contract to client
              </button>
            </div>
          </form>
        )}

        <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "1rem", display: "grid", gap: "0.75rem" }}>
          {!qboConnected ? (
            <p className="muted small" style={{ margin: 0 }}>
              <a href="/admin/settings/quickbooks">Connect QuickBooks</a> to create the invoice there, or mark payments below.
            </p>
          ) : financials?.balance_paid ? (
            <p className="small" style={{ margin: 0 }}>✓ Paid in full.</p>
          ) : financials?.invoice_id ? (
            <div id="invoice" style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              {searchParams.invoiceCreated && <strong className="small">✓ Invoice created as a draft in QuickBooks.</strong>}
              <span className="muted small">
                {financials.deposit_paid ? "Retainer received, balance outstanding." : "Review it and send it from QuickBooks."}
              </span>
              <a href={qboInvoiceUrl(financials.invoice_id)} target="_blank" rel="noreferrer" className="button">
                Open in QuickBooks
              </a>
              <form action={refreshInvoiceStatus}>
                <input type="hidden" name="eventId" value={eventId} />
                <button type="submit" className="button-secondary">
                  Check payment status
                </button>
              </form>
            </div>
          ) : (
            <form action={createInvoiceDraft} id="invoice" style={{ display: "grid", gap: "0.4rem" }}>
              <input type="hidden" name="eventId" value={eventId} />
              <div>
                <button type="submit" className="button-secondary">
                  Create invoice in QuickBooks
                </button>
              </div>
              <span className="muted small">
                Uses {Number(proposal?.total_amount ?? 0) > 0 ? `the Quote total (${formatMoney(proposal?.total_amount)})` : financials?.total_amount ? `the event total from Edit status (${formatMoney(financials.total_amount)})` : "the Quote total, or the event total under Edit status. Neither is filled in yet"}
                . It&apos;s saved as a draft for you to review and send in QuickBooks.
              </span>
            </form>
          )}
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            {!financials?.deposit_paid && (
              <form action={markDepositReceived}>
                <input type="hidden" name="eventId" value={eventId} />
                <button type="submit" className="link-button">
                  Retainer paid outside QuickBooks
                </button>
              </form>
            )}
            {!financials?.balance_paid && (
              <form action={markBalanceReceived}>
                <input type="hidden" name="eventId" value={eventId} />
                <button type="submit" className="link-button">
                  Paid in full outside QuickBooks
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

const OPTIONS_SQL = `alter table public.proposal_items add column if not exists option_label text;
alter table public.proposals add column if not exists chosen_option text;
alter table public.proposals add column if not exists option_chosen_at timestamptz;`;

const h2 = { margin: 0, fontSize: "1.05rem" } as const;
const autoGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.85rem" } as const;
const fieldHeading = { display: "block", fontSize: "0.85rem", color: "var(--color-muted)", marginBottom: "0.4rem" } as const;

function Lines({ items, proposalId, eventId }: { items: Item[]; proposalId: string; eventId: string }) {
  return (
    <div style={{ display: "grid" }}>
      {items.map((item) => {
        const [title, ...rest] = String(item.description).split("\n");
        return (
          <div
            key={item.id}
            style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.6rem 0", borderBottom: "1px solid var(--color-border)" }}
          >
            <div style={{ minWidth: 0 }}>
              <div>{title}</div>
              {rest.length > 0 && (
                <details>
                  <summary className="muted small">What&apos;s included</summary>
                  <div className="muted small" style={{ whiteSpace: "pre-line", marginTop: "0.3rem" }}>
                    {rest.join("\n")}
                  </div>
                </details>
              )}
              {item.note && <div className="muted small">Client sees: {item.note}</div>}
            </div>
            <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
              <div>{linePrice(item)}</div>
              <form action={removeProposalItem}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="proposalId" value={proposalId} />
                <input type="hidden" name="eventId" value={eventId} />
                <button type="submit" className="link-button">
                  Remove
                </button>
              </form>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusPill({ label, done, doneText, pendingText }: { label: string; done: boolean; doneText: string; pendingText?: string }) {
  return (
    <span className={done ? "pill pill-done" : "pill"} style={done ? undefined : { color: "var(--color-muted)" }}>
      {done ? `✓ ${label} ${doneText}` : pendingText ? `${label} ${pendingText}` : `${label}`}
    </span>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: [string, string][] }) {
  return (
    <div>
      <label htmlFor={`f-${name}`}>{label}</label>
      <select id={`f-${name}`} name={name} defaultValue={value}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function NumberField({ name, label, value, step = "0.01" }: { name: string; label: string; value: number | null; step?: string }) {
  return (
    <div>
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} type="number" step={step} defaultValue={value ?? 0} />
    </div>
  );
}

function Checks({ name, options, selected }: { name: string; options: Option[]; selected: string[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem 1.25rem" }}>
      {options.map((o) => (
        <label key={o.value} style={{ display: "flex", alignItems: "center", gap: "0.4rem", margin: 0, color: "var(--color-text)", fontSize: "0.92rem" }}>
          <input type="checkbox" name={name} value={o.value} defaultChecked={selected.includes(o.value)} />
          {o.label}
        </label>
      ))}
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
