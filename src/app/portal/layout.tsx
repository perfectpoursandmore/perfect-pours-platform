import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/roles";
import { RoleShell } from "@/components/RoleShell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user || user.role !== "client") {
    redirect("/login");
  }

  return (
    <RoleShell
      areaLabel="Your event"
      userName={user.fullName}
      navItems={[{ label: "Overview", href: "/portal" }]}
    >
      {children}
    </RoleShell>
  );
}
