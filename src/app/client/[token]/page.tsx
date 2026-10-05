import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDate } from "@/lib/labels";
import { SignaturePad } from "@/components/SignaturePad";
import { signContract, requestAddons } from "./actions";
import { getCurrentUser } from "@/lib/auth/roles";
import { ADD_ONS, PACKAGE, TIMING_POLICIES } from "@/lib/price-list";

export default async function ClientDocumentsPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { error?: string; addons?: string; preview?: string };
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
  // Pricing can go out on its own, before any contract exists.
  const contractReady = Boolean(contract && contract.status !== "unsent");
  // Faith can preview the page before sending (only when she's logged in as admin).
  const adminPreview = searchParams.preview === "1" && (await getCurrentUser())?.role === "admin";
  const pricingReady = Boolean(proposal && (proposal.status === "sent" || contractReady || adminPreview));
  const ready = pricingReady || contractReady;
  const hasPackage = (items ?? []).some((i) => String(i.description).startsWith(PACKAGE.name));
  const requested: string[] = proposal?.requested_addons ?? [];
  const contractSigned = contract?.status === "signed";

  return (
    <main style={{ padding: "2rem 1.5rem", maxWidth: 640, margin: "0 auto" }}>
      <p style={{ margin: 0, color: "var(--color-accent)", fontWeight: 600, letterSpacing: "0.04em", fontSize: "0.85rem" }}>
        PERFECT POURS &amp; MORE
      </p>
      <h1 style={{ marginTop: "0.25rem" }}>{event.name}</h1>

      {!ready ? (
        <p style={{ color: "var(--color-muted)" }}>
          Your pricing isn&apos;t ready yet — check back soon, or reach out to{" "}
          <a href="mailto:faith@perfectpoursandmore.com">faith@perfectpoursandmore.com</a> if you
          were expecting this link to be active.
        </p>
      ) : (
        <div style={{ display: "grid", gap: "1.5rem" }}>
          {adminPreview && proposal?.status !== "sent" && (
            <p style={{ margin: 0, padding: "0.6rem 0.9rem", background: "#fff8ec", border: "1px solid #ecd9b5", borderRadius: 8 }}>
              Preview only. The client can&apos;t see this until you click Send pricing.
            </p>
          )}
          {searchParams.error && <p style={{ color: "#a33" }}>{searchParams.error}</p>}

          {pricingReady && proposal && (
            <>
              <section className="card">
                <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "0.9rem" }}>
                  {client?.first_name} {client?.last_name} · {formatDate(event.event_date)}
                  {event.guest_count ? ` · ${event.guest_count} guests` : ""}
                </p>
                <h2 style={{ margin: "0.35rem 0 0" }}>Your personalized pricing</h2>
                {proposal.intro_note && (
                  <p style={{ margin: "0.85rem 0 0", whiteSpace: "pre-line", lineHeight: 1.5 }}>{proposal.intro_note}</p>
                )}

                <div style={{ display: "grid", gap: "1.25rem", marginTop: "1.25rem" }}>
                  {(items ?? []).map((item) => (
                    <LineItem
                      key={item.id}
                      description={String(item.description)}
                      total={formatMoney(item.line_total)}
                      note={item.note as string | null}
                    />
                  ))}
                </div>

                <div style={{ marginTop: "1.25rem", paddingTop: "0.75rem", borderTop: "1px solid var(--color-border)", display: "grid", gap: "0.25rem" }}>
                  {Number(proposal.discount_amount) > 0 && (
                    <SummaryRow label="Discount" value={`- ${formatMoney(proposal.discount_amount)}`} />
                  )}
                  {Number(proposal.fee_amount) > 0 && <SummaryRow label="Fee" value={formatMoney(proposal.fee_amount)} />}
                  {Number(proposal.tax_amount) > 0 && <SummaryRow label="Tax" value={formatMoney(proposal.tax_amount)} />}
                  <SummaryRow label="Total" value={formatMoney(proposal.total_amount)} strong />
                  {contractReady && Number(proposal.deposit_amount) > 0 && (
                    <SummaryRow label="Retainer to book" value={formatMoney(proposal.deposit_amount)} />
                  )}
                  {Number(proposal.tax_amount) === 0 && (
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.82rem", color: "var(--color-muted)" }}>Plus applicable sales tax.</p>
                  )}
                </div>

                {hasPackage && (
                  <div style={{ marginTop: "1.25rem", display: "grid", gap: "0.5rem", fontSize: "0.92rem" }}>
                    <p style={{ margin: 0, color: "var(--color-muted)" }}>{PACKAGE.fullBarNote}</p>
                    <strong style={{ marginTop: "0.5rem" }}>Customize your package</strong>
                    <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "grid", gap: "0.25rem" }}>
                      {PACKAGE.customize.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              {!contractSigned && (
                <section className="card" id="addons">
                  <h2 style={{ marginTop: 0 }}>Add-ons</h2>
                  <p style={{ marginTop: "-0.25rem", color: "var(--color-muted)", fontSize: "0.92rem" }}>
                    Pricing available upon request. Check anything you&apos;re interested in and we&apos;ll add
                    pricing for your event.
                  </p>
                  {searchParams.addons === "requested" && (
                    <p style={{ color: "#2a7a2a" }}>✓ Got it! We&apos;ll add pricing for those and let you know.</p>
                  )}
                  <form action={requestAddons} style={{ display: "grid", gap: "0.5rem" }}>
                    <input type="hidden" name="token" value={params.token} />
                    {ADD_ONS.map((a) => (
                      <label key={a.value} style={choiceStyle}>
                        <input type="checkbox" name="addons" value={a.value} defaultChecked={requested.includes(a.value)} style={{ marginTop: 3 }} />
                        <span>{a.label}</span>
                      </label>
                    ))}
                    <label htmlFor="addonsNote" style={{ marginTop: "0.5rem" }}>
                      Details (optional), e.g. how many custom cups, your theme
                    </label>
                    <textarea id="addonsNote" name="addonsNote" rows={2} defaultValue={proposal.addons_note ?? ""} style={textareaStyle} />
                    <button
                      type="submit"
                      style={{ justifySelf: "start", background: "none", border: "1px solid var(--color-accent)", color: "var(--color-accent)", borderRadius: 8, padding: "0.5rem 1rem", cursor: "pointer", fontSize: "0.95rem" }}
                    >
                      {requested.length > 0 ? "Update my add-on request" : "Request add-on pricing"}
                    </button>
                  </form>
                </section>
              )}

              <section className="card">
                <h2 style={{ marginTop: 0 }}>How timing works</h2>
                <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "grid", gap: "0.5rem", lineHeight: 1.45 }}>
                  {TIMING_POLICIES.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </section>

              {!contractReady && (
                <section className="card" style={{ textAlign: "center", borderColor: "var(--color-accent)" }}>
                  <h2 style={{ marginTop: 0 }}>Ready to book?</h2>
                  <p style={{ color: "var(--color-muted)", marginTop: 0 }}>
                    Pick a time for a quick planning call. We&apos;ll go over the details, then send your
                    agreement to lock in your date.
                  </p>
                  <a href="/book" className="button">
                    Schedule my planning call
                  </a>
                </section>
              )}
            </>
          )}

          {contractReady && (
            <>
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
            </>
          )}
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

/** First line = title; "• " lines = bullet list; other lines = paragraph. */
function LineItem({ description, total, note }: { description: string; total: string; note: string | null }) {
  const [title, ...rest] = description.split("\n");
  const bullets = rest.filter((l) => l.startsWith("• ")).map((l) => l.slice(2));
  const text = rest.filter((l) => !l.startsWith("• ") && l.trim());
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline" }}>
        <strong style={{ fontSize: "1.02rem" }}>{title}</strong>
        <strong style={{ whiteSpace: "nowrap" }}>{total}</strong>
      </div>
      {text.map((t) => (
        <p key={t} style={{ margin: "0.35rem 0 0", color: "var(--color-muted)", lineHeight: 1.45 }}>
          {t}
        </p>
      ))}
      {bullets.length > 0 && (
        <ul style={{ margin: "0.45rem 0 0", paddingLeft: "1.1rem", display: "grid", gap: "0.2rem", fontSize: "0.93rem" }}>
          {bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      {note && <p style={{ margin: "0.45rem 0 0", fontSize: "0.88rem", fontStyle: "italic", color: "var(--color-muted)" }}>{note}</p>}
    </div>
  );
}

const choiceStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.6rem",
  margin: 0,
  fontSize: "0.95rem",
  color: "var(--color-text)",
  cursor: "pointer",
} as const;

const textareaStyle = {
  width: "100%",
  padding: "0.55rem 0.7rem",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  fontFamily: "inherit",
  fontSize: "0.95rem",
} as const;
