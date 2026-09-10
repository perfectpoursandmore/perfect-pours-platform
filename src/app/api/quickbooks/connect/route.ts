import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { getQboAuthUrl } from "@/lib/quickbooks";

// Starts the one-time "connect your QuickBooks company" flow. Admin-only —
// this is the login that owns the QuickBooks company being connected.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(getQboAuthUrl(state));

  // Verified on callback to guard against CSRF; short-lived, admin-only flow.
  response.cookies.set("qbo_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

  return response;
}
