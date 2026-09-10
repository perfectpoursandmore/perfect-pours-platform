import { createClient } from "@/lib/supabase/server";
import { addEmailTemplate, updateEmailTemplate, toggleEmailTemplateActive } from "./actions";

export default async function EmailTemplatesPage() {
  const supabase = createClient();
  const { data: templates } = await supabase.from("email_templates").select("*").order("created_at");

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 720 }}>
      <div>
        <h1 style={{ margin: 0 }}>Email templates</h1>
        <p style={{ color: "var(--color-muted)" }}>
          Common placeholders, filled in automatically where available:{" "}
          <code>
            {"{{client_name}} {{event_date}} {{event_type}} {{consultation_datetime}} {{secure_link}}"}
          </code>
          . Sending needs an email provider connected — see{" "}
          <a href="/admin/settings/email">Settings → Email</a>.
        </p>
      </div>

      {(templates ?? []).map((t) => (
        <form key={t.id} action={updateEmailTemplate} className="card" style={{ display: "grid", gap: "0.75rem" }}>
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
          <div>
            <label htmlFor={`subject-${t.id}`}>Subject</label>
            <input id={`subject-${t.id}`} name="subject" defaultValue={t.subject} />
          </div>
          <div>
            <label htmlFor={`body-${t.id}`}>Body (HTML)</label>
            <textarea
              id={`body-${t.id}`}
              name="body"
              defaultValue={t.body}
              rows={12}
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
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button type="submit" className="button">
              Save
            </button>
          </div>
        </form>
      ))}

      {(templates ?? []).map((t) => (
        <form key={`toggle-${t.id}`} action={toggleEmailTemplateActive} style={{ marginTop: "-1rem" }}>
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

      <form action={addEmailTemplate} className="card" style={{ display: "grid", gap: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Add another template</h2>
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" required placeholder="e.g. Balance Reminder" />
        </div>
        <div>
          <label htmlFor="subject">Subject</label>
          <input id="subject" name="subject" placeholder="e.g. Your balance is due soon" />
        </div>
        <div>
          <label htmlFor="body">Body (HTML)</label>
          <textarea
            id="body"
            name="body"
            rows={8}
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
