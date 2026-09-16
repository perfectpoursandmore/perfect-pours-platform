import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Where every staff-invite email (and, if ever used, a password-reset
 * email) link lands. Supabase's invite email points here with a token
 * proving who they are; verifying it turns that into a real signed-in
 * session (stored via cookies, same as a normal login), then sends the
 * person on to set their own password.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? "/auth/set-password";

  if (tokenHash && type) {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(
    new URL(
      `/login?error=${encodeURIComponent("That link is invalid or has expired — ask for a new invite.")}`,
      url.origin
    )
  );
}
