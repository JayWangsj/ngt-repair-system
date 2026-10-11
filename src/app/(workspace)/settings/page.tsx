import { PageHeader } from "@/components/common";
import { SettingsTools } from "@/components/settings";
import { getMessages } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { getBusinessClock, getBusinessDay } from "@/lib/business-date";
import { appVersion } from "@/lib/version";
import { isTestToolsEnabled } from "@/lib/test-tools-guard";

export default async function SettingsPage() {
  const it = await getMessages();
  const [faults, clock, today, quickServices, devices, rules, compatibilities] =
    await Promise.all([
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
      db.quickService.findMany({ orderBy: { name: "asc" } }),
      db.device.findMany({
        select: { category: true, brand: true, model: true },
        distinct: ["category", "brand", "model"],
      }),
      db.priceRule.findMany({
        where: { brand: { not: "" }, model: { not: "" } },
        select: { category: true, brand: true, model: true },
        distinct: ["category", "brand", "model"],
      }),
      db.productCompatibility.findMany({
        select: { category: true, brand: true, model: true },
        distinct: ["category", "brand", "model"],
      }),
    ]);
  const savedModels = [
    ...new Map(
      [...devices, ...rules, ...compatibilities].map((item) => [
        [item.category, item.brand, item.model]
          .map((value) => value.toLocaleLowerCase("it"))
          .join("\u0000"),
        item,
      ]),
    ).values(),
  ].sort((a, b) =>
    `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`, undefined, {
      numeric: true,
    }),
  );
  return (
    <>
      <PageHeader
        title={it.nav.settings}
        description={it.settingsDescription}
      />
      <SettingsTools
        testToolsEnabled={isTestToolsEnabled()}
        currentVersion={appVersion}
        clock={clock}
        today={today}
        faultOptions={faults.map(({ _count, ...fault }) => ({
          ...fault,
          usageCount: _count.orders,
        }))}
        quickServices={quickServices.map((service) => ({
          ...service,
          defaultPrice: Number(service.defaultPrice) * 100,
          createdAt: undefined,
          updatedAt: undefined,
        }))}
        savedModels={savedModels}
      />
    </>
  );
}
