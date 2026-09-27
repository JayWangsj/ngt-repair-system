import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { NewOrderWizard } from "@/components/new-order-form";
import { PageHeader } from "@/components/common";
import { getMessages } from "@/lib/i18n-server";
export default async function NewOrder() {
  const it = await getMessages();
  await requireActor();
  const rules = await db.priceRule.findMany({
    where: { enabled: true },
    orderBy: { project: "asc" },
  });
  const [faultOptions, devices, customers] = await Promise.all([
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
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    db.device.findMany({
      where: { deletedAt: null, customer: { deletedAt: null } },
      select: { category: true, brand: true, model: true },
      distinct: ["category", "brand", "model"],
    }),
    db.customer.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        phones: { select: { phone: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <>
      <PageHeader title={it.newOrder} description={it.ordersDescription} />
      <NewOrderWizard
        faultOptions={faultOptions.map(({ _count, ...fault }) => ({
          ...fault,
          usageCount: _count.orders,
        }))}
        devices={devices}
        customers={customers}
        rules={rules.map((r) => ({
          ...r,
          suggested: r.suggested.toString(),
          cost: undefined,
          updatedAt: undefined,
        }))}
      />
    </>
  );
}
