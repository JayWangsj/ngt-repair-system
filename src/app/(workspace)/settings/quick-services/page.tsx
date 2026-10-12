import { QuickServiceSettings } from "@/components/settings";
import { SettingsPageShell } from "@/components/settings-page-shell";
import { db } from "@/lib/db";
import { cents } from "@/lib/domain";
import { getMessages } from "@/lib/i18n-server";

export default async function QuickServiceSettingsPage() {
  const [it, quickServices] = await Promise.all([
    getMessages(),
    db.quickService.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <SettingsPageShell
      title={it.quickService.title}
      description={it.quickService.description}
      backLabel={it.backToSettings}
    >
      <QuickServiceSettings
        items={quickServices.map((service) => ({
          ...service,
          defaultPrice: cents(service.defaultPrice),
          createdAt: undefined,
          updatedAt: undefined,
        }))}
      />
    </SettingsPageShell>
  );
}
