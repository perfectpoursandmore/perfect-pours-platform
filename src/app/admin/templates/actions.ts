"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");
}

export async function addContractTemplate(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();

  await supabase.from("contract_templates").insert({
    name: String(formData.get("name") ?? "Untitled template"),
    body: String(formData.get("body") ?? ""),
  });

  revalidatePath("/admin/templates");
}

export async function updateContractTemplate(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));

  await supabase
    .from("contract_templates")
    .update({
      name: String(formData.get("name") ?? ""),
      body: String(formData.get("body") ?? ""),
    })
    .eq("id", id);

  revalidatePath("/admin/templates");
}

export async function toggleContractTemplateActive(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";

  await supabase.from("contract_templates").update({ active: !active }).eq("id", id);

  revalidatePath("/admin/templates");
}
