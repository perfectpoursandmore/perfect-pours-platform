"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Runs only when the staff member taps "Set up my account". This is the
 * step that uses up the one-time code, so link checkers in Outlook, Gmail
 * or iMessage (which open the page but never press buttons) can't spend it.
 */
export async function acceptInvite(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "invite") as EmailOtpType;

  if (tokenHash) {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) redirect("/auth/set-password");
  }

  redirect(
    `/login?error=${encodeURIComponent(
      "That invite link was already used or is too old. Ask Faith to tap Resend invite and use the newest email."
    )}`
  );
}
