import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Runs on every request. Two jobs:
//   1. Keep the Supabase session cookie fresh (required by @supabase/ssr).
//   2. Gate /admin, /staff, /portal by role — this is a convenience redirect
//      for a good UX, NOT the security boundary. The real boundary is the
//      Row Level Security policies in supabase/migrations, which block the
//      data itself no matter what URL is hit.
const ROLE_PREFIXES: Record<string, "admin" | "staff" | "client"> = {
  "/admin": "admin",
  "/staff": "staff",
  "/portal": "client",
};

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not add logic between createServerClient and this call —
  // it's what actually refreshes the session token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const matchedPrefix = Object.keys(ROLE_PREFIXES).find((prefix) =>
    path.startsWith(prefix)
  );

  if (matchedPrefix) {
    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", path);
      return NextResponse.redirect(loginUrl);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const requiredRole = ROLE_PREFIXES[matchedPrefix];
    if (profile?.role !== requiredRole) {
      // Logged in, but not the right role for this area — send them home
      // rather than showing an error page.
      const home =
        profile?.role === "admin"
          ? "/admin"
          : profile?.role === "staff"
          ? "/staff"
          : "/portal";
      return NextResponse.redirect(new URL(home, request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/admin/:path*", "/staff/:path*", "/portal/:path*"],
};
