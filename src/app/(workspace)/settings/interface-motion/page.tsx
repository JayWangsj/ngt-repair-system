import { MotionSettings } from "@/components/settings";
import { SettingsPageShell } from "@/components/settings-page-shell";
import { getMessages } from "@/lib/i18n-server";

export default async function InterfaceMotionSettingsPage() {
  const it = await getMessages();
  return (
    <SettingsPageShell
      title={it.interfaceMotion}
      description={it.interfaceMotionHelp}
      backLabel={it.backToSettings}
    >
      <MotionSettings />
    </SettingsPageShell>
  );
}
