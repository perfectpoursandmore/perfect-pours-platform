import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/roles";
import { RoleShell } from "@/components/RoleShell";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user || user.role !== "staff") {
    redirect("/login");
  }

  return (
    <RoleShell
      areaLabel="Staff"
      userName={user.fullName}
      navItems={[{ label: "My schedule", href: "/staff" }]}
    >
      {children}
    </RoleShell>
  );
}
