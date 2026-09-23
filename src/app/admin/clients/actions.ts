"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { sendTemplatedEmail } from "@/lib/email";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");
}

export async function updateClientInfo(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));

  await supabase
    .from("clients")
    .update({
      first_name: String(formData.get("firstName") ?? ""),
      last_name: String(formData.get("lastName") ?? ""),
      email: String(formData.get("email") ?? "") || null,
      phone: String(formData.get("phone") ?? "") || null,
      preferred_contact_method: String(formData.get("preferredContactMethod") ?? "") || null,
    })
    .eq("id", id);

  revalidatePath(`/admin/clients/${id}`);
}

export async function addClientNote(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const clientId = String(formData.get("clientId"));
  const note = String(formData.get("note") ?? "").trim();

  if (!note) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("client_notes").insert({
    client_id: clientId,
    note,
    created_by: user?.id ?? null,
  });

  revalidatePath(`/admin/clients/${clientId}`);
}

/** Ad hoc send from a client's own page — logs to email_log same as any other send. */
export async function sendClientEmail(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const clientId = String(formData.get("clientId"));
  const templateId = String(formData.get("templateId"));

  const { data: client } = await supabase
    .from("clients")
    .select("first_name, last_name, email")
    .eq("id", clientId)
    .single();

  if (!client?.email) {
    redirect(`/admin/clients/${clientId}?error=This client has no email address on file.`);
  }

  const user = await getCurrentUser();
  const result = await sendTemplatedEmail(supabase, {
    templateId,
    to: client!.email,
    clientId,
    sentBy: user?.id ?? null,
    vars: { client_name: `${client!.first_name} ${client!.last_name}` },
  });

  if (!result.ok) {
    redirect(`/admin/clients/${clientId}?error=${encodeURIComponent(result.error ?? "Send failed.")}`);
  }

  revalidatePath(`/admin/clients/${clientId}`);
}

/**
 * Merges one client record into another: every event, note, lead, and email
 * sent to the "merge away" client is moved onto the "keep" client, any
 * contact info the keeper is missing gets filled in from the one being
 * removed, and then the duplicate record is deleted. Irreversible — the
 * confirmation screen in merge/page.tsx is what should call this, never a
 * bare link.
 */
export async function confirmMergeClients(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const keepId = String(formData.get("keepId"));
  const mergeId = String(formData.get("mergeId"));

  if (!keepId || !mergeId || keepId === mergeId) {
    redirect(`/admin/clients/${mergeId}?error=Choose a different client to merge into.`);
  }

  const [{ data: keep }, { data: remove }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", keepId).single(),
    supabase.from("clients").select("*").eq("id", mergeId).single(),
  ]);

  if (!keep || !remove) {
    redirect(`/admin/clients/${mergeId}?error=Couldn't find one of those clients.`);
  }

  // Move everything that pointed at the duplicate over to the keeper.
  await Promise.all([
    supabase.from("events").update({ client_id: keepId }).eq("client_id", mergeId),
    supabase.from("client_notes").update({ client_id: keepId }).eq("client_id", mergeId),
    supabase.from("leads").update({ client_id: keepId }).eq("client_id", mergeId),
    supabase.from("email_log").update({ client_id: keepId }).eq("client_id", mergeId),
  ]);

  // Fill in anything the keeper is missing, from the record being removed —
  // never overwrites a value the keeper already has.
  const patch: Record<string, unknown> = {};
  if (!keep!.email && remove!.email) patch.email = remove!.email;
  if (!keep!.phone && remove!.phone) patch.phone = remove!.phone;
  if (!keep!.preferred_contact_method && remove!.preferred_contact_method)
    patch.preferred_contact_method = remove!.preferred_contact_method;
  if (!keep!.qbo_customer_id && remove!.qbo_customer_id) patch.qbo_customer_id = remove!.qbo_customer_id;
  if (!keep!.user_id && remove!.user_id) patch.user_id = remove!.user_id;

  if (Object.keys(patch).length > 0) {
    await supabase.from("clients").update(patch).eq("id", keepId);
  }

  await supabase.from("client_notes").insert({
    client_id: keepId,
    note: `Merged duplicate client record "${remove!.first_name} ${remove!.last_name}"${
      remove!.email ? ` (${remove!.email})` : ""
    } into this one.`,
  });

  await supabase.from("clients").delete().eq("id", mergeId);

  revalidatePath("/admin/clients");
  redirect(`/admin/clients/${keepId}`);
}

/**
 * Records a credit on this client's account -- e.g. a $200 rain-cancellation
 * credit good until a certain date. Purely a record Faith keeps herself
 * (shown on the client's page); it doesn't auto-apply anywhere.
 */
export async function addClientCredit(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const clientId = String(formData.get("clientId"));
  const amount = Number(formData.get("amount") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim();
  const expiresOn = String(formData.get("expiresOn") ?? "").trim();

  if (!amount || amount <= 0) {
    redirect(`/admin/clients/${clientId}?error=${encodeURIComponent("Enter a credit amount greater than $0.")}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("client_credits").insert({
    client_id: clientId,
    amount,
    reason: reason || null,
    expires_on: expiresOn || null,
    created_by: user?.id ?? null,
  });

  revalidatePath(`/admin/clients/${clientId}`);
}

/** Marks a credit as used -- e.g. applied toward a later booking. */
export async function redeemClientCredit(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const clientId = String(formData.get("clientId"));

  await supabase.from("client_credits").update({ redeemed_at: new Date().toISOString() }).eq("id", id);

  revalidatePath(`/admin/clients/${clientId}`);
}

/** Removes a credit entirely -- e.g. it was entered by mistake. */
export async function removeClientCredit(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const clientId = String(formData.get("clientId"));

  await supabase.from("client_credits").delete().eq("id", id);

  revalidatePath(`/admin/clients/${clientId}`);
}
