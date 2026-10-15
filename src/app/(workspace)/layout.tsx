import { getMessages } from "@/lib/i18n-server";
import { requireActor } from "@/lib/session";
import { Sidebar } from "@/components/sidebar";
import { BusinessDayProvider } from "@/components/business-date";
import { getBusinessDay } from "@/lib/business-date";
import { BrandLogo } from "@/components/brand-logo";
import { UpdateStartupCheck } from "@/components/update-startup-check";
import { UpdateStateProvider } from "@/components/update-state";
import { getStudioCurrentVersion } from "@/lib/studio-update";
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
  const currentVersion = await getStudioCurrentVersion();
  return (
    <BusinessDayProvider today={today}>
      <UpdateStateProvider initialVersion={currentVersion}>
        <div className="app-shell">
          <Sidebar />
          <main className="main-content">
            <header className="print-brand-header">
              <BrandLogo className="print-brand-logo" />
            </header>
            <UpdateStartupCheck />
            {children}
            <footer className="footer">
              NGT · {it.subtitle} <span>Europe/Rome · EUR</span>
            </footer>
          </main>
        </div>
        {modal}
      </UpdateStateProvider>
    </BusinessDayProvider>
  );
}
