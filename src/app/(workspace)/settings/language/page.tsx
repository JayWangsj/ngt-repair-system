import { LanguageSettings } from "@/components/settings";
import { SettingsPageShell } from "@/components/settings-page-shell";
import { getMessages } from "@/lib/i18n-server";

export default async function LanguageSettingsPage() {
  const it = await getMessages();
  return (
    <SettingsPageShell
      title={it.language}
      description={it.languageSettingsHelp}
      backLabel={it.backToSettings}
    >
      <LanguageSettings />
    </SettingsPageShell>
  );
}
