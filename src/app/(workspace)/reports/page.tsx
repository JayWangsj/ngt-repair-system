import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { PageHeader, OrderTable } from "@/components/common";
import { balance, cents, money, romeDay, statuses } from "@/lib/domain";
import { getMessages } from "@/lib/i18n-server";
export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const it = await getMessages();
  const actor = await requireActor();
  if (actor.role !== "OWNER")
    return <p className="message error">{it.restricted}</p>;
  const { day = romeDay() } = await searchParams;
  const orders = await db.workOrder.findMany({
    include: {
      device: { include: { customer: true } },
      items: true,
      payments: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const payments = orders
    .flatMap((o) => o.payments)
    .filter((p) => romeDay(p.receivedAt) === day);
  const unpaid = orders.filter(
    (o) => o.status !== "CANCELLED" && balance(o.items, o.payments, o) > 0,
  );
  return (
    <>
      <PageHeader title={it.nav.reports} description={it.reportDescription} />
      <form className="filters">
        <label>
          {it.reportDay}
          <input name="day" type="date" defaultValue={day} required />
        </label>
        <button className="button button-outline">{it.filter}</button>
      </form>
      <div className="metrics">
        <div className="metric">
          <span>{it.receivedOnDay}</span>
          <strong>
            {money(payments.reduce((s, p) => s + cents(p.amount), 0))}
          </strong>
        </div>
        <div className="metric">
          <span>{it.createdOnDay}</span>
          <strong>
            {orders.filter((o) => romeDay(o.createdAt) === day).length}
          </strong>
        </div>
        <div className="metric">
          <span>{it.openBalance}</span>
          <strong>
            {money(
              unpaid.reduce((s, o) => s + balance(o.items, o.payments, o), 0),
            )}
          </strong>
        </div>
      </div>
      <div className="bottom-grid">
        <section className="panel padded">
          <h2>{it.byMethod}</h2>
          {Object.entries(it.methods).map(([method, label]) => (
            <div className="stat-row" key={method}>
              <span>{label}</span>
              <strong>
                {money(
                  payments
                    .filter((p) => p.method === method)
                    .reduce((s, p) => s + cents(p.amount), 0),
                )}
              </strong>
            </div>
          ))}
        </section>
        <section className="panel padded">
          <h2>{it.workflow}</h2>
          {statuses.map((s) => (
            <div className="stat-row" key={s}>
              <span>{it.status[s]}</span>
              <strong>{orders.filter((o) => o.status === s).length}</strong>
            </div>
          ))}
        </section>
      </div>
      <h2 className="spaced">{it.unpaid}</h2>
      <section className="panel table-panel">
        <OrderTable orders={unpaid} />
      </section>
    </>
  );
}
