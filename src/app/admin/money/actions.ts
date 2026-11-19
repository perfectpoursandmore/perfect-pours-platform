"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { round2 } from "@/lib/money";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");
}

const money = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? round2(n) : 0;
};

/**
 * Saves one receipt (or return): its total, optional photo, and how much
 * Faith typed in for each event. Whatever isn't given to an event stays as
 * "Stock". Called straight from the receipt form.
 */
export async function saveExpense(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  await requireAdmin();
  const supabase = createClient();

  const total = money(formData.get("total"));
  if (!total) return { error: "Type the total from the receipt." };
  const isReturn = formData.get("isReturn") === "on";
  const spentOn = String(formData.get("spentOn") ?? "") || new Date().toISOString().slice(0, 10);
  const store = String(formData.get("store") ?? "").trim().slice(0, 120) || null;
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;

  const splits: { event_id: string; amount: number }[] = [];
  for (const [key, value] of Array.from(formData.entries())) {
    if (!key.startsWith("split_")) continue;
    const amount = money(value);
    if (amount > 0) splits.push({ event_id: key.slice("split_".length), amount });
  }
  const given = round2(splits.reduce((s, x) => s + x.amount, 0));
  if (given > total + 0.005) {
    return { error: `The event amounts add up to $${given.toFixed(2)}, which is more than the $${total.toFixed(2)} total.` };
  }

  let receiptPath: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const ext = (photo.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "jpg";
    receiptPath = `${spentOn.slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("receipts")
      .upload(receiptPath, photo, { contentType: photo.type || "image/jpeg", upsert: false });
    if (error) return { error: "The photo didn't upload. Try again, or save it without the photo." };
  }

  const { data: expense, error } = await supabase
    .from("expenses")
    .insert({ spent_on: spentOn, store, total, is_return: isReturn, note, receipt_path: receiptPath })
    .select("id")
    .single();
  if (error || !expense) {
    if (receiptPath) await supabase.storage.from("receipts").remove([receiptPath]);
    return { error: "That didn't save. Has the one-time setup on the Money page been run?" };
  }

  if (splits.length) {
    const { error: splitError } = await supabase
      .from("expense_splits")
      .insert(splits.map((s) => ({ ...s, expense_id: expense.id })));
    if (splitError) {
      await supabase.from("expenses").delete().eq("id", expense.id);
      if (receiptPath) await supabase.storage.from("receipts").remove([receiptPath]);
      return { error: "That didn't save. Please try again." };
    }
  }

  revalidatePath("/admin/money");
  for (const s of splits) revalidatePath(`/admin/events/${s.event_id}/money`);
  return { ok: true };
}

export async function deleteExpense(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");
  const back = String(formData.get("back") ?? "/admin/money");
  const { data: expense } = await supabase.from("expenses").select("receipt_path").eq("id", id).single();
  await supabase.from("expenses").delete().eq("id", id);
  if (expense?.receipt_path) await supabase.storage.from("receipts").remove([expense.receipt_path]);
  revalidatePath("/admin/money");
  redirect(back.startsWith("/admin/") ? back : "/admin/money");
}
