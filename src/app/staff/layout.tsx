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
      navItems={[
        { label: "Calendar", href: "/staff" },
        { label: "My shifts", href: "/staff/my-shifts" },
        { label: "My availability", href: "/staff/availability" },
      ]}
    >
      {children}
      <p style={{ color: "var(--color-muted)", fontSize: "0.85rem", marginTop: "2rem" }}>
        Questions about a shift or this schedule? Email{" "}
        <a href="mailto:faith@perfectpoursandmore.com">faith@perfectpoursandmore.com</a>.
      </p>
    </RoleShell>
  );
}
