import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses Row Level Security entirely —
 * use this ONLY from trusted server code that isn't running on behalf of a
 * logged-in user, such as the public consultation-booking routes (a
 * prospective client isn't authenticated, so RLS would otherwise block the
 * read/write outright). Never import this into a Client Component, and
 * never let SUPABASE_SERVICE_ROLE_KEY reach the browser.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
