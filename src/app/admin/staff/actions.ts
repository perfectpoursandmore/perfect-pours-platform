"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/roles";

const ALL_ROLES = ["bartender", "server", "barback"];

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");
}

export async function addStaffMember(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();

  const roles = ALL_ROLES.filter((r) => formData.get(`role-${r}`) === "on");
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  const { data: staff, error } = await supabase
    .from("staff")
    .insert({
      first_name: String(formData.get("firstName") ?? ""),
      last_name: String(formData.get("lastName") ?? ""),
      roles,
    })
    .select("id")
    .single();

  // pay_rate is intentionally not set here — Faith sets an hourly rate per
  // event instead, on that event's staff/payout screen, rather than a
  // default per staff member.
  if (!error && staff) {
    await supabase.from("staff_details").insert({
      staff_id: staff.id,
      phone: phone || null,
      email: email || null,
    });
  }

  revalidatePath("/admin/staff");
}

/**
 * Sends a real login invite to a staff member already in the roster — an
 * actual email + set-a-password flow, the same thing the one-time
 * invite-user.mjs script does, but from right here in the admin instead of
 * needing Node or database credentials. Requires an email on file for them
 * (from staff_details). Links the new login back to this staff row so the
 * staff calendar can bold "(you)" on their own assignments once they sign in.
 */
export async function inviteStaffLogin(formData: FormData) {
  await requireAdmin();
  const staffId = String(formData.get("staffId"));
  const firstName = String(formData.get("firstName") ?? "");
  const lastName = String(formData.get("lastName") ?? "");
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    redirect("/admin/staff?error=Add an email for this person before inviting them to log in.");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { role: "staff", full_name: `${firstName} ${lastName}`.trim() },
    redirectTo: `${appUrl}/auth/confirm`,
  });

  if (error || !data?.user) {
    redirect(
      `/admin/staff?error=${encodeURIComponent(
        error?.message ?? "Couldn't send that invite."
      )}`
    );
  }

  const supabase = createClient();
  await supabase.from("staff").update({ user_id: data!.user.id }).eq("id", staffId);

  revalidatePath("/admin/staff");
}

export async function toggleStaffActive(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";

  await supabase.from("staff").update({ active: !active }).eq("id", id);

  revalidatePath("/admin/staff");
}
