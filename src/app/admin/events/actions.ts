"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { isEmailConfigured, sendTemplatedEmail } from "@/lib/email";
import { formatDate } from "@/lib/labels";

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
      serveware_type: nullIfEmpty(formData.get("servewareType")),
      staff_instructions: nullIfEmpty(formData.get("staffInstructions")),
    })
    .eq("id", id);

  revalidatePath(`/admin/events/${id}`);
  revalidatePath("/admin/events");
}

/** Points this event at a different, already-existing client. */
export async function reassignEventClient(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));
  const clientId = String(formData.get("clientId") ?? "");

  if (!clientId) return;

  await supabase.from("events").update({ client_id: clientId }).eq("id", eventId);

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin/events");
  revalidatePath("/admin/clients");
}

/**
 * For when an event is attached to the wrong person entirely — e.g. two
 * different real clients both got entered under the same first name and
 * ended up sharing one record. Creates a brand-new client and moves just
 * this one event onto it, leaving every other event on the old client alone.
 */
export async function createClientAndAssignToEvent(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();

  if (!firstName) {
    redirect(`/admin/events/${eventId}?error=First name is required.`);
  }

  const { data: newClient, error } = await supabase
    .from("clients")
    .insert({
      first_name: firstName,
      last_name: lastName,
      email: nullIfEmpty(formData.get("email")),
      phone: nullIfEmpty(formData.get("phone")),
    })
    .select("id")
    .single();

  if (error || !newClient) {
    redirect(`/admin/events/${eventId}?error=Couldn't create that client.`);
  }

  await supabase.from("events").update({ client_id: newClient!.id }).eq("id", eventId);

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin/events");
  revalidatePath("/admin/clients");
}

/**
 * Adds a booking that never went through the public consultation form at
 * all — a returning client who texted or called Faith directly. Either
 * picks an existing client or creates a new one inline, then creates the
 * event straight into whatever status Faith picks (usually "Booked" for a
 * client who's already confirmed), so it shows up on the staff calendar
 * immediately without needing a lead or a deposit invoice first.
 */
export async function createEventDirect(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();

  let clientId = String(formData.get("clientId") ?? "");
  const newFirstName = String(formData.get("newFirstName") ?? "").trim();

  if (!clientId) {
    if (!newFirstName) {
      redirect("/admin/events/new?error=Pick an existing client, or enter a first name for a new one.");
    }

    const { data: newClient, error: clientError } = await supabase
      .from("clients")
      .insert({
        first_name: newFirstName,
        last_name: String(formData.get("newLastName") ?? "").trim(),
        email: nullIfEmpty(formData.get("newEmail")),
        phone: nullIfEmpty(formData.get("newPhone")),
      })
      .select("id")
      .single();

    if (clientError || !newClient) {
      redirect("/admin/events/new?error=Couldn't create that client.");
    }

    clientId = newClient!.id;
  }

  const name = String(formData.get("name") ?? "").trim();
  const eventDate = String(formData.get("eventDate") ?? "");

  if (!name || !eventDate) {
    redirect("/admin/events/new?error=Event name and date are required.");
  }

  const guestCountRaw = formData.get("guestCount");
  const guestCount = guestCountRaw ? Number(guestCountRaw) : null;

  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      client_id: clientId,
      name,
      event_type: String(formData.get("eventType") ?? "").trim() || "Other",
      event_date: eventDate,
      status: String(formData.get("status") ?? "booked"),
      venue_name: nullIfEmpty(formData.get("venueName")),
      address_line: nullIfEmpty(formData.get("addressLine")),
      city: nullIfEmpty(formData.get("city")),
      state: nullIfEmpty(formData.get("state")),
      zip: nullIfEmpty(formData.get("zip")),
      guest_count: guestCount,
    })
    .select("id")
    .single();

  if (eventError || !event) {
    redirect("/admin/events/new?error=Couldn't create that event.");
  }

  revalidatePath("/admin/events");
  revalidatePath("/admin/clients");
  revalidatePath("/staff");

  redirect(`/admin/events/${event!.id}`);
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

/**
 * Asks one or more staff whether they're free for this event — an email
 * with a Yes/No link, NOT an assignment. This is deliberately separate from
 * assignStaffToEvent below: Faith often asks several people about the same
 * day (two events at once, or deciding by who lives closest to the venue)
 * and wants to see who says yes before she picks. Re-asking someone resets
 * their answer back to pending, in case plans changed.
 */
export async function requestStaffAvailability(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));
  const staffIds = formData.getAll("staffIds").map(String).filter(Boolean);

  if (staffIds.length === 0) {
    revalidatePath(`/admin/events/${eventId}/staff`);
    return;
  }

  const { data: event } = await supabase
    .from("events")
    .select("name, event_date, venue_name, address_line, city, state")
    .eq("id", eventId)
    .single();

  const { data: staffRows } = await supabase
    .from("staff")
    .select("id, first_name, staff_details(email)")
    .in("id", staffIds);

  const location = event
    ? [event.venue_name, event.address_line, event.city, event.state].filter(Boolean).join(", ")
    : "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  let templateId: string | null = null;
  if (isEmailConfigured()) {
    const { data: template } = await supabase
      .from("email_templates")
      .select("id")
      .eq("active", true)
      .ilike("name", "%availability%")
      .limit(1)
      .single();
    templateId = template?.id ?? null;
  }

  for (const staffId of staffIds) {
    await supabase.from("event_staff_invites").upsert(
      { event_id: eventId, staff_id: staffId, status: "pending", responded_at: null },
      { onConflict: "event_id,staff_id" }
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
      eventId,
      vars: {
        staff_first_name: staffRow?.first_name ?? "there",
        event_name: event?.name ?? "an event",
        event_date: event?.event_date ? formatDate(event.event_date) : "",
        event_location: location || "TBD",
        availability_link: `${appUrl}/staff/availability`,
      },
    });
  }

  revalidatePath(`/admin/events/${eventId}/staff`);
}

/** Cancels an availability ask — e.g. she meant to ask someone else. */
export async function withdrawAvailabilityRequest(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const eventId = String(formData.get("eventId"));

  await supabase.from("event_staff_invites").delete().eq("id", id);

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
