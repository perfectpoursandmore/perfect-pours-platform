"use client";

import { useState, type ChangeEvent } from "react";

type CatalogItem = {
  id: string;
  name: string;
  description: string | null;
  default_price: number | null;
};

const fieldStyle = {
  width: "100%",
  padding: "0.55rem 0.7rem",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  fontFamily: "inherit",
};

/**
 * The "From catalog" picker on the Add a proposal line form. Picking an item
 * fills in its description (including line breaks, e.g. a bar package's
 * feature list) and price for her — she can still edit either before adding
 * the line, or leave the catalog dropdown on "custom line" and type her own.
 */
export function AddProposalItemFields({ catalogItems }: { catalogItems: CatalogItem[] }) {
  const [description, setDescription] = useState("");
  const [unitPrice, setUnitPrice] = useState("0");

  function handleCatalogSelect(e: ChangeEvent<HTMLSelectElement>) {
    const item = catalogItems.find((c) => c.id === e.target.value);
    setDescription(item ? item.description ?? item.name : "");
    setUnitPrice(item?.default_price != null ? String(item.default_price) : "0");
  }

  return (
    <>
      <div>
        <label htmlFor="catalogItemId">From catalog (optional)</label>
        <select id="catalogItemId" name="catalogItemId" defaultValue="" onChange={handleCatalogSelect} style={fieldStyle}>
          <option value="">— custom line —</option>
          {catalogItems.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.default_price != null ? `($${c.default_price})` : "(varies)"}
            </option>
          ))}
        </select>
        <textarea
          name="description"
          placeholder="Description"
          required
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ ...fieldStyle, marginTop: "0.4rem" }}
        />
      </div>
      <div>
        <label htmlFor="quantity">Qty</label>
        <input id="quantity" name="quantity" type="number" step="0.5" defaultValue={1} />
      </div>
      <div>
        <label htmlFor="unitPrice">Unit price</label>
        <input
          id="unitPrice"
          name="unitPrice"
          type="number"
          step="0.01"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
        />
      </div>
    </>
  );
}
