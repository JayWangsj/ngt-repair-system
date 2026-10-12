import { FaultCatalogSettings } from "@/components/settings";
import { SettingsPageShell } from "@/components/settings-page-shell";
import { db } from "@/lib/db";
import { getMessages } from "@/lib/i18n-server";

export default async function FaultCatalogSettingsPage() {
  const [it, faults] = await Promise.all([
    getMessages(),
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
  ]);
  return (
    <SettingsPageShell
      title={it.faultCatalog}
      description={it.faultCatalogDescription}
      backLabel={it.backToSettings}
    >
      <FaultCatalogSettings
        items={faults.map(({ _count, ...fault }) => ({
          ...fault,
          usageCount: _count.orders,
        }))}
      />
    </SettingsPageShell>
  );
}
