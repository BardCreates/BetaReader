import type { SidebarData } from "@/lib/sidebar";
import { Sidebar } from "./Sidebar";

/** Page frame: left menu (a drawer on small screens) and the main content area. */
export function AppShell({ email, sidebar, children }: { email: string | null; sidebar: SidebarData; children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar email={email} data={sidebar} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
