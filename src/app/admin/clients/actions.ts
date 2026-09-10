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
