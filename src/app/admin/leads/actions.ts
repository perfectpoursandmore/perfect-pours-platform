"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { EVENT_TYPE_LABELS } from "@/lib/labels";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");
}

export async function updateLeadStatus(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();

  const id = String(formData.get("id"));
  const status = String(formData.get("status"));

  await supabase.from("leads").update({ status }).eq("id", id);

  revalidatePath(`/admin/leads/${id}`);
  revalidatePath("/admin/leads");
}

/**
 * Turns a lead into a real client + event record — the moment the PRD
 * describes as "owner updates information inside client/event record" after
 * the consultation. Safe to click more than once: if a client or event is
 * already linked, it reuses them instead of creating duplicates.
 */
export async function convertLeadToClientAndEvent(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();

  const id = String(formData.get("id"));

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (leadError || !lead) redirect("/admin/leads");

  let clientId = lead.client_id as string | null;

  if (!clientId) {
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .insert({
        first_name: lead.first_name,
        last_name: lead.last_name,
        email: lead.email,
        phone: lead.phone,
      })
      .select("id")
      .single();

    if (clientError || !client) {
      redirect(`/admin/leads/${id}?error=Could not create the client record.`);
    }

    clientId = client!.id;
  }

  let eventId = lead.event_id as string | null;

  if (!eventId) {
    const eventTypeLabel = EVENT_TYPE_LABELS[lead.event_type] ?? lead.event_type;

    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        client_id: clientId,
        name: `${lead.last_name} ${eventTypeLabel}`,
        event_type: lead.event_type,
        event_date: lead.event_date,
        address_line: lead.venue_or_address,
        guest_count: lead.guest_count,
        status: "inquiry",
      })
      .select("id")
      .single();

    if (eventError || !event) {
      redirect(`/admin/leads/${id}?error=Could not create the event record.`);
    }

    eventId = event!.id;
  }

  await supabase.from("leads").update({ client_id: clientId, event_id: eventId }).eq("id", id);

  revalidatePath(`/admin/leads/${id}`);
  revalidatePath("/admin/clients");
  revalidatePath("/admin/events");

  redirect(`/admin/events/${eventId}`);
}

/**
 * Deletes a lead that never turned into anything -- a test submission, a
 * duplicate, spam through the public form. Refuses once it's been
 * converted to a client/event record, since at that point it's the paper
 * trail for a real relationship, not junk to clean up.
 */
export async function deleteLead(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();

  const id = String(formData.get("id"));

  const { data: lead } = await supabase.from("leads").select("client_id, event_id").eq("id", id).single();

  if (lead?.client_id || lead?.event_id) {
    redirect(`/admin/leads/${id}?error=This lead has already been converted to a client, so it can't be deleted from here.`);
  }

  await supabase.from("leads").delete().eq("id", id);

  revalidatePath("/admin/leads");
  redirect("/admin/leads");
}

