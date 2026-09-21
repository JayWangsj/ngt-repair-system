import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { NewOrderForm } from "@/components/forms";
import { PageHeader } from "@/components/common";
import { it } from "@/messages/it";
export default async function NewOrder() {
  const actor = await requireActor();
  const rules = await db.priceRule.findMany({
    where: { enabled: true },
    orderBy: { project: "asc" },
  });
  return (
    <>
      <PageHeader title={it.newOrder} description={it.ordersDescription} />
      <NewOrderForm
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
