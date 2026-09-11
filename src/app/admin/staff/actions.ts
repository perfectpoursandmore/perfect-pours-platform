"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

export async function toggleStaffActive(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";

  await supabase.from("staff").update({ active: !active }).eq("id", id);

  revalidatePath("/admin/staff");
}
