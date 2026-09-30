import { PageHeader } from "@/components/common";
import { SettingsTools } from "@/components/settings";
import { getMessages } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { getBusinessClock, getBusinessDay } from "@/lib/business-date";

export default async function SettingsPage() {
  const it = await getMessages();
  const [faults, clock, today] = await Promise.all([
    db.faultOption.findMany({
      select: {
        id: true,
        category: true,
        name: true,
        note: true,
        hidden: true,
        sortOrder: true,
        _count: { select: { orders: true } },
      },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    }),
    getBusinessClock(),
    getBusinessDay(),
  ]);
  return (
    <>
      <PageHeader
        title={it.nav.settings}
        description={it.settingsDescription}
      />
      <SettingsTools
        clock={clock}
        today={today}
        faultOptions={faults.map(({ _count, ...fault }) => ({
          ...fault,
          usageCount: _count.orders,
        }))}
      />
    </>
  );
}
