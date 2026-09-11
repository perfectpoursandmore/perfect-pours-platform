import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Supabase client for use in Server Components, Server Actions, and Route
// Handlers. Reads/writes the auth session via cookies so the user's login
// (and therefore their role, enforced by RLS) travels with every request.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component during render, which can't set
            // cookies — middleware.ts is what actually persists a refreshed
            // session. Safe to ignore here.
          }
        },
      },
    }
  );
}
