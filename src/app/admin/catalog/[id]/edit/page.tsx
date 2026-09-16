import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PRICING_TYPE_LABELS } from "@/lib/labels";
import { updateCatalogItem } from "../../actions";

export default async function EditCatalogItemPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: item } = await supabase.from("catalog_items").select("*").eq("id", params.id).single();

  if (!item) notFound();

  return (
    <div style={{ maxWidth: 620, display: "grid", gap: "1.5rem" }}>
      <div>
        <h1 style={{ margin: 0 }}>Edit {item.name}</h1>
      </div>

      <form action={updateCatalogItem} className="card" style={{ display: "grid", gap: "1rem" }}>
        <input type="hidden" name="id" value={item.id} />

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
          <div>
            <label htmlFor="name">Item name</label>
            <input id="name" name="name" defaultValue={item.name} required />
          </div>
          <div>
            <label htmlFor="category">Category</label>
            <input id="category" name="category" defaultValue={item.category ?? ""} />
          </div>
        </div>

        <div>
          <label htmlFor="description">Description (shown to clients on proposals)</label>
          <textarea
            id="description"
            name="description"
            defaultValue={item.description ?? ""}
            rows={6}
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              fontFamily: "inherit",
              fontSize: "0.9rem",
            }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label htmlFor="defaultPrice">Default price ($)</label>
            <input
              id="defaultPrice"
              name="defaultPrice"
              type="number"
              step="0.01"
              min={0}
              defaultValue={item.default_price ?? ""}
            />
          </div>
          <div>
            <label htmlFor="pricingType">Pricing type</label>
            <select
              id="pricingType"
              name="pricingType"
              defaultValue={item.pricing_type}
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
          <input id="internalNotes" name="internalNotes" defaultValue={item.internal_notes ?? ""} />
        </div>

        <button type="submit" className="button" style={{ justifySelf: "start" }}>
          Save changes
        </button>
      </form>
    </div>
  );
}
