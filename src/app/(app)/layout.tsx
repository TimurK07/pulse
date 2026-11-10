import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell
      user={{ id: user.id, name: user.name, title: user.title, role: user.role, department: user.department?.name ?? null }}
    >
      {children}
    </AppShell>
  );
}
