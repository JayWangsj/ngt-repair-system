import { BackButton, PageHeader } from "@/components/common";
import { SystemUpdate } from "@/components/system-update";
import { getMessages } from "@/lib/i18n-server";
import { appVersion } from "@/lib/version";

export default async function SystemUpdatePage() {
  const it = await getMessages();
  return (
    <>
      <BackButton href="/settings" label={it.backToSettings} />
      <PageHeader title={it.systemUpdate} description={it.systemUpdateHelp} />
      <SystemUpdate currentVersion={appVersion} />
    </>
  );
}
