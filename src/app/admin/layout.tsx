import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { RoleShell } from "@/components/RoleShell";
import { GlobalSearch } from "@/components/GlobalSearch";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  // Belt-and-suspenders: middleware already redirects non-admins away from
  // /admin, but every server-rendered area re-checks the role directly
  // against `profiles` so nothing here ever depends on the URL alone.
  if (!user || user.role !== "admin") {
    redirect("/login");
  }

  // Surfaced everywhere in the admin area (not just the QuickBooks settings
  // page) so a broken connection doesn't go unnoticed for days — it means
  // invoices have quietly stopped going out.
  const supabase = createClient();
  const { data: qbo } = await supabase
    .from("qbo_connections")
    .select("needs_reconnect")
    .eq("id", true)
    .single();
  const qboNeedsReconnect = Boolean(qbo?.needs_reconnect);

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
        { label: "Availability", href: "/admin/staff/availability" },
        { label: "Payouts", href: "/admin/payouts" },
        { label: "Catalog", href: "/admin/catalog" },
        { label: "Templates", href: "/admin/templates" },
        { label: "Email Templates", href: "/admin/email-templates" },
        { label: "Calendar", href: "/admin/calendar" },
        { label: "Settings", href: "/admin/settings" },
      ]}
    >
      <GlobalSearch />
      {qboNeedsReconnect && (
        <a
          href="/admin/settings/quickbooks"
          style={{
            display: "block",
            marginBottom: "1.5rem",
            padding: "0.75rem 1rem",
            borderRadius: 8,
            background: "#fdf1f1",
            border: "1px solid #e3b6b6",
            color: "#a33",
            fontSize: "0.9rem",
            textDecoration: "none",
          }}
        >
          ⚠ QuickBooks needs to be reconnected — invoices can&apos;t send until you do. Click here to reconnect.
        </a>
      )}
      {children}
    </RoleShell>
  );
}
