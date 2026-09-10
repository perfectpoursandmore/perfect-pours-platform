"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";

export async function disconnectGoogleCalendar() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");

  const supabase = createClient();
  await supabase
    .from("calendar_connections")
    .update({
      access_token: null,
      refresh_token: null,
      access_token_expires_at: null,
      connected_by: null,
      connected_at: null,
    })
    .eq("id", true);

  revalidatePath("/admin/settings/calendar");
}
