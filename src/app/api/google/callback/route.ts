import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens } from "@/lib/google-calendar";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const url = new URL(request.url);
  const settingsUrl = new URL("/admin/settings/calendar", url.origin);

  if (!user || user.role !== "admin") {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.headers
    .get("cookie")
    ?.split("; ")
    .find((c) => c.startsWith("google_oauth_state="))
    ?.split("=")[1];

  if (!code || !state || !expectedState || state !== expectedState) {
    settingsUrl.searchParams.set("error", "Could not verify the request. Please try connecting again.");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const supabase = createClient();
    const { error } = await supabase
      .from("calendar_connections")
      .update({
        access_token: tokens.access_token,
        // Google only returns a refresh_token on first consent (or when we
        // force prompt=consent, which getGoogleAuthUrl always does) — safe
        // to overwrite every time here.
        ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
        access_token_expires_at: expiresAt,
        connected_by: user.id,
        connected_at: new Date().toISOString(),
      })
      .eq("id", true);

    if (error) throw error;

    settingsUrl.searchParams.set("connected", "1");
  } catch (err) {
    settingsUrl.searchParams.set(
      "error",
      err instanceof Error ? err.message : "Something went wrong connecting Google Calendar."
    );
  }

  const response = NextResponse.redirect(settingsUrl);
  response.cookies.delete("google_oauth_state");
  return response;
}
