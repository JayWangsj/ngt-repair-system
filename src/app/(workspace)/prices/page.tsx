import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { PriceList } from "@/components/forms";
import { getMessages } from "@/lib/i18n-server";
export default async function Prices() {
  const it = await getMessages();
  const actor = await requireActor();
  if (actor.role !== "OWNER")
    return <p className="message error">{it.restricted}</p>;
  const rules = await db.priceRule.findMany({
    orderBy: [
      { category: "asc" },
      { brand: "asc" },
      { model: "asc" },
      { project: "asc" },
    ],
  });
  const views = rules.map((r) => ({
    ...r,
    suggested: r.suggested.toString(),
    cost: r.cost?.toString(),
  }));
  return <PriceList rules={views} />;
}
