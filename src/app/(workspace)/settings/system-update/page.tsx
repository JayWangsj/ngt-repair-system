import { SettingsPageShell } from "@/components/settings-page-shell";
import { SystemUpdate } from "@/components/system-update";
import { getMessages } from "@/lib/i18n-server";
import { appVersion } from "@/lib/version";

export default async function SystemUpdatePage() {
  const it = await getMessages();
  return (
    <SettingsPageShell
      title={it.systemUpdate}
      description={it.systemUpdateHelp}
      backLabel={it.backToSettings}
    >
      <SystemUpdate currentVersion={appVersion} />
    </SettingsPageShell>
  );
}
