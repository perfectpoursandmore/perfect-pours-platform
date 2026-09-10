"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");
}

export async function addCatalogItem(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();

  await supabase.from("catalog_items").insert({
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? "") || null,
    description: String(formData.get("description") ?? "") || null,
    default_price: formData.get("defaultPrice") ? Number(formData.get("defaultPrice")) : null,
    pricing_type: String(formData.get("pricingType") ?? "flat"),
    internal_notes: String(formData.get("internalNotes") ?? "") || null,
  });

  revalidatePath("/admin/catalog");
}

export async function toggleCatalogItemActive(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";

  await supabase.from("catalog_items").update({ active: !active }).eq("id", id);

  revalidatePath("/admin/catalog");
}
