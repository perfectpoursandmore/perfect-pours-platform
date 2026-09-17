"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";

/**
 * A staff member answering "am I free for this event". Only ever touches
 * their own invite — the database's Row Level Security policy on
 * event_staff_invites (migration 0010) is the real backstop for that, this
 * check is just so a logged-out or wrong-role hit doesn't error instead of
 * bouncing to login.
 */
export async function respondToAvailability(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "staff") redirect("/login");

  const inviteId = String(formData.get("inviteId"));
  const status = String(formData.get("status"));
  if (status !== "available" && status !== "unavailable") return;

  const supabase = createClient();
  await supabase
    .from("event_staff_invites")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("id", inviteId);

  revalidatePath("/staff/availability");
  revalidatePath("/staff");
}
