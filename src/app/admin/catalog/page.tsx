import { createClient } from "@/lib/supabase/server";
import { PRICING_TYPE_LABELS, formatMoney } from "@/lib/labels";
import { addCatalogItem, toggleCatalogItemActive } from "./actions";

export default async function CatalogPage() {
  const supabase = createClient();
  const { data: items } = await supabase
    .from("catalog_items")
    .select("*")
    .order("category")
    .order("name");

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 720 }}>
      <div>
        <h1 style={{ margin: 0 }}>Catalog</h1>
        <p style={{ color: "var(--color-muted)" }}>
          Your frequently sold services and rentals — build proposals from this instead of
          retyping pricing every time.
        </p>
      </div>

      <form action={addCatalogItem} className="card" style={{ display: "grid", gap: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
          <div>
            <label htmlFor="name">Item name</label>
            <input id="name" name="name" required placeholder="e.g. Bartending Service" />
          </div>
          <div>
            <label htmlFor="category">Category</label>
            <input id="category" name="category" placeholder="e.g. Staffing" />
          </div>
        </div>

        <div>
          <label htmlFor="description">Description</label>
          <input id="description" name="description" placeholder="e.g. Professional bartending staff for private events." />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label htmlFor="defaultPrice">Default price ($)</label>
            <input id="defaultPrice" name="defaultPrice" type="number" step="0.01" min={0} />
          </div>
          <div>
            <label htmlFor="pricingType">Pricing type</label>
            <select
              id="pricingType"
              name="pricingType"
              defaultValue="flat"
              style={{ width: "100%", padding: "0.55rem 0.7rem", borderRadius: 8, border: "1px solid var(--color-border)" }}
            >
              {Object.entries(PRICING_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="internalNotes">Internal notes (never shown to clients)</label>
          <input id="internalNotes" name="internalNotes" />
        </div>

        <button type="submit" className="button" style={{ justifySelf: "start" }}>
          Add to catalog
        </button>
      </form>

      <div className="card" style={{ padding: 0 }}>
        {items && items.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.75rem 1rem" }}>Item</th>
                <th style={{ padding: "0.75rem 1rem" }}>Category</th>
                <th style={{ padding: "0.75rem 1rem" }}>Price</th>
                <th style={{ padding: "0.75rem 1rem" }}>Status</th>
                <th style={{ padding: "0.75rem 1rem" }} />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    {item.name}
                    {item.description && (
                      <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>{item.description}</div>
                    )}
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>{item.category ?? "—"}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    {formatMoney(item.default_price)}{" "}
                    <span style={{ color: "var(--color-muted)", fontSize: "0.8rem" }}>
                      ({PRICING_TYPE_LABELS[item.pricing_type]})
                    </span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>{item.active ? "Active" : "Inactive"}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <form action={toggleCatalogItemActive}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="active" value={String(item.active)} />
                      <button
                        type="submit"
                        style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer" }}
                      >
                        {item.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ padding: "1.5rem", color: "var(--color-muted)", margin: 0 }}>
            No catalog items yet — add your first one above.
          </p>
        )}
      </div>
    </div>
  );
}
