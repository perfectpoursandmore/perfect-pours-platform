"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");
}

/**
 * A quick, typed note for the dashboard's "Upcoming consultations" card --
 * for a call or follow-up Faith scheduled herself (by text, a call, in
 * person) that never went through the public booking flow, so there's
 * nowhere structured to put it. Freeform on purpose: "Call with Nicole at
 * 1:30pm - follow up" is the whole point, not a date/time picker.
 */
export async function addDashboardNote(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("dashboard_notes").insert({ note, created_by: user?.id ?? null });

  revalidatePath("/admin");
}

/** Clears one note once Faith's handled it (made the call, followed up). */
export async function removeDashboardNote(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));

  await supabase.from("dashboard_notes").delete().eq("id", id);

  revalidatePath("/admin");
}
