import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDate } from "@/lib/labels";
import { SignaturePad } from "@/components/SignaturePad";
import { signContract } from "./actions";
import { effectiveOption, linesForOption } from "@/lib/proposals";
import { SERVICES } from "@/lib/event-details";
import { getCurrentUser } from "@/lib/auth/roles";
import { customQuoteReason, getPriceList, gratuityLabel, packageIncludes, tierBelow, tierFor, timingPolicies } from "@/lib/price-list";

// Always build this page fresh -- it has to reflect pricing the moment it's sent.
export const dynamic = "force-dynamic";

export default async function ClientDocumentsPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { error?: string; preview?: string };
}) {
  const supabase = createAdminClient();
  const priceList = await getPriceList(supabase);

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
  // The pricing page is a menu: each service they asked about with its
  // price and description, no assumed hours or totals. The real quote is
  // built after the planning call and shows up here once the contract is out.
  const wanted: string[] = event.services_interested ?? [];
  const barServices = ["signature_cocktails", "bartender", "server"];
  const showAll = !wanted.some((s) => barServices.includes(s)) || wanted.includes("not_sure");
  const guests = Number(event.guest_count ?? 0);
  // Weddings, corporate events and big parties get a custom quote instead.
  const customQuote = customQuoteReason(priceList, event.event_type, guests || null);
  const tier = customQuote ? null : guests ? tierFor(priceList, guests) : priceList.package.tiers[0] ?? null;
  const menu = {
    package: showAll || wanted.includes("signature_cocktails") ? { tier, lower: tier ? tierBelow(priceList, tier) : null } : null,
    bartender: showAll || wanted.includes("bartender"),
    server: showAll || wanted.includes("server"),
    other: SERVICES.filter((o) => wanted.includes(o.value) && !barServices.includes(o.value) && o.value !== "not_sure").map((o) => o.label),
  };

  // The final quote (after the call), using the option Faith picked if there were two.
  type Line = { id: string; description: string; line_total: number; note: string | null; option_label?: string | null };
  const lines = (items ?? []) as Line[];
  const quoteLines = linesForOption(lines, effectiveOption(lines, proposal?.chosen_option));

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
            <p style={{ margin: 0, padding: "0.6rem 0.9rem", background: "var(--color-soft)", border: "1px solid var(--color-border-strong)", borderRadius: 8 }}>
              Preview only. The client can&apos;t see this until you click Send pricing.
            </p>
          )}
          {searchParams.error && <p style={{ color: "var(--color-danger)" }}>{searchParams.error}</p>}

          {pricingReady && proposal && (
            <>
              <section className="card">
                <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "0.9rem" }}>
                  {client?.first_name} {client?.last_name} · {formatDate(event.event_date)}
                  {event.guest_count ? ` · ${event.guest_count} guests` : ""}
                </p>
                <h2 style={{ margin: "0.35rem 0 0" }}>Your pricing</h2>
                {proposal.intro_note && (
                  <p style={{ margin: "0.85rem 0 0", whiteSpace: "pre-line", lineHeight: 1.5 }}>{proposal.intro_note}</p>
                )}

                <div style={{ display: "grid", gap: "1.75rem", marginTop: "1.5rem" }}>
                  {menu.package && (
                    <MenuItem
                      title={priceList.package.name}
                      price={menu.package.tier ? dollars(menu.package.tier.price) : "Custom quote"}
                      priceNote={
                        menu.package.tier
                          ? `Up to ${menu.package.tier.upTo} guests · gratuity included`
                          : "We'll price this one for you on our call"
                      }
                    >
                      <ul style={listStyle}>
                        {packageIncludes(priceList, menu.package.tier?.bartenders ?? 1).map((i) => (
                          <li key={i}>{i}</li>
                        ))}
                      </ul>
                      {menu.package.lower && (
                        <p style={smallNote}>
                          If your final count is {menu.package.lower.upTo} or fewer, the package is {dollars(menu.package.lower.price)}.
                        </p>
                      )}
                      <p style={smallNote}>
                        Need more time? Extra hours are {dollars(priceList.rates.bartender)}/hr per bartender + {gratuityLabel(priceList)} gratuity.
                      </p>
                      <p style={smallNote}>{priceList.package.fullBarNote}</p>
                      {priceList.package.customize.length > 0 && (
                        <>
                          <strong style={{ display: "block", marginTop: "0.75rem", fontSize: "0.92rem" }}>Customize your package</strong>
                          <ul style={listStyle}>
                            {priceList.package.customize.map((c) => (
                              <li key={c}>{c}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </MenuItem>
                  )}

                  {menu.bartender && (
                    <MenuItem
                      title={`${priceList.bartenderOnly.name}${menu.package ? " only" : ""}`}
                      price={`${dollars(priceList.rates.bartender)}/hr`}
                      priceNote={`+ ${gratuityLabel(priceList)} gratuity · ${priceList.minHours}-hour minimum (includes setup)`}
                    >
                      <p style={bodyText}>{priceList.bartenderOnly.description}</p>
                      {!menu.package && priceList.bartenderOnly.note && <p style={smallNote}>{priceList.bartenderOnly.note}</p>}
                    </MenuItem>
                  )}

                  {menu.server && (
                    <MenuItem
                      title={priceList.server.name}
                      price={`${dollars(priceList.rates.server)}/hr`}
                      priceNote={`+ ${gratuityLabel(priceList)} gratuity · ${priceList.minHours}-hour minimum (includes setup)`}
                    >
                      <p style={bodyText}>{priceList.server.description}</p>
                      {priceList.server.note && <p style={smallNote}>{priceList.server.note}</p>}
                    </MenuItem>
                  )}

                  {menu.other.length > 0 && (
                    <p style={{ ...bodyText, margin: 0 }}>
                      You also asked about {menu.other.join(", ").toLowerCase()}. We&apos;ll put that together for you on our call.
                    </p>
                  )}
                </div>
              </section>

              {priceList.addOns.length > 0 && (
                <section className="card">
                  <h2 style={{ marginTop: 0 }}>Add-ons</h2>
                  <p style={{ marginTop: "-0.25rem", color: "var(--color-muted)", fontSize: "0.92rem" }}>
                    Pricing on request. We&apos;ll go over anything that catches your eye on our call.
                  </p>
                  <ul style={listStyle}>
                    {priceList.addOns.map((a) => (
                      <li key={a.value}>{a.label}</li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="card">
                <h2 style={{ marginTop: 0 }}>How timing works</h2>
                <ul style={{ ...listStyle, gap: "0.5rem", lineHeight: 1.45 }}>
                  {timingPolicies(priceList).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </section>

              {!contractReady && (
                <section className="card" style={{ textAlign: "center", borderColor: "var(--color-accent)" }}>
                  <h2 style={{ marginTop: 0 }}>Ready to book?</h2>
                  <p style={{ color: "var(--color-muted)", marginTop: 0 }}>
                    Pick a time for a quick planning call. We&apos;ll go over the details, answer any questions, and then
                    send your agreement to lock in your date.
                  </p>
                  <a href={`/book?event=${params.token}`} className="button">
                    Schedule my planning call
                  </a>
                </section>
              )}
            </>
          )}

          {/* After the call: the actual quote Faith built, right above the agreement. */}
          {contractReady && proposal && quoteLines.length > 0 && (
            <section className="card">
              <h2 style={{ marginTop: 0 }}>Your quote</h2>
              <div style={{ display: "grid", gap: "1.25rem" }}>
                {quoteLines.map((item) => (
                  <LineItem key={item.id} description={String(item.description)} total={formatMoney(item.line_total)} note={item.note} />
                ))}
              </div>
              <div style={{ marginTop: "1.25rem", paddingTop: "0.75rem", borderTop: "1px solid var(--color-border)", display: "grid", gap: "0.25rem" }}>
                {Number(proposal.discount_amount) > 0 && <SummaryRow label="Discount" value={`- ${formatMoney(proposal.discount_amount)}`} />}
                {Number(proposal.fee_amount) > 0 && <SummaryRow label="Fee" value={formatMoney(proposal.fee_amount)} />}
                {Number(proposal.tax_amount) > 0 && <SummaryRow label="Tax" value={formatMoney(proposal.tax_amount)} />}
                <SummaryRow label="Total" value={formatMoney(proposal.total_amount)} strong />
                {Number(proposal.deposit_amount) > 0 && <SummaryRow label="Retainer to book" value={formatMoney(proposal.deposit_amount)} />}
                {Number(proposal.tax_amount) === 0 && (
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.82rem", color: "var(--color-muted)" }}>Plus applicable sales tax.</p>
                )}
              </div>
            </section>
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
                background: "var(--color-soft)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: "1rem",
              }}
            >
              {contract!.rendered_body}
            </pre>

            {contract!.status === "signed" ? (
              <p style={{ color: "var(--color-text)" }}>
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
              <p style={{ color: "var(--color-text)", margin: 0 }}>✓ Deposit received — thank you!</p>
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
              <p style={{ color: "var(--color-text)", margin: "0.75rem 0 0" }}>✓ Balance paid in full — thank you!</p>
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

/** Menu prices without cents when they're whole dollars ($70/hr, $1,600). */
function dollars(n: number): string {
  return Number.isInteger(Number(n)) ? `$${Number(n).toLocaleString("en-US")}` : formatMoney(n);
}

function MenuItem({ title, price, priceNote, children }: { title: string; price: string; priceNote: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline" }}>
        <strong style={{ fontSize: "1.08rem" }}>{title}</strong>
        <strong style={{ fontSize: "1.08rem", whiteSpace: "nowrap" }}>{price}</strong>
      </div>
      <p style={{ margin: "0.2rem 0 0", fontSize: "0.86rem", color: "var(--color-muted)" }}>{priceNote}</p>
      <div style={{ marginTop: "0.75rem" }}>{children}</div>
    </div>
  );
}

const listStyle = { margin: "0.4rem 0 0", paddingLeft: "1.1rem", display: "grid", gap: "0.25rem", fontSize: "0.93rem" } as const;
const bodyText = { margin: 0, color: "var(--color-muted)", lineHeight: 1.5 } as const;
const smallNote = { margin: "0.6rem 0 0", fontSize: "0.88rem", color: "var(--color-muted)" } as const;

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
