import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EVENT_TYPE_LABELS, EVENT_STATUS_LABELS, formatDate, formatMoney } from "@/lib/labels";
import { isEmailConfigured } from "@/lib/email";
import {
  updateClientInfo,
  addClientNote,
  sendClientEmail,
  addClientCredit,
  redeemClientCredit,
  removeClientCredit,
} from "../actions";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const supabase = createClient();

  const { data: client } = await supabase.from("clients").select("*").eq("id", params.id).single();
  if (!client) notFound();

  const { data: notes } = await supabase
    .from("client_notes")
    .select("id, note, created_at")
    .eq("client_id", params.id)
    .order("created_at", { ascending: false });

  const { data: credits } = await supabase
    .from("client_credits")
    .select("id, amount, reason, expires_on, redeemed_at, created_at")
    .eq("client_id", params.id)
    .order("created_at", { ascending: false });

  const { data: events } = await supabase
    .from("events")
    .select("id, name, event_type, event_date, status")
    .eq("client_id", params.id)
    .order("event_date", { ascending: false });

  const { data: emailTemplates } = await supabase
    .from("email_templates")
    .select("id, name")
    .eq("active", true)
    .order("created_at");

  const { data: emailHistory } = await supabase
    .from("email_log")
    .select("id, subject, to_email, status, created_at, error")
    .eq("client_id", params.id)
    .order("created_at", { ascending: false });

  const { data: otherClients } = await supabase
    .from("clients")
    .select("id, first_name, last_name, email")
    .neq("id", params.id)
    .order("first_name");

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 640 }}>
      <div>
        <a href="/admin/clients" style={{ fontSize: "0.9rem" }}>
          ← All clients
        </a>
        <h1 style={{ margin: "0.5rem 0 0" }}>
          {client.first_name} {client.last_name}
        </h1>
      </div>

      {searchParams.error && <p style={{ color: "#a33" }}>{searchParams.error}</p>}

      {credits && credits.length > 0 && (
        <div className="card" style={{ borderColor: credits.some((c) => !c.redeemed_at && (!c.expires_on || c.expires_on >= todayISO())) ? "#e0b84a" : undefined }}>
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Account credit</h2>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.6rem" }}>
            {credits.map((c) => {
              const expired = c.expires_on ? c.expires_on < todayISO() : false;
              const status = c.redeemed_at ? "Redeemed" : expired ? "Expired" : "Active";
              const statusColor = c.redeemed_at ? "var(--color-muted)" : expired ? "#a33" : "#2a7a2a";
              return (
                <li key={c.id} style={{ borderTop: "1px solid var(--color-border)", paddingTop: "0.6rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "0.75rem", flexWrap: "wrap" }}>
                    <div>
                      <strong style={{ fontSize: "1.05rem" }}>{formatMoney(c.amount)}</strong>{" "}
                      <span style={{ color: statusColor, fontSize: "0.85rem" }}>— {status}</span>
                      {c.reason && <div style={{ fontSize: "0.9rem" }}>{c.reason}</div>}
                      {c.expires_on && (
                        <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>
                          Expires {formatDate(c.expires_on)}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "0.6rem", flexShrink: 0 }}>
                      {!c.redeemed_at && (
                        <form action={redeemClientCredit}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="clientId" value={client.id} />
                          <button type="submit" style={{ background: "none", border: "1px solid var(--color-border)", borderRadius: 6, padding: "0.3rem 0.6rem", cursor: "pointer", fontSize: "0.85rem" }}>
                            Mark redeemed
                          </button>
                        </form>
                      )}
                      <form action={removeClientCredit}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="clientId" value={client.id} />
                        <button type="submit" style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", fontSize: "0.85rem" }}>
                          Remove
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <details className="card">
        <summary style={{ cursor: "pointer", fontSize: "1rem", fontWeight: 600 }}>Add account credit</summary>
        <form action={addClientCredit} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr auto", gap: "0.75rem", alignItems: "end", marginTop: "0.75rem" }}>
          <input type="hidden" name="clientId" value={client.id} />
          <div>
            <label htmlFor="creditAmount">Amount ($)</label>
            <input id="creditAmount" name="amount" type="number" step="0.01" min="0.01" required />
          </div>
          <div>
            <label htmlFor="creditReason">Reason (optional)</label>
            <input id="creditReason" name="reason" placeholder="e.g. Rain cancellation — Staff Party 9/26" />
          </div>
          <div>
            <label htmlFor="creditExpires">Expires (optional)</label>
            <input id="creditExpires" name="expiresOn" type="date" />
          </div>
          <button type="submit" className="button">
            Add credit
          </button>
        </form>
      </details>

      <form action={updateClientInfo} className="card" style={{ display: "grid", gap: "1rem" }}>
        <input type="hidden" name="id" value={client.id} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label htmlFor="firstName">First name</label>
            <input id="firstName" name="firstName" defaultValue={client.first_name} required />
          </div>
          <div>
            <label htmlFor="lastName">Last name</label>
            <input id="lastName" name="lastName" defaultValue={client.last_name} required />
          </div>
        </div>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" defaultValue={client.email ?? ""} />
        </div>
        <div>
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" defaultValue={client.phone ?? ""} />
        </div>
        <div>
          <label htmlFor="preferredContactMethod">Preferred contact method</label>
          <select
            id="preferredContactMethod"
            name="preferredContactMethod"
            defaultValue={client.preferred_contact_method ?? ""}
            style={{ width: "100%", padding: "0.55rem 0.7rem", borderRadius: 8, border: "1px solid var(--color-border)" }}
          >
            <option value="">No preference on file</option>
            <option value="phone">Phone</option>
            <option value="email">Email</option>
            <option value="text">Text</option>
          </select>
        </div>
        <button type="submit" className="button" style={{ justifySelf: "start" }}>
          Save
        </button>
      </form>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Events</h2>
          <a href={`/admin/events/new?clientId=${client.id}`} style={{ fontSize: "0.9rem" }}>
            + Add booking for {client.first_name}
          </a>
        </div>
        {events && events.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
            {events.map((event) => (
              <li key={event.id}>
                <a href={`/admin/events/${event.id}`}>{event.name}</a>{" "}
                <span style={{ color: "var(--color-muted)" }}>
                  — {EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}, {formatDate(event.event_date)} (
                  {EVENT_STATUS_LABELS[event.status]})
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "var(--color-muted)", margin: 0 }}>No events yet for this client.</p>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Private notes</h2>
        <p style={{ color: "var(--color-muted)", marginTop: 0 }}>
          From texts, calls, emails, or in-person conversations — never visible to the client or
          to staff.
        </p>

        <form action={addClientNote} style={{ display: "grid", gap: "0.5rem", marginBottom: "1.25rem" }}>
          <input type="hidden" name="clientId" value={client.id} />
          <textarea
            name="note"
            required
            rows={3}
            style={{
              width: "100%",
              padding: "0.55rem 0.7rem",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              fontFamily: "inherit",
              fontSize: "0.95rem",
            }}
            placeholder="e.g. Prefers text over email. Mentioned she's flexible on the exact guest count."
          />
          <button type="submit" className="button" style={{ justifySelf: "start" }}>
            Add note
          </button>
        </form>

        {notes && notes.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.75rem" }}>
            {notes.map((n) => (
              <li key={n.id} style={{ borderTop: "1px solid var(--color-border)", paddingTop: "0.75rem" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>
                  {new Date(n.created_at).toLocaleString()}
                </div>
                <div>{n.note}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "var(--color-muted)", margin: 0 }}>No notes yet.</p>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Emails</h2>

        {!client.email ? (
          <p style={{ color: "var(--color-muted)", margin: 0 }}>
            No email address on file — add one above to send this client email.
          </p>
        ) : !isEmailConfigured() ? (
          <p style={{ color: "var(--color-muted)", margin: 0 }}>
            Email sending isn&apos;t configured yet — see <a href="/admin/settings/email">Settings → Email</a>.
          </p>
        ) : (emailTemplates ?? []).length === 0 ? (
          <p style={{ color: "var(--color-muted)", margin: 0 }}>
            No email templates yet — add one in <a href="/admin/email-templates">Email templates</a>.
          </p>
        ) : (
          <form action={sendClientEmail} style={{ display: "flex", gap: "0.75rem", alignItems: "end", marginBottom: "1.25rem" }}>
            <input type="hidden" name="clientId" value={client.id} />
            <div style={{ flex: 1 }}>
              <label htmlFor="templateId">Send this client</label>
              <select
                id="templateId"
                name="templateId"
                style={{ width: "100%", padding: "0.55rem 0.7rem", borderRadius: 8, border: "1px solid var(--color-border)" }}
              >
                {(emailTemplates ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="button">
              Send
            </button>
          </form>
        )}

        {emailHistory && emailHistory.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
            {emailHistory.map((e) => (
              <li key={e.id} style={{ borderTop: "1px solid var(--color-border)", paddingTop: "0.5rem", fontSize: "0.9rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{e.subject}</span>
                  <span style={{ color: e.status === "sent" ? "#2a7a2a" : "#a33" }}>
                    {e.status === "sent" ? "Sent" : "Failed"}
                  </span>
                </div>
                <div style={{ color: "var(--color-muted)", fontSize: "0.8rem" }}>
                  {new Date(e.created_at).toLocaleString()} — to {e.to_email}
                  {e.error ? ` — ${e.error}` : ""}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "var(--color-muted)", margin: 0 }}>No emails sent to this client yet.</p>
        )}
      </div>

      {otherClients && otherClients.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Merge this client</h2>
          <p style={{ color: "var(--color-muted)", marginTop: 0 }}>
            Is this a duplicate of someone already in your list? Combine them into one record —
            all of this client&apos;s events, notes, and email history move over, and this record
            gets deleted. You&apos;ll see a confirmation before anything happens.
          </p>
          <form method="get" action={`/admin/clients/${client.id}/merge`} style={{ display: "flex", gap: "0.75rem", alignItems: "end" }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="into">Merge into</label>
              <select
                id="into"
                name="into"
                required
                defaultValue=""
                style={{ width: "100%", padding: "0.55rem 0.7rem", borderRadius: 8, border: "1px solid var(--color-border)" }}
              >
                <option value="" disabled>
                  — choose the other client —
                </option>
                {otherClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                    {c.email ? ` (${c.email})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="button">
              Review merge
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
