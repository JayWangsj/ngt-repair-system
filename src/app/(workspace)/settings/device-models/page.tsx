import { DeviceModelSettings } from "@/components/settings";
import { SettingsPageShell } from "@/components/settings-page-shell";
import { db } from "@/lib/db";
import { getMessages } from "@/lib/i18n-server";

export default async function DeviceModelSettingsPage() {
  const [it, devices, rules, compatibilities] = await Promise.all([
    getMessages(),
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
    <SettingsPageShell
      title={it.modelCatalog.title}
      description={it.modelCatalog.description}
      backLabel={it.backToSettings}
    >
      <DeviceModelSettings items={savedModels} />
    </SettingsPageShell>
  );
}
