import { NextResponse } from "next/server";

/**
 * Older invite links pointed here and signed the person in as soon as the
 * link was opened, which let Outlook's link scanner use the link up first.
 * Now this just forwards to /auth/accept, where the person taps a button to
 * finish, so opening (or pre-checking) a link never spends it.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const dest = new URL("/auth/accept", url.origin);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (tokenHash) dest.searchParams.set("token_hash", tokenHash);
  if (type) dest.searchParams.set("type", type);
  return NextResponse.redirect(dest);
}
