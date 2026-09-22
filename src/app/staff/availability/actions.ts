"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { formatDate } from "@/lib/labels";

/**
 * A staff member answering "am I free for this event". Only ever touches
 * their own invite — the database's Row Level Security policy on
 * event_staff_invites (migration 0010) is the real backstop for that, this
 * check is just so a logged-out or wrong-role hit doesn't error instead of
 * bouncing to login.
 *
 * Chains `.select().single()` onto the update and checks the result: an
 * update that RLS silently filters out (0 rows touched) is NOT a Postgres
 * error, so without this the click used to just do nothing with no
 * indication anything went wrong — this is what "the button doesn't work"
 * looked like. Now any failure bounces back with a visible message instead
 * of a silent no-op.
 */
export async function respondToAvailability(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "staff") redirect("/login");

  const inviteId = String(formData.get("inviteId"));
  const status = String(formData.get("status"));
  if (status !== "available" && status !== "unavailable") return;

  const supabase = createClient();
  const { data: updated, error } = await supabase
    .from("event_staff_invites")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("id", inviteId)
    .select("id, event_id, staff:staff_id(first_name, last_name)")
    .single();

  if (error || !updated) {
    redirect(
      "/staff/availability?error=" +
        encodeURIComponent("That didn't go through — try again, or text Faith if it keeps happening.")
    );
  }

  // Best-effort: let Faith know right away instead of her having to check
  // the event's Staff tab to find out someone answered. Same pattern as
  // the new-lead / new-booking admin notifications elsewhere in the app —
  // a raw sendEmail(), never blocking or failing the main action.
  if (isEmailConfigured()) {
    try {
      const { data: event } = await supabase
        .from("events")
        .select("name, event_date")
        .eq("id", updated!.event_id)
        .single();
      const person = Array.isArray(updated!.staff) ? updated!.staff[0] : updated!.staff;
      const notifyTo = process.env.ADMIN_NOTIFICATION_EMAIL || "faith@perfectpoursandmore.com";
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      await sendEmail({
        to: notifyTo,
        subject: `${person ? `${person.first_name} ${person.last_name}` : "A staff member"} ${
          status === "available" ? "is available" : "is NOT available"
        } — ${event?.name ?? "an event"}`,
        html: `<p>${person ? `${person.first_name} ${person.last_name}` : "A staff member"} just answered an availability request for <strong>${
          event?.name ?? "an event"
        }</strong>${event?.event_date ? ` (${formatDate(event.event_date)})` : ""}: <strong>${
          status === "available" ? "Yes, available" : "Not available"
        }</strong>.</p>
<p><a href="${appUrl}/admin/events/${updated!.event_id}/staff">View this event's staffing</a></p>`,
      });
    } catch (err) {
      console.error("Failed to send availability-response notification to Faith:", err);
    }
  }

  revalidatePath("/staff/availability");
  revalidatePath("/staff");
}

/**
 * A staff member answering "am I free on this whole day" -- the day-level
 * counterpart to respondToAvailability above (staff_date_availability,
 * migration 0014, instead of event_staff_invites). Same select().single()
 * check so an RLS-filtered no-op surfaces as a visible error instead of
 * silently doing nothing.
 */
export async function respondToDayAvailability(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "staff") redirect("/login");

  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (status !== "available" && status !== "unavailable") return;

  const supabase = createClient();
  const { data: updated, error } = await supabase
    .from("staff_date_availability")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, date, staff:staff_id(first_name, last_name)")
    .single();

  if (error || !updated) {
    redirect(
      "/staff/availability?error=" +
        encodeURIComponent("That didn't go through — try again, or text Faith if it keeps happening.")
    );
  }

  // Same best-effort admin notification as the per-event response above.
  if (isEmailConfigured()) {
    try {
      const person = Array.isArray(updated!.staff) ? updated!.staff[0] : updated!.staff;
      const notifyTo = process.env.ADMIN_NOTIFICATION_EMAIL || "faith@perfectpoursandmore.com";
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      await sendEmail({
        to: notifyTo,
        subject: `${person ? `${person.first_name} ${person.last_name}` : "A staff member"} ${
          status === "available" ? "is available" : "is NOT available"
        } — ${formatDate(updated!.date)}`,
        html: `<p>${person ? `${person.first_name} ${person.last_name}` : "A staff member"} just answered a day availability request for <strong>${formatDate(
          updated!.date
        )}</strong>: <strong>${status === "available" ? "Yes, available" : "Not available"}</strong>.</p>
<p><a href="${appUrl}/admin/staff/availability?date=${updated!.date}">View that day's availability</a></p>`,
      });
    } catch (err) {
      console.error("Failed to send day-availability-response notification to Faith:", err);
    }
  }

  revalidatePath("/staff/availability");
  revalidatePath("/staff");
}
