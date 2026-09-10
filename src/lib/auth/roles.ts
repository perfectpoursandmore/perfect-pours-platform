import { createClient } from "@/lib/supabase/server";

export type UserRole = "admin" | "staff" | "client";

export type CurrentUser = {
  id: string;
  role: UserRole;
  fullName: string | null;
};

/**
 * Reads the logged-in user's role from `profiles` (never from anything the
 * client could have sent) so every server component/page can make its own
 * access decision on top of what RLS already enforces at the database.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: user.id,
    role: profile.role as UserRole,
    fullName: profile.full_name,
  };
}

export function homePathForRole(role: UserRole): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "staff":
      return "/staff";
    case "client":
      return "/portal";
  }
}
