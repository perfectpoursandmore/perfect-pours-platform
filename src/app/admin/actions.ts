"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { addInboxItem } from "@/lib/inbox";
import { TODO_COLORS } from "@/lib/todo-colors";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");
}

// ---------------------------------------------------------------------
// The one running "To do" list on the Today screen. Faith types an item,
// presses Enter, and keeps going. Checking an item strikes it through (it
// stays put until she clears it). Color is optional and has no fixed
// meaning: she uses it however she likes ("next week", "less important").
// These are called straight from the list (no page reload) and hand back
// what changed so the list updates instantly.
// ---------------------------------------------------------------------

export async function addTodoItem(text: string): Promise<{ id: string; created_at: string } | null> {
  await requireAdmin();
  const supabase = createClient();
  const item = String(text ?? "").trim().slice(0, 500);
  if (!item) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // list_type is left over from the old Daily/Weekly split; everything is one list now.
  const { data } = await supabase
    .from("todos")
    .insert({ list_type: "daily", item, created_by: user?.id ?? null })
    .select("id, created_at")
    .single();

  revalidatePath("/admin");
  return data ?? null;
}

export async function setTodoDone(id: string, done: boolean) {
  await requireAdmin();
  const supabase = createClient();
  await supabase.from("todos").update({ is_done: done }).eq("id", id);
  revalidatePath("/admin");
}

/** Pass null to take the color off. Anything not in the palette is ignored. */
export async function setTodoColor(id: string, color: string | null) {
  await requireAdmin();
  if (color !== null && !(TODO_COLORS as readonly string[]).includes(color)) return;
  const supabase = createClient();
  await supabase.from("todos").update({ color }).eq("id", id);
  revalidatePath("/admin");
}

export async function editTodoText(id: string, text: string) {
  await requireAdmin();
  const item = String(text ?? "").trim().slice(0, 500);
  if (!item) return;
  const supabase = createClient();
  await supabase.from("todos").update({ item }).eq("id", id);
  revalidatePath("/admin");
}

export async function deleteTodo(id: string) {
  await requireAdmin();
  const supabase = createClient();
  await supabase.from("todos").delete().eq("id", id);
  revalidatePath("/admin");
}

/** "Clear checked items": removes everything that's been crossed off. */
export async function clearDoneTodos() {
  await requireAdmin();
  const supabase = createClient();
  await supabase.from("todos").delete().eq("is_done", true);
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
 *   todo    -> moves it to her To do list
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

/** The on/off switches at the bottom of the Today screen (morning email, overnight clear). */
export async function setPreference(formData: FormData) {
  await requireAdmin();
  const key = String(formData.get("key") ?? "");
  if (key !== "morning_email" && key !== "clear_done_overnight") return;
  const value = String(formData.get("value")) === "true";
  const supabase = createClient();
  await supabase.from("app_preferences").upsert({ id: true, [key]: value, updated_at: new Date().toISOString() });
  revalidatePath("/admin");
}
