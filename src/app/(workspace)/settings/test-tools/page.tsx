import { notFound } from "next/navigation";
import { SettingsPageShell } from "@/components/settings-page-shell";
import { TestTools } from "@/components/test-tools";
import { getMessages } from "@/lib/i18n-server";
import { isTestToolsEnabled } from "@/lib/test-tools-guard";

export default async function TestToolsSettingsPage() {
  if (!isTestToolsEnabled()) notFound();
  const it = await getMessages();
  return (
    <SettingsPageShell
      title={it.testTools}
      description={it.testToolsHelp}
      backLabel={it.backToSettings}
    >
      <TestTools />
    </SettingsPageShell>
  );
}
