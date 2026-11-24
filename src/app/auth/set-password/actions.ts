"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, homePathForRole } from "@/lib/auth/roles";

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) {
    redirect(`/auth/set-password?error=${encodeURIComponent("Password must be at least 8 characters.")}`);
  }
  if (password !== confirmPassword) {
    redirect(`/auth/set-password?error=${encodeURIComponent("Those passwords don't match.")}`);
  }

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?error=${encodeURIComponent("That link expired — ask for a new invite.")}`);
  }

  // password_set lets the Staff page tell "really joined" apart from "email
  // confirmed by a link checker but never finished".
  const { error } = await supabase.auth.updateUser({ password, data: { password_set: true } });

  if (error) {
    redirect(`/auth/set-password?error=${encodeURIComponent(error.message)}`);
  }

  const currentUser = await getCurrentUser();
  redirect(currentUser ? homePathForRole(currentUser.role) : "/login");
}
