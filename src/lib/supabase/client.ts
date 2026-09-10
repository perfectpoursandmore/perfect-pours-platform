"use client";

// Supabase client for use in the browser (Client Components).
// Talks to Supabase using the public anon key — safe to expose, because
// every table is locked down with Row Level Security (see supabase/migrations).

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
