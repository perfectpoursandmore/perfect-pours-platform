"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";

/** New secret key -- the old one stops working, so the Shortcut needs the new one pasted in. */
export async function resetInboxToken() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");
  const supabase = createClient();
  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
  await supabase.from("inbox_settings").upsert({ id: true, token });
  revalidatePath("/admin/settings/text-inbox");
}
