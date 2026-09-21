import { requireActor } from "@/lib/session";
import { Sidebar } from "@/components/sidebar";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireActor();
  return (
    <div className="app-shell">
      <Sidebar name={actor.name} role={actor.role} />
      <main className="main-content">
        {children}
        <footer className="footer">
          NGT · Laboratorio riparazioni <span>Europe/Rome · EUR</span>
        </footer>
      </main>
    </div>
  );
}
