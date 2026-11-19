"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { round2 } from "@/lib/money";
import { syncQboExpenses } from "@/lib/expense-sync";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");
}

const money = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? round2(n) : 0;
};

function readSplits(formData: FormData) {
  const splits: { event_id: string; amount: number }[] = [];
  for (const [key, value] of Array.from(formData.entries())) {
    if (!key.startsWith("split_")) continue;
    const amount = money(value);
    if (amount > 0) splits.push({ event_id: key.slice("split_".length), amount });
  }
  return splits;
}

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

  const splits = readSplits(formData);
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
    .insert({ spent_on: spentOn, store, total, is_return: isReturn, note, receipt_path: receiptPath, source: "photo", reviewed: true })
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

/**
 * Sets how much of an existing expense (usually from QuickBooks) went to
 * each event, replacing what was there. "Not for an event" clears them so
 * all of it is Stock. Either way it drops off the "To tag" list.
 */
export async function tagExpense(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");
  const { data: expense } = await supabase.from("expenses").select("id, total").eq("id", id).single();
  if (!expense) return { error: "Couldn't find that expense." };

  const splits = formData.get("allStock") ? [] : readSplits(formData);
  const given = round2(splits.reduce((s, x) => s + x.amount, 0));
  const total = Number(expense.total);
  if (given > total + 0.005) {
    return { error: `The event amounts add up to $${given.toFixed(2)}, which is more than the $${total.toFixed(2)} total.` };
  }

  const { data: before } = await supabase.from("expense_splits").select("event_id").eq("expense_id", id);
  await supabase.from("expense_splits").delete().eq("expense_id", id);
  if (splits.length) {
    const { error } = await supabase.from("expense_splits").insert(splits.map((s) => ({ ...s, expense_id: id })));
    if (error) return { error: "That didn't save. Please try again." };
  }
  await supabase.from("expenses").update({ reviewed: true }).eq("id", id);

  revalidatePath("/admin/money");
  const touched = new Set([...splits.map((s) => s.event_id), ...((before ?? []) as { event_id: string }[]).map((b) => b.event_id)]);
  touched.forEach((eventId) => revalidatePath(`/admin/events/${eventId}/money`));
  return { ok: true };
}

/** Puts a left-out QuickBooks expense back in the totals, or leaves one out. */
export async function setExpenseCounts(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");
  const counts = formData.get("counts") === "1";
  await supabase.from("expenses").update({ counts, reviewed: true }).eq("id", id);
  if (!counts) await supabase.from("expense_splits").delete().eq("expense_id", id);
  revalidatePath("/admin/money");
  const back = String(formData.get("back") ?? "/admin/money");
  redirect(back.startsWith("/admin/") ? back : "/admin/money");
}

/** The "Check QuickBooks now" button. */
export async function refreshFromQuickBooks() {
  await requireAdmin();
  const supabase = createClient();
  const result = await syncQboExpenses(supabase, { force: true });
  revalidatePath("/admin/money");
  redirect(result.error ? `/admin/money?qboError=${encodeURIComponent(result.error)}` : `/admin/money?synced=${result.added}`);
}

/** One-tap "Stock" from the To tag list. */
export async function markAsStock(formData: FormData) {
  formData.set("allStock", "1");
  await tagExpense(formData);
}

// ---------------------------------------------------------------------
// Money settings and mileage.
// ---------------------------------------------------------------------

export async function saveMoneySettings(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const homeAddress = String(formData.get("homeAddress") ?? "").trim().slice(0, 300) || null;
  const pct = Math.min(60, Math.max(0, Number(formData.get("setAsidePct") ?? 25) || 0));
  const filing = formData.get("salesTaxFiling") === "annual" ? "annual" : "quarterly";

  const { data: current } = await supabase.from("money_settings").select("home_address").eq("id", true).maybeSingle();
  const addressChanged = (current?.home_address ?? null) !== homeAddress;
  await supabase.from("money_settings").upsert({
    id: true,
    home_address: homeAddress,
    set_aside_pct: pct,
    sales_tax_filing: filing,
    ...(addressChanged ? { home_lat: null, home_lng: null } : {}),
    updated_at: new Date().toISOString(),
  });
  // A new home address means the automatic trips need working out again.
  if (addressChanged) await supabase.from("mileage_trips").delete().eq("auto", true);
  revalidatePath("/admin/money");
  revalidatePath("/admin");
  redirect(backFrom(formData));
}

function backFrom(formData: FormData) {
  const back = String(formData.get("back") ?? "/admin/money");
  return back.startsWith("/admin/") ? back : "/admin/money";
}

export async function addTrip(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const miles = Number(String(formData.get("miles") ?? "").replace(/[^\d.]/g, ""));
  if (miles > 0) {
    await supabase.from("mileage_trips").insert({
      trip_date: String(formData.get("tripDate") ?? "") || new Date().toISOString().slice(0, 10),
      miles: Math.round(miles * 10) / 10,
      note: String(formData.get("note") ?? "").trim().slice(0, 200) || "Shopping",
      auto: false,
    });
  }
  revalidatePath("/admin/money");
  redirect(backFrom(formData));
}

export async function updateTripMiles(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const miles = Number(String(formData.get("miles") ?? "").replace(/[^\d.]/g, ""));
  if (Number.isFinite(miles)) {
    await supabase.from("mileage_trips").update({ miles: Math.round(miles * 10) / 10, note: "Round trip (changed by you)" }).eq("id", String(formData.get("id") ?? ""));
  }
  revalidatePath("/admin/money");
  redirect(backFrom(formData));
}

export async function removeTrip(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");
  const { data: trip } = await supabase.from("mileage_trips").select("auto").eq("id", id).single();
  // An automatic trip is kept at 0 miles instead, so it isn't added back.
  if (trip?.auto) await supabase.from("mileage_trips").update({ miles: 0, note: "Didn't drive" }).eq("id", id);
  else await supabase.from("mileage_trips").delete().eq("id", id);
  revalidatePath("/admin/money");
  redirect(backFrom(formData));
}
