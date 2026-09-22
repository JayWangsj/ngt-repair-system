import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { PageHeader } from "@/components/common";
import { RuleForm, PriceList } from "@/components/forms";
import { getMessages } from "@/lib/i18n-server";
export default async function Prices({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const it = await getMessages();
  const actor = await requireActor();
  if (actor.role !== "OWNER")
    return <p className="message error">{it.restricted}</p>;
  const showNew = (await searchParams).new === "1";
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
  return (
    <>
      <PageHeader
        title={it.nav.prices}
        description={it.priceDescription}
        actionHref="/prices?new=1#new-rule"
        actionLabel={it.newRule}
      />
      {showNew && (
        <section id="new-rule" className="panel padded">
          <RuleForm rules={views} />
        </section>
      )}
      <PriceList rules={views} />
    </>
  );
}
