"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/roles";
import { isEmailConfigured, sendEmail, sendTemplatedEmail } from "@/lib/email";
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
 * Sends a real login invite to a staff member already in the roster, and is
 * also the "Resend invite" button for someone who hasn't joined yet.
 *
 * Why we don't use Supabase's own invite email: its link signs the person in
 * the moment the link is opened, and that link only works once. Outlook,
 * Gmail and iMessage "safety check" links by opening them before the person
 * ever taps, which used up the link, so staff saw "That link is invalid or
 * has expired" even when they tapped it right away.
 *
 * Instead we ask Supabase for the one-time code behind the link and send our
 * own email pointing to /auth/accept, a page with a "Set up my account"
 * button. Link checkers only open pages, they never press buttons, so the
 * code is used only when the real person taps. The same link is also shown
 * on the Staff page so Faith can text it if the email doesn't arrive.
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

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || appUrlFromRequest()).replace(/\/$/, "");
  const userData = { role: "staff", full_name: `${firstName} ${lastName}`.trim() };

  const admin = createAdminClient();
  // "invite" works for someone new or invited-but-not-joined. If Supabase
  // won't make another invite for this email (e.g. the login already
  // exists), a one-time sign-in link does the same job: tapping it confirms
  // their email and takes them to set a password.
  let linkType: "invite" | "magiclink" = "invite";
  let result = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: userData, redirectTo: `${appUrl}/auth/set-password` },
  });
  if (result.error) {
    linkType = "magiclink";
    result = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${appUrl}/auth/set-password` },
    });
  }

  const { data, error } = result;
  const tokenHash = data?.properties?.hashed_token;
  if (error || !data?.user || !tokenHash) {
    redirect(
      `/admin/staff?error=${encodeURIComponent(error?.message ?? "Couldn't create that invite.")}`
    );
  }

  const supabase = createClient();
  await supabase.from("staff").update({ user_id: data!.user.id }).eq("id", staffId);

  const acceptLink = `${appUrl}/auth/accept?token_hash=${encodeURIComponent(tokenHash!)}&type=${linkType}`;

  let sent = false;
  if (isEmailConfigured()) {
    try {
      await sendEmail({
        to: email,
        subject: "Your Perfect Pours & More staff login",
        html: inviteEmailHtml(firstName, acceptLink),
      });
      sent = true;
    } catch {
      sent = false;
    }
  }

  revalidatePath("/admin/staff");
  const notice = sent
    ? `Invite sent to ${email}.`
    : `The email didn't go out, so text ${firstName || "them"} this link instead.`;
  redirect(
    `/admin/staff?notice=${encodeURIComponent(notice)}&inviteLink=${encodeURIComponent(acceptLink)}`
  );
}

function appUrlFromRequest(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

function inviteEmailHtml(firstName: string, link: string): string {
  const hi = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi,";
  return `<p>${hi}</p>
<p>Faith has set you up with a login for the Perfect Pours &amp; More staff app, where you can see your events and let her know when you're free.</p>
<p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#8a2346;color:#fff;border-radius:999px;text-decoration:none">Set up my account</a></p>
<p>Tap the button, then tap <strong>Set up my account</strong> on the page that opens and choose a password.</p>
<p>If the button doesn't work, copy this link into your browser:<br>${link}</p>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
    redirect(`/admin/staff?date=${encodeURIComponent(date)}#availability`);
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

  revalidatePath("/admin/staff");
  redirect(`/admin/staff?date=${encodeURIComponent(date)}#availability`);
}

/** Cancels a day-level availability ask -- e.g. she meant a different date or person. */
export async function withdrawDayAvailabilityRequest(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const date = String(formData.get("date") ?? "");

  await supabase.from("staff_date_availability").delete().eq("id", id);

  revalidatePath("/admin/staff");
  redirect(`/admin/staff?date=${encodeURIComponent(date)}#availability`);
}
