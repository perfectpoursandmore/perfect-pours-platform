import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateStaffMember } from "../../actions";

const ALL_ROLES = ["bartender", "server", "barback"];

export default async function EditStaffPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const supabase = createClient();

  const { data: staff } = await supabase
    .from("staff")
    .select("id, first_name, last_name, roles, staff_details(phone, email)")
    .eq("id", params.id)
    .single();

  if (!staff) notFound();

  const details = Array.isArray(staff.staff_details) ? staff.staff_details[0] : staff.staff_details;

  return (
    <div style={{ maxWidth: 480, display: "grid", gap: "1.5rem" }}>
      <div>
        <h1 style={{ margin: 0 }}>
          Edit {staff.first_name} {staff.last_name}
        </h1>
      </div>

      {searchParams.error && <p style={{ color: "#a33" }}>{searchParams.error}</p>}

      <form action={updateStaffMember} className="card" style={{ display: "grid", gap: "1rem" }}>
        <input type="hidden" name="staffId" value={staff.id} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label htmlFor="firstName">First name</label>
            <input id="firstName" name="firstName" defaultValue={staff.first_name} required />
          </div>
          <div>
            <label htmlFor="lastName">Last name</label>
            <input id="lastName" name="lastName" defaultValue={staff.last_name} required />
          </div>
        </div>

        <div>
          <label>Roles</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            {ALL_ROLES.map((role) => (
              <label key={role} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem" }}>
                <input type="checkbox" name={`role-${role}`} defaultChecked={staff.roles?.includes(role)} />
                {role[0].toUpperCase() + role.slice(1)}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" defaultValue={details?.phone ?? ""} />
          </div>
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" defaultValue={details?.email ?? ""} />
            {staff && (
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", color: "var(--color-muted)" }}>
                If they already log in, this updates their sign-in email too.
              </p>
            )}
          </div>
        </div>

        <button type="submit" className="button" style={{ justifySelf: "start" }}>
          Save changes
        </button>
      </form>
    </div>
  );
}
