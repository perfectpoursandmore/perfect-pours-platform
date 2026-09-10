import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/roles";
import { RoleShell } from "@/components/RoleShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  // Belt-and-suspenders: middleware already redirects non-admins away from
  // /admin, but every server-rendered area re-checks the role directly
  // against `profiles` so nothing here ever depends on the URL alone.
  if (!user || user.role !== "admin") {
    redirect("/login");
  }

  return (
    <RoleShell
      areaLabel="Admin"
      userName={user.fullName}
      navItems={[
        { label: "Dashboard", href: "/admin" },
        { label: "Leads", href: "/admin/leads" },
        { label: "Clients", href: "/admin/clients" },
        { label: "Events", href: "/admin/events" },
        { label: "Staff", href: "/admin/staff" },
        { label: "Payouts", href: "/admin/payouts" },
        { label: "Catalog", href: "/admin/catalog" },
        { label: "Templates", href: "/admin/templates" },
        { label: "Email Templates", href: "/admin/email-templates" },
        { label: "Calendar", href: "/admin/calendar" },
        { label: "Settings", href: "/admin/settings" },
      ]}
    >
      {children}
    </RoleShell>
  );
}
