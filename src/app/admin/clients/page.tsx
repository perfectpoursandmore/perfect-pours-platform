import { createClient } from "@/lib/supabase/server";

export default async function ClientsPage() {
  const supabase = createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, first_name, last_name, email, phone")
    .order("last_name");

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
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <a href={`/admin/clients/${client.id}`}>
                      {client.first_name} {client.last_name}
                    </a>
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>{client.email ?? "—"}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>{client.phone ?? "—"}</td>
                </tr>
              ))}
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
