import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens } from "@/lib/quickbooks";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const url = new URL(request.url);
  const settingsUrl = new URL("/admin/settings/quickbooks", url.origin);

  if (!user || user.role !== "admin") {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const expectedState = request.headers
    .get("cookie")
    ?.split("; ")
    .find((c) => c.startsWith("qbo_oauth_state="))
    ?.split("=")[1];

  if (!code || !state || !expectedState || state !== expectedState) {
    settingsUrl.searchParams.set("error", "Could not verify the request. Please try connecting again.");
    return NextResponse.redirect(settingsUrl);
  }

  if (!realmId) {
    settingsUrl.searchParams.set(
      "error",
      "QuickBooks didn't tell us which company to connect — please try again."
    );
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const supabase = createClient();
    const { error } = await supabase
      .from("qbo_connections")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        access_token_expires_at: expiresAt,
        realm_id: realmId,
        environment: process.env.QUICKBOOKS_ENVIRONMENT === "production" ? "production" : "sandbox",
        connected_by: user.id,
        connected_at: new Date().toISOString(),
      })
      .eq("id", true);

    if (error) throw error;

    settingsUrl.searchParams.set("connected", "1");
  } catch (err) {
    settingsUrl.searchParams.set(
      "error",
      err instanceof Error ? err.message : "Something went wrong connecting QuickBooks."
    );
  }

  const response = NextResponse.redirect(settingsUrl);
  response.cookies.delete("qbo_oauth_state");
  return response;
}
