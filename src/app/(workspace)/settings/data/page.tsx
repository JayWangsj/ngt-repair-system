import { DataSettings } from "@/components/settings";
import { SettingsPageShell } from "@/components/settings-page-shell";
import { getMessages } from "@/lib/i18n-server";

export default async function DataSettingsPage() {
  const it = await getMessages();
  return (
    <SettingsPageShell
      title={it.dataManagement}
      description={it.dataManagementHelp}
      backLabel={it.backToSettings}
    >
      <DataSettings />
    </SettingsPageShell>
  );
}
