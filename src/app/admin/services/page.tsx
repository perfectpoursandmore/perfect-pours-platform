import { CatalogSection } from "./CatalogSection";
import { PricingSection } from "./PricingSection";

// One home for everything you sell: the pricing clients see on their pricing
// page, and the items you pull into proposals. These used to be separate
// "Price List" and "Catalog" pages; their old links redirect here
// (see next.config.js).
export default async function ServicesPage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string };
}) {
  return (
    <div style={{ display: "grid", gap: "2rem", maxWidth: 760 }}>
      <div>
        <h1 style={{ margin: 0 }}>Services</h1>
        <p style={{ color: "var(--color-muted)", marginBottom: 0 }}>
          Jump to:{" "}
          <a href="#pricing" style={{ color: "var(--color-accent)" }}>
            Pricing page
          </a>{" "}
          ·{" "}
          <a href="#catalog" style={{ color: "var(--color-accent)" }}>
            Proposal items
          </a>
        </p>
      </div>

      <PricingSection searchParams={searchParams} />

      <hr style={{ border: "none", borderTop: "1px solid var(--color-border)", margin: 0 }} />

      <CatalogSection />
    </div>
  );
}
