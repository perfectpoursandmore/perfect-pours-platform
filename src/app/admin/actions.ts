"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { addInboxItem } from "@/lib/inbox";

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

// ---------------------------------------------------------------------
// Text inbox -- client texts forwarded from Faith's iPhone (see
// /api/inbox and Settings > Text inbox). Each item is a to-do until she
// handles it; handling it removes it.
// ---------------------------------------------------------------------

/** The dashboard paste box: same as the iPhone Shortcut, for when she's at the computer. */
export async function addInboxText(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  await addInboxItem(supabase, String(formData.get("text") ?? ""), "", String(formData.get("note") ?? ""));
  revalidatePath("/admin");
}

/** Saves the short note Faith types next to an inbox item ("send an invoice"). */
export async function saveInboxNote(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  await supabase.from("inbox_items").update({ note: note || null }).eq("id", id);
  revalidatePath("/admin");
}

/** One-tap delete -- for test items, or anything she's already handled. */
export async function removeInboxItem(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");
  await supabase.from("inbox_items").delete().eq("id", id);
  revalidatePath("/admin");
}

/**
 * One form per inbox item; the button she taps says what to do:
 *   booking -> opens "Add a booking" with the client + date filled in
 *              (the item clears once the booking is saved)
 *   open    -> opens that client's next event (or their client page) so she
 *              can send what they asked for; the item stays until she taps Done
 *   todo    -> moves it to her Daily to-do list
 *   done    -> clears it
 */
export async function handleInboxItem(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("do") ?? "");
  const clientId = String(formData.get("clientId") ?? "");

  const { data: item } = await supabase.from("inbox_items").select("*").eq("id", id).single();
  if (!item) {
    revalidatePath("/admin");
    return;
  }

  // Remember who it's from, so the choice sticks if she comes back to it.
  if (clientId !== (item.client_id ?? "")) {
    await supabase.from("inbox_items").update({ client_id: clientId || null }).eq("id", id);
  }

  if (action === "booking") {
    const params = new URLSearchParams({ inboxId: id });
    if (clientId) params.set("clientId", clientId);
    if (item.guessed_date) params.set("eventDate", item.guessed_date);
    redirect(`/admin/events/new?${params.toString()}`);
  }

  if (action === "open") {
    if (!clientId) redirect("/admin?inboxError=Pick who it's from first.#inbox");
    const { data: next } = await supabase
      .from("events")
      .select("id")
      .eq("client_id", clientId)
      .gte("event_date", new Date().toISOString().slice(0, 10))
      .order("event_date")
      .limit(1)
      .maybeSingle();
    redirect(next ? `/admin/events/${next.id}` : `/admin/clients/${clientId}`);
  }

  if (action === "todo") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("todos").insert({ list_type: "daily", item: item.note ? `${item.note}: ${item.body}` : item.body, created_by: user?.id ?? null });
    await supabase.from("inbox_items").delete().eq("id", id);
  }

  if (action === "done") {
    await supabase.from("inbox_items").delete().eq("id", id);
  }

  revalidatePath("/admin");
}
