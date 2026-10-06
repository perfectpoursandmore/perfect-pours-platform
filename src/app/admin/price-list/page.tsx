import { createClient } from "@/lib/supabase/server";
import { EVENT_TYPE_LABELS, formatMoney } from "@/lib/labels";
import { getPriceList, gratuityLabel, staffPriceLine } from "@/lib/price-list";
import { savePriceList } from "./actions";

const textareaStyle = {
  width: "100%",
  padding: "0.75rem",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  fontFamily: "inherit",
  fontSize: "0.9rem",
  lineHeight: 1.5,
} as const;

const hint = { margin: "0.25rem 0 0", fontSize: "0.82rem", color: "var(--color-muted)" } as const;
const grid2 = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" } as const;

export default async function PriceListPage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string };
}) {
  const supabase = createClient();
  const pl = await getPriceList(supabase);
  const { data: savedRow, error: tableError } = await supabase
    .from("price_list")
    .select("updated_at")
    .eq("id", true)
    .maybeSingle();
  const tableMissing = Boolean(tableError);

  const tierRows = [...pl.package.tiers, null, null]; // two blank rows to add a tier
  const addonRows = [...pl.addOns, null, null, null]; // three blank rows to add add-ons

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 760 }}>
      <div>
        <h1 style={{ margin: 0 }}>Price List</h1>
        <p style={{ color: "var(--color-muted)", marginBottom: 0 }}>
          Everything clients see on their pricing page, in one place. Change anything here and hit{" "}
          <strong>Save</strong>. New pricing drafts and every client&apos;s pricing page pick it up right away.
        </p>
        <p style={hint}>
          Pricing you&apos;ve already drafted or sent keeps its line items. Edit those on the event&apos;s Booking tab.
          {savedRow?.updated_at && ` Last saved ${new Date(savedRow.updated_at).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })}.`}
        </p>
      </div>

      {tableMissing && (
        <p style={{ margin: 0, padding: "0.75rem 1rem", background: "var(--color-soft)", border: "1px solid var(--color-border-strong)", borderRadius: 8 }}>
          One-time setup: run <code>supabase/migrations/0020_price_list.sql</code> in the Supabase SQL Editor so your
          changes can be saved. Until then, this page shows your current prices but Save won&apos;t work.
        </p>
      )}
      {searchParams.saved && <p style={{ margin: 0, color: "var(--color-text)" }}>✓ Price list saved.</p>}
      {searchParams.error && <p style={{ margin: 0, color: "var(--color-danger)" }}>{searchParams.error}</p>}

      {/* At a glance */}
      <section className="card" style={{ display: "grid", gap: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>At a glance</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.92rem" }}>
          <tbody>
            {pl.package.tiers.map((t, i) => (
              <tr key={t.upTo} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: "0.4rem 0" }}>
                  {pl.package.name}: {i === 0 ? "up to" : `${pl.package.tiers[i - 1].upTo + 1}–`}
                  {i === 0 ? ` ${t.upTo}` : t.upTo} guests{" "}
                  <span style={{ color: "var(--color-muted)" }}>
                    ({t.bartenders} bartender{t.bartenders > 1 ? "s" : ""})
                  </span>
                </td>
                <td style={{ padding: "0.4rem 0", textAlign: "right", fontWeight: 600 }}>{formatMoney(t.price)}</td>
              </tr>
            ))}
            <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
              <td style={{ padding: "0.4rem 0" }}>{pl.bartenderOnly.name}</td>
              <td style={{ padding: "0.4rem 0", textAlign: "right" }}>{staffPriceLine(pl, pl.rates.bartender)}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.4rem 0" }}>{pl.server.name}</td>
              <td style={{ padding: "0.4rem 0", textAlign: "right" }}>{staffPriceLine(pl, pl.rates.server)}</td>
            </tr>
          </tbody>
        </table>
        <p style={hint}>
          Over {pl.customQuoteOverGuests} guests
          {pl.customQuoteEventTypes.length > 0 &&
            `, and ${pl.customQuoteEventTypes.map((t) => (EVENT_TYPE_LABELS[t] ?? t).toLowerCase() + "s").join(" and ")}`}{" "}
          get a custom quote instead of automatic pricing.
        </p>
      </section>

      <form action={savePriceList} style={{ display: "grid", gap: "1.5rem" }}>
        {/* Package */}
        <section className="card" style={{ display: "grid", gap: "1rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{pl.package.name}</h2>
          <div>
            <label htmlFor="packageName">Package name</label>
            <input id="packageName" name="packageName" defaultValue={pl.package.name} />
          </div>

          <div>
            <strong style={{ fontSize: "0.92rem" }}>Prices by guest count</strong>
            <p style={hint}>
              Each row covers guests up to that number. To remove a row, clear its guest count. Use the blank rows to add one.
            </p>
            <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.6rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", fontSize: "0.8rem", color: "var(--color-muted)" }}>
                <span>Up to (guests)</span>
                <span>Price ($)</span>
                <span>Bartenders</span>
              </div>
              {tierRows.map((t, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                  <input name="tierUpTo" type="number" min={1} defaultValue={t?.upTo ?? ""} aria-label={`Tier ${i + 1} guests`} />
                  <input name="tierPrice" type="number" min={0} step="0.01" defaultValue={t?.price ?? ""} aria-label={`Tier ${i + 1} price`} />
                  <input name="tierBartenders" type="number" min={1} defaultValue={t?.bartenders ?? 1} aria-label={`Tier ${i + 1} bartenders`} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="packageIncludes">What&apos;s included (one per line)</label>
            <textarea
              id="packageIncludes"
              name="packageIncludes"
              rows={Math.max(8, pl.package.includes.length + 2)}
              defaultValue={pl.package.includes.join("\n")}
              style={textareaStyle}
            />
            <p style={hint}>
              <code>{"{bartenders}"}</code> fills in as &ldquo;1 bartender&rdquo; or &ldquo;2 bartenders&rdquo; based on the guest count.
            </p>
          </div>

          <div>
            <label htmlFor="fullBarNote">Full bar note (shown under the price)</label>
            <textarea id="fullBarNote" name="fullBarNote" rows={2} defaultValue={pl.package.fullBarNote} style={textareaStyle} />
          </div>

          <div>
            <label htmlFor="customize">&ldquo;Customize your package&rdquo; options (one per line)</label>
            <textarea
              id="customize"
              name="customize"
              rows={Math.max(3, pl.package.customize.length + 1)}
              defaultValue={pl.package.customize.join("\n")}
              style={textareaStyle}
            />
          </div>
        </section>

        {/* Hourly staff */}
        <section className="card" style={{ display: "grid", gap: "1rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Hourly staff</h2>
          <div style={grid2}>
            <div>
              <label htmlFor="bartenderRate">Bartender ($/hr)</label>
              <input id="bartenderRate" name="bartenderRate" type="number" min={0} step="0.01" defaultValue={pl.rates.bartender} />
            </div>
            <div>
              <label htmlFor="serverRate">Server ($/hr)</label>
              <input id="serverRate" name="serverRate" type="number" min={0} step="0.01" defaultValue={pl.rates.server} />
            </div>
            <div>
              <label htmlFor="gratuityPct">Gratuity (%)</label>
              <input id="gratuityPct" name="gratuityPct" type="number" min={0} step="1" defaultValue={Math.round(pl.gratuityRate * 100)} />
            </div>
            <div>
              <label htmlFor="minHours">Minimum hours</label>
              <input id="minHours" name="minHours" type="number" min={0} step="0.5" defaultValue={pl.minHours} />
            </div>
          </div>
          <p style={{ ...hint, marginTop: "-0.5rem" }}>
            Gratuity is added to hourly staff ({gratuityLabel(pl)} now). It&apos;s already built into package prices.
          </p>

          <div style={{ display: "grid", gap: "0.75rem", borderTop: "1px solid var(--color-border)", paddingTop: "1rem" }}>
            <strong style={{ fontSize: "0.92rem" }}>Bartender only</strong>
            <div>
              <label htmlFor="bartenderName">Name on pricing</label>
              <input id="bartenderName" name="bartenderName" defaultValue={pl.bartenderOnly.name} />
            </div>
            <div>
              <label htmlFor="bartenderDescription">Description</label>
              <textarea id="bartenderDescription" name="bartenderDescription" rows={3} defaultValue={pl.bartenderOnly.description} style={textareaStyle} />
            </div>
            <div>
              <label htmlFor="bartenderNote">Small note under it</label>
              <textarea id="bartenderNote" name="bartenderNote" rows={2} defaultValue={pl.bartenderOnly.note} style={textareaStyle} />
            </div>
          </div>

          <div style={{ display: "grid", gap: "0.75rem", borderTop: "1px solid var(--color-border)", paddingTop: "1rem" }}>
            <strong style={{ fontSize: "0.92rem" }}>Server</strong>
            <div>
              <label htmlFor="serverName">Name on pricing</label>
              <input id="serverName" name="serverName" defaultValue={pl.server.name} />
            </div>
            <div>
              <label htmlFor="serverDescription">Description</label>
              <textarea id="serverDescription" name="serverDescription" rows={3} defaultValue={pl.server.description} style={textareaStyle} />
            </div>
            <div>
              <label htmlFor="serverNote">Small note under it (shown when a 2nd server might be needed)</label>
              <textarea id="serverNote" name="serverNote" rows={2} defaultValue={pl.server.note} style={textareaStyle} />
            </div>
          </div>
        </section>

        {/* Add-ons */}
        <section className="card" style={{ display: "grid", gap: "0.75rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Add-ons and rentals</h2>
          <p style={{ ...hint, marginTop: "-0.4rem" }}>
            Clients check these on their pricing page to ask for a price (&ldquo;pricing available upon request&rdquo;).
            Clear a line to remove it. Use the blank lines to add new items.
          </p>
          {addonRows.map((a, i) => (
            <div key={a?.value ?? `new-${i}`}>
              <input type="hidden" name="addonValue" value={a?.value ?? ""} />
              <input name="addonLabel" defaultValue={a?.label ?? ""} placeholder={a ? "" : "New add-on or rental item"} aria-label={`Add-on ${i + 1}`} />
            </div>
          ))}
        </section>

        {/* Timing + rules */}
        <section className="card" style={{ display: "grid", gap: "1rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Timing policies and rules</h2>
          <div>
            <label htmlFor="timingPolicies">&ldquo;How timing works&rdquo; (one per line)</label>
            <textarea
              id="timingPolicies"
              name="timingPolicies"
              rows={8}
              defaultValue={pl.timingPolicies.join("\n")}
              style={textareaStyle}
            />
            <p style={hint}>
              These fill in automatically from your rates above: <code>{"{bartender_rate}"}</code>{" "}
              <code>{"{server_rate}"}</code> <code>{"{min_hours}"}</code> <code>{"{gratuity}"}</code>
            </p>
          </div>

          <div style={grid2}>
            <div>
              <label htmlFor="packageHours">Hours included in package</label>
              <input id="packageHours" name="packageHours" type="number" min={0} step="0.5" defaultValue={pl.packageHours} />
              <p style={hint}>Service + setup. Extra time is added at the bartender rate.</p>
            </div>
            <div>
              <label htmlFor="customQuoteOverGuests">Custom quote over (guests)</label>
              <input id="customQuoteOverGuests" name="customQuoteOverGuests" type="number" min={0} defaultValue={pl.customQuoteOverGuests} />
            </div>
          </div>

          <div>
            <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>Always custom quote these event types</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem 1rem", marginTop: "0.4rem" }}>
              {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                <label key={value} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.9rem", fontWeight: 400 }}>
                  <input type="checkbox" name="customQuoteEventTypes" value={value} defaultChecked={pl.customQuoteEventTypes.includes(value)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </section>

        <div
          style={{
            position: "sticky",
            bottom: 0,
            padding: "0.75rem 0",
            background: "var(--color-bg, #fff)",
            borderTop: "1px solid var(--color-border)",
          }}
        >
          <button type="submit" className="button" disabled={tableMissing}>
            Save price list
          </button>
        </div>
      </form>
    </div>
  );
}
