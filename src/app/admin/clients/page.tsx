import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/labels";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default async function ClientsPage() {
  const supabase = createClient();
  const [{ data: clients }, { data: credits }] = await Promise.all([
    supabase.from("clients").select("id, first_name, last_name, email, phone").order("last_name"),
    supabase
      .from("client_credits")
      .select("client_id, amount, expires_on")
      .is("redeemed_at", null),
  ]);

  // Active = not redeemed (already filtered above) and not expired. Summed
  // per client so someone with more than one open credit shows one total.
  const activeCreditByClient = new Map<string, number>();
  for (const c of credits ?? []) {
    if (c.expires_on && c.expires_on < todayISO()) continue;
    activeCreditByClient.set(c.client_id, (activeCreditByClient.get(c.client_id) ?? 0) + Number(c.amount));
  }

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div>
        <h1 style={{ margin: 0 }}>Clients</h1>
        <p style={{ color: "var(--color-muted)" }}>
          Every client's contact info and notes, all in one place.
        </p>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {clients && clients.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.75rem 1rem" }}>Name</th>
                <th style={{ padding: "0.75rem 1rem" }}>Email</th>
                <th style={{ padding: "0.75rem 1rem" }}>Phone</th>
                <th style={{ padding: "0.75rem 1rem" }}>Credit</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const credit = activeCreditByClient.get(client.id);
                return (
                  <tr key={client.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <a href={`/admin/clients/${client.id}`}>
                        {client.first_name} {client.last_name}
                      </a>
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>{client.email ?? "—"}</td>
                    <td style={{ padding: "0.75rem 1rem" }}>{client.phone ?? "—"}</td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      {credit ? (
                        <span
                          style={{
                            background: "#fdf3d9",
                            color: "#7a5c1e",
                            borderRadius: 999,
                            padding: "0.15rem 0.6rem",
                            fontSize: "0.82rem",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatMoney(credit)} credit
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p style={{ padding: "1.5rem", color: "var(--color-muted)", margin: 0 }}>
            No clients yet — they show up here once a lead is converted.
          </p>
        )}
      </div>
    </div>
  );
}
