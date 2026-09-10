"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");
}

export async function addEmailTemplate(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();

  await supabase.from("email_templates").insert({
    name: String(formData.get("name") ?? "Untitled template"),
    subject: String(formData.get("subject") ?? ""),
    body: String(formData.get("body") ?? ""),
  });

  revalidatePath("/admin/email-templates");
}

export async function updateEmailTemplate(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));

  await supabase
    .from("email_templates")
    .update({
      name: String(formData.get("name") ?? ""),
      subject: String(formData.get("subject") ?? ""),
      body: String(formData.get("body") ?? ""),
    })
    .eq("id", id);

  revalidatePath("/admin/email-templates");
}

export async function toggleEmailTemplateActive(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";

  await supabase.from("email_templates").update({ active: !active }).eq("id", id);

  revalidatePath("/admin/email-templates");
}
