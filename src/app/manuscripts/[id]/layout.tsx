import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { getSidebar } from "@/lib/sidebar";

export default async function ManuscriptLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sidebar = await getSidebar(user.id, id);
  if (!sidebar) notFound();
  return (
    <AppShell email={user.email} sidebar={sidebar}>
      {children}
    </AppShell>
  );
}
