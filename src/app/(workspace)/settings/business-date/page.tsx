import { BusinessDateSettings } from "@/components/settings";
import { SettingsPageShell } from "@/components/settings-page-shell";
import { getBusinessClock, getBusinessDay } from "@/lib/business-date";
import { getMessages } from "@/lib/i18n-server";

export default async function BusinessDateSettingsPage() {
  const [it, clock, today] = await Promise.all([
    getMessages(),
    getBusinessClock(),
    getBusinessDay(),
  ]);
  return (
    <SettingsPageShell
      title={it.businessDate}
      description={it.businessDateHelp}
      backLabel={it.backToSettings}
    >
      <BusinessDateSettings clock={clock} today={today} />
    </SettingsPageShell>
  );
}
