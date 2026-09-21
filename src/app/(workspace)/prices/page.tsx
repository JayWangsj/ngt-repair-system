import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { PageHeader } from "@/components/common";
import { RuleForm, PriceList } from "@/components/forms";
import { getMessages } from "@/lib/i18n-server";
export default async function Prices() {
  const it = await getMessages();
  const actor = await requireActor();
  if (actor.role !== "OWNER")
    return <p className="message error">{it.restricted}</p>;
  const rules = await db.priceRule.findMany({
    orderBy: [{ project: "asc" }, { brand: "asc" }],
  });
  const views = rules.map((r) => ({
    ...r,
    suggested: r.suggested.toString(),
    cost: r.cost?.toString(),
  }));
  return (
    <>
      <PageHeader title={it.nav.prices} description={it.priceDescription} />
      <details className="panel padded">
        <summary>{it.newRule}</summary>
        <RuleForm rules={views} />
      </details>
      <PriceList rules={views} />
    </>
  );
}
