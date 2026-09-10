import { redirect } from "next/navigation";
import { getCurrentUser, homePathForRole } from "@/lib/auth/roles";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (user) {
    redirect(homePathForRole(user.role));
  }

  redirect("/login");
}
