import { createClient } from "@/lib/supabase/server";
import { addContractTemplate, updateContractTemplate, toggleContractTemplateActive } from "./actions";

export default async function TemplatesPage() {
  const supabase = createClient();
  const { data: templates } = await supabase
    .from("contract_templates")
    .select("*")
    .order("created_at");

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 720 }}>
      <div>
        <h1 style={{ margin: 0 }}>Contract templates</h1>
        <p style={{ color: "var(--color-muted)" }}>
          Available placeholders, filled in automatically for each event: {" "}
          <code>
            {"{{client_name}} {{event_date}} {{event_location}} {{services_list}} {{total_amount}} {{deposit_amount}} {{balance_amount}}"}
          </code>
        </p>
      </div>

      {(templates ?? []).map((t) => (
        <form key={t.id} action={updateContractTemplate} className="card" style={{ display: "grid", gap: "0.75rem" }}>
          <input type="hidden" name="id" value={t.id} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <input
              name="name"
              defaultValue={t.name}
              style={{ fontWeight: 600, border: "none", fontSize: "1rem", padding: 0 }}
            />
            <span style={{ fontSize: "0.85rem", color: "var(--color-muted)" }}>
              {t.active ? "Active" : "Inactive"}
            </span>
          </div>
          <textarea
            name="body"
            defaultValue={t.body}
            rows={16}
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.85rem",
            }}
          />
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button type="submit" className="button">
              Save
            </button>
          </div>
        </form>
      ))}

      {(templates ?? []).map((t) => (
        <form key={`toggle-${t.id}`} action={toggleContractTemplateActive} style={{ marginTop: "-1rem" }}>
          <input type="hidden" name="id" value={t.id} />
          <input type="hidden" name="active" value={String(t.active)} />
          <button
            type="submit"
            style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", fontSize: "0.85rem" }}
          >
            {t.active ? "Deactivate" : "Reactivate"} &quot;{t.name}&quot;
          </button>
        </form>
      ))}

      <form action={addContractTemplate} className="card" style={{ display: "grid", gap: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Add another template</h2>
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" required placeholder="e.g. Corporate Event Agreement" />
        </div>
        <div>
          <label htmlFor="body">Body</label>
          <textarea
            id="body"
            name="body"
            rows={10}
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.85rem",
            }}
          />
        </div>
        <button type="submit" className="button" style={{ justifySelf: "start" }}>
          Add template
        </button>
      </form>
    </div>
  );
}
