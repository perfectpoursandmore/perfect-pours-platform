"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");
}

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
}

export async function updateEventOverview(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));

  const guestCountRaw = formData.get("guestCount");
  const guestCount = guestCountRaw ? Number(guestCountRaw) : null;

  await supabase
    .from("events")
    .update({
      name: String(formData.get("name") ?? ""),
      event_type: String(formData.get("eventType") ?? ""),
      event_date: String(formData.get("eventDate") ?? ""),
      status: String(formData.get("status") ?? "inquiry"),
      venue_name: nullIfEmpty(formData.get("venueName")),
      address_line: nullIfEmpty(formData.get("addressLine")),
      city: nullIfEmpty(formData.get("city")),
      state: nullIfEmpty(formData.get("state")),
      zip: nullIfEmpty(formData.get("zip")),
      guest_count: guestCount,
      indoor_outdoor: nullIfEmpty(formData.get("indoorOutdoor")),
      dress_code: nullIfEmpty(formData.get("dressCode")),
      parking_instructions: nullIfEmpty(formData.get("parkingInstructions")),
      venue_instructions: nullIfEmpty(formData.get("venueInstructions")),
      staff_instructions: nullIfEmpty(formData.get("staffInstructions")),
    })
    .eq("id", id);

  revalidatePath(`/admin/events/${id}`);
  revalidatePath("/admin/events");
}

export async function addEventNote(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("event_notes").insert({ event_id: eventId, note, created_by: user?.id ?? null });

  revalidatePath(`/admin/events/${eventId}/notes`);
}

export async function assignStaffToEvent(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));
  const staffId = String(formData.get("staffId") ?? "");
  const role = String(formData.get("role") ?? "").trim();
  const isOpen = staffId === ""; // "Open position" chosen instead of a staff member

  if (!role) return;

  await supabase.from("event_staff").insert({
    event_id: eventId,
    staff_id: isOpen ? null : staffId,
    role,
    is_open: isOpen,
  });

  revalidatePath(`/admin/events/${eventId}/staff`);
}

export async function removeEventStaffAssignment(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const eventId = String(formData.get("eventId"));

  await supabase.from("event_staff").delete().eq("id", id);

  revalidatePath(`/admin/events/${eventId}/staff`);
}

/**
 * Saves hours/rate/payout status for one assignment. Used both from an
 * event's Staff tab (right after the event, while hours are fresh) and from
 * the standalone Payouts page (a rollup across every event, for "who do I
 * owe this week"). event_staff_payouts is admin-only at the database level
 * (see migration 0002) regardless of which screen writes to it.
 */
export async function upsertEventStaffPayout(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventStaffId = String(formData.get("eventStaffId"));
  const eventId = formData.get("eventId") ? String(formData.get("eventId")) : null;
  const hoursRaw = formData.get("hours");
  const payRateRaw = formData.get("payRate");
  const payoutStatus = String(formData.get("payoutStatus") ?? "unpaid");
  const paidAtRaw = String(formData.get("paidAt") ?? "").trim();
  const paymentMethod = nullIfEmpty(formData.get("paymentMethod"));
  const paymentNote = nullIfEmpty(formData.get("paymentNote"));

  await supabase.from("event_staff_payouts").upsert(
    {
      event_staff_id: eventStaffId,
      hours: hoursRaw ? Number(hoursRaw) : null,
      pay_rate: payRateRaw ? Number(payRateRaw) : null,
      payout_status: payoutStatus,
      paid_at: payoutStatus === "paid" ? paidAtRaw || new Date().toISOString().slice(0, 10) : null,
      payment_method: paymentMethod,
      payment_note: paymentNote,
    },
    { onConflict: "event_staff_id" }
  );

  if (eventId) revalidatePath(`/admin/events/${eventId}/staff`);
  revalidatePath("/admin/payouts");
}
