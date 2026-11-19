import type { SupabaseClient } from "@supabase/supabase-js";

export type AppPreferences = { morning_email: boolean; clear_done_overnight: boolean; ready: boolean };

/**
 * Faith's on/off switches (migration 0027). Before that table exists the
 * defaults apply (both on, which is what she asked for) and `ready` is
 * false, so the Today screen can show the one-time setup box.
 */
export async function getPreferences(supabase: SupabaseClient): Promise<AppPreferences> {
  const { data, error } = await supabase.from("app_preferences").select("morning_email, clear_done_overnight").eq("id", true).maybeSingle();
  if (error || !data) return { morning_email: true, clear_done_overnight: true, ready: false };
  return { morning_email: data.morning_email, clear_done_overnight: data.clear_done_overnight, ready: true };
}
