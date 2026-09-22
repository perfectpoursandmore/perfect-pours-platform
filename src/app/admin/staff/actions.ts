"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/roles";
import { isEmailConfigured, sendTemplatedEmail } from "@/lib/email";
import { formatDate } from "@/lib/labels";

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

/**
 * Edits an existing staff member's name, roles, phone, and email — e.g. she
 * just cross-trained someone to bartend, or they got a new email address.
 * If they already have a login, their sign-in email is kept in sync with
 * whatever's saved here too, so "update their email" doesn't quietly leave
 * their actual login address pointing somewhere stale.
 */
export async function updateStaffMember(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const staffId = String(formData.get("staffId"));

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const roles = ALL_ROLES.filter((r) => formData.get(`role-${r}`) === "on");
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (!firstName) {
    redirect(`/admin/staff/${staffId}/edit?error=${encodeURIComponent("First name is required.")}`);
  }

  await supabase
    .from("staff")
    .update({ first_name: firstName, last_name: lastName, roles })
    .eq("id", staffId);

  await supabase
    .from("staff_details")
    .upsert({ staff_id: staffId, phone: phone || null, email: email || null }, { onConflict: "staff_id" });

  const { data: staffRow } = await supabase.from("staff").select("user_id").eq("id", staffId).single();
  if (staffRow?.user_id && email) {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(staffRow.user_id, { email });
  }

  revalidatePath("/admin/staff");
  redirect("/admin/staff");
}

export async function toggleStaffActive(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";

  await supabase.from("staff").update({ active: !active }).eq("id", id);

  revalidatePath("/admin/staff");
}

/**
 * Asks one or more staff whether they're free on a whole DATE, not a
 * specific event -- for days like 12/12 with several parties booked, where
 * Faith wants one yes/no per person for the day instead of a separate ask
 * per event. Upserts into staff_date_availability (unique on staff+date) so
 * re-sending the same date/person just resets it back to pending rather
 * than creating a duplicate row.
 */
export async function requestDayAvailability(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const date = String(formData.get("date") ?? "").trim();
  const staffIds = formData.getAll("staffIds").map(String).filter(Boolean);

  if (!date || staffIds.length === 0) {
    redirect(`/admin/staff/availability?date=${encodeURIComponent(date)}`);
  }

  const { data: staffRows } = await supabase
    .from("staff")
    .select("id, first_name, staff_details(email)")
    .in("id", staffIds);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  let templateId: string | null = null;
  if (isEmailConfigured()) {
    const { data: template } = await supabase
      .from("email_templates")
      .select("id")
      .eq("active", true)
      .ilike("name", "%day availability%")
      .limit(1)
      .single();
    templateId = template?.id ?? null;
  }

  for (const staffId of staffIds) {
    await supabase.from("staff_date_availability").upsert(
      { staff_id: staffId, date, status: "pending", responded_at: null },
      { onConflict: "staff_id,date" }
    );

    if (!templateId) continue;

    const staffRow = (staffRows ?? []).find((s) => s.id === staffId) as
      | { id: string; first_name: string; staff_details: { email: string | null } | { email: string | null }[] | null }
      | undefined;
    const details = staffRow
      ? Array.isArray(staffRow.staff_details)
        ? staffRow.staff_details[0]
        : staffRow.staff_details
      : null;
    const email = details?.email;
    if (!email) continue;

    await sendTemplatedEmail(supabase, {
      templateId,
      to: email,
      vars: {
        staff_first_name: staffRow?.first_name ?? "there",
        date: formatDate(date),
        availability_link: `${appUrl}/staff/availability`,
      },
    });
  }

  revalidatePath("/admin/staff/availability");
  redirect(`/admin/staff/availability?date=${encodeURIComponent(date)}`);
}

/** Cancels a day-level availability ask -- e.g. she meant a different date or person. */
export async function withdrawDayAvailabilityRequest(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const date = String(formData.get("date") ?? "");

  await supabase.from("staff_date_availability").delete().eq("id", id);

  revalidatePath("/admin/staff/availability");
  redirect(`/admin/staff/availability?date=${encodeURIComponent(date)}`);
}
