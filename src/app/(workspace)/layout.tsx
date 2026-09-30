import { getMessages } from "@/lib/i18n-server";
import { requireActor } from "@/lib/session";
import { Sidebar } from "@/components/sidebar";
import { BusinessDayProvider } from "@/components/business-date";
import { getBusinessDay } from "@/lib/business-date";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireActor();
  const it = await getMessages();
  const today = await getBusinessDay();
  return (
    <BusinessDayProvider today={today}>
      <div className="app-shell">
        <Sidebar />
        <main className="main-content">
          {children}
          <footer className="footer">
            NGT · {it.subtitle} <span>Europe/Rome · EUR</span>
          </footer>
        </main>
      </div>
    </BusinessDayProvider>
  );
}
