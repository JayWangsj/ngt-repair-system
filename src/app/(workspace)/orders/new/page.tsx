import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { NewOrderForm } from "@/components/forms";
import { PageHeader } from "@/components/common";
import { getMessages } from "@/lib/i18n-server";
export default async function NewOrder() {
  const it = await getMessages();
  const actor = await requireActor();
  const rules = await db.priceRule.findMany({
    where: { enabled: true },
    orderBy: { project: "asc" },
  });
  const [faultOptions, devices, customers] = await Promise.all([
    db.faultOption.findMany({ select: { category: true, name: true } }),
    db.device.findMany({
      select: { category: true, brand: true, model: true },
      distinct: ["category", "brand", "model"],
    }),
    db.customer.findMany({
      select: { name: true, phone: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <>
      <PageHeader title={it.newOrder} description={it.ordersDescription} />
      <NewOrderForm
        faultOptions={faultOptions}
        devices={devices}
        customers={customers}
        owner={actor.role === "OWNER"}
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
