import { PageHeader } from "@/components/common";
import { SettingsTools } from "@/components/settings";
import { getMessages } from "@/lib/i18n-server";

export default async function SettingsPage() {
  const it = await getMessages();
  return (
    <>
      <PageHeader
        title={it.nav.settings}
        description={it.settingsDescription}
      />
      <SettingsTools />
    </>
  );
}
