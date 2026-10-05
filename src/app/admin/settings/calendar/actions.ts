"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { syncAllEventsToGoogle } from "@/lib/google-event-sync";

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

/** "Sync all events now" -- pushes every upcoming event to Google Calendar. */
export async function syncAllEventsNow() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");

  const result = await syncAllEventsToGoogle();
  revalidatePath("/admin/settings/calendar");

  if (!result.connected) {
    redirect("/admin/settings/calendar?error=" + encodeURIComponent("Connect Google Calendar first, then try syncing again."));
  }
  if (result.failed > 0) {
    redirect(
      "/admin/settings/calendar?error=" +
        encodeURIComponent(
          `Synced ${result.synced} event(s), but ${result.failed} failed. First error: ${result.firstError ?? "unknown"}`
        )
    );
  }
  redirect("/admin/settings/calendar?synced=" + result.synced);
}
