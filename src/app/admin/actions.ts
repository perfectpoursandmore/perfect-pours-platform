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

/**
 * Adds an item to either the Daily or Weekly to-do list (list_type tells
 * them apart). Both lists work the same way -- nothing here auto-resets or
 * expires; Faith checks items off and removes them herself, same as the
 * dashboard notes above.
 */
export async function addTodo(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const listType = String(formData.get("listType") ?? "");
  const item = String(formData.get("item") ?? "").trim();
  if (!item || (listType !== "daily" && listType !== "weekly")) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("todos").insert({ list_type: listType, item, created_by: user?.id ?? null });

  revalidatePath("/admin");
}

/** Checks (or unchecks) one to-do item -- the button submits the state it should flip to. */
export async function toggleTodo(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const done = String(formData.get("done")) === "true";

  await supabase.from("todos").update({ is_done: done }).eq("id", id);

  revalidatePath("/admin");
}

/** Removes a to-do item for good -- once it's done and out of mind, or it was added by mistake. */
export async function removeTodo(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));

  await supabase.from("todos").delete().eq("id", id);

  revalidatePath("/admin");
}
