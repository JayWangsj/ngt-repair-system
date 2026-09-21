import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { PageHeader } from "@/components/common";
import { RuleForm } from "@/components/forms";
import { money, cents } from "@/lib/domain";
import { getMessages } from "@/lib/i18n-server";
export default async function Prices() {
  const it = await getMessages();
  const actor = await requireActor();
  if (actor.role !== "OWNER")
    return <p className="message error">{it.restricted}</p>;
  const rules = await db.priceRule.findMany({
    orderBy: [{ project: "asc" }, { brand: "asc" }],
  });
  return (
    <>
      <PageHeader title={it.nav.prices} description={it.priceDescription} />
      <details className="panel padded">
        <summary>{it.newRule}</summary>
        <RuleForm />
      </details>
      <div className="rule-list">
        {rules.map((r) => (
          <details className="panel padded" key={r.id}>
            <summary className="rule-summary">
              <span>
                <strong>{r.project}</strong>
                <small>
                  {[r.brand, r.series, r.model].filter(Boolean).join(" · ") ||
                    it.generic}
                </small>
              </span>
              <span className={!r.enabled ? "muted" : ""}>
                {money(cents(r.suggested))} ·{" "}
                {r.enabled ? it.enabled : it.disabled}
              </span>
            </summary>
            <RuleForm
              rule={{
                ...r,
                suggested: r.suggested.toString(),
                cost: r.cost?.toString(),
              }}
            />
          </details>
        ))}
      </div>
    </>
  );
}
