import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";

// TEMPORARY diagnostic route -- admin-only. Delete once the Google
// Calendar refresh-token issue is resolved.
//
// Forces an actual refresh_token grant against Google right now,
// bypassing the "is the cached access token still valid" shortcut, so we
// can tell immediately after a reconnect whether a refresh will ever
// succeed -- instead of waiting up to an hour for the cached token to
// expire naturally.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data: connection, error: connError } = await supabase
    .from("calendar_connections")
    .select("refresh_token, access_token_expires_at, connected_at")
    .eq("id", true)
    .single();

  if (connError || !connection?.refresh_token) {
    return NextResponse.json({
      step: "read_connection",
      result: "no refresh_token on file",
      connError: connError?.message ?? null,
    });
  }

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: connection.refresh_token,
      client_id: clientId ?? "",
      client_secret: clientSecret ?? "",
      grant_type: "refresh_token",
    }),
  });

  const bodyText = await res.text();

  return NextResponse.json({
    step: "force_refresh",
    ok: res.ok,
    status: res.status,
    googleResponse: bodyText,
    clientIdPresent: Boolean(clientId),
    clientIdFp: clientId ? `${clientId.slice(0, 8)}...${clientId.slice(-12)}` : null,
    clientSecretPresent: Boolean(clientSecret),
    redirectUriPresent: Boolean(redirectUri),
    redirectUriValue: redirectUri ?? null,
    connectedAt: connection.connected_at,
    accessTokenExpiresAt: connection.access_token_expires_at,
    now: new Date().toISOString(),
  });
}
