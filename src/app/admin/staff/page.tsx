import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addStaffMember, toggleStaffActive, inviteStaffLogin } from "./actions";

const ALL_ROLES = ["bartender", "server", "barback"];

export default async function StaffDirectoryPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = createClient();

  const { data: staff } = await supabase
    .from("staff")
    .select("id, first_name, last_name, roles, active, user_id, staff_details(email)")
    .order("first_name");

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 720 }}>
      <div>
        <h1 style={{ margin: 0 }}>Staff</h1>
        <p style={{ color: "var(--color-muted)" }}>
          Your team, so you can assign them to events. Only you can see phone, email, and pay
          rate — staff logins never see this directory's contact or pay info.
        </p>
      </div>

      {searchParams.error && <p style={{ color: "#a33" }}>{searchParams.error}</p>}

      <form action={addStaffMember} className="card" style={{ display: "grid", gap: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label htmlFor="firstName">First name</label>
            <input id="firstName" name="firstName" required />
          </div>
          <div>
            <label htmlFor="lastName">Last name</label>
            <input id="lastName" name="lastName" required />
          </div>
        </div>

        <div>
          <label>Roles</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            {ALL_ROLES.map((role) => (
              <label key={role} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem" }}>
                <input type="checkbox" name={`role-${role}`} />
                {role[0].toUpperCase() + role.slice(1)}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" />
          </div>
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" />
          </div>
        </div>

        <button type="submit" className="button" style={{ justifySelf: "start" }}>
          Add staff member
        </button>
      </form>

      <div className="card" style={{ padding: 0 }}>
        {staff && staff.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.75rem 1rem" }}>Name</th>
                <th style={{ padding: "0.75rem 1rem" }}>Roles</th>
                <th style={{ padding: "0.75rem 1rem" }}>Status</th>
                <th style={{ padding: "0.75rem 1rem" }}>Login</th>
                <th style={{ padding: "0.75rem 1rem" }} />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const details = Array.isArray(s.staff_details) ? s.staff_details[0] : s.staff_details;
                const email = details?.email ?? null;
                return (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      {s.first_name} {s.last_name}
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>{s.roles?.join(", ") || "—"}</td>
                    <td style={{ padding: "0.75rem 1rem" }}>{s.active ? "Active" : "Inactive"}</td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      {s.user_id ? (
                        <span style={{ color: "#2a7a2a" }}>✓ Can log in</span>
                      ) : email ? (
                        <form action={inviteStaffLogin}>
                          <input type="hidden" name="staffId" value={s.id} />
                          <input type="hidden" name="firstName" value={s.first_name} />
                          <input type="hidden" name="lastName" value={s.last_name} />
                          <input type="hidden" name="email" value={email} />
                          <button
                            type="submit"
                            style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", padding: 0 }}
                          >
                            Invite to log in
                          </button>
                        </form>
                      ) : (
                        <span style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>Add an email first</span>
                      )}
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                        <Link href={`/admin/staff/${s.id}/edit`} style={{ color: "var(--color-accent)" }}>
                          Edit
                        </Link>
                        <form action={toggleStaffActive}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="active" value={String(s.active)} />
                          <button
                            type="submit"
                            style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", padding: 0 }}
                          >
                            {s.active ? "Deactivate" : "Reactivate"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p style={{ padding: "1.5rem", color: "var(--color-muted)", margin: 0 }}>
            No staff added yet.
          </p>
        )}
      </div>
    </div>
  );
}
