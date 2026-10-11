import { getMessages } from "@/lib/i18n-server";
import { requireActor } from "@/lib/session";
import { Sidebar } from "@/components/sidebar";
import { BusinessDayProvider } from "@/components/business-date";
import { getBusinessDay } from "@/lib/business-date";
import { BrandLogo } from "@/components/brand-logo";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal?: React.ReactNode;
}) {
  await requireActor();
  const it = await getMessages();
  const today = await getBusinessDay();
  return (
    <BusinessDayProvider today={today}>
      <div className="app-shell">
        <Sidebar />
        <main className="main-content">
          <header className="print-brand-header">
            <BrandLogo className="print-brand-logo" />
          </header>
          {children}
          <footer className="footer">
            NGT · {it.subtitle} <span>Europe/Rome · EUR</span>
          </footer>
        </main>
      </div>
      {modal}
    </BusinessDayProvider>
  );
}
