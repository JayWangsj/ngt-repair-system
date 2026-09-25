import { db } from "@/lib/db";
import { getMessages } from "@/lib/i18n-server";
import { PageHeader, OrderTable } from "@/components/common";
import { balance, isOverdue, romeDay, statuses } from "@/lib/domain";
import { requireActor } from "@/lib/session";
export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    attention?: string;
    month?: string;
  }>;
}) {
  const it = await getMessages();
  await requireActor();
  const query = await searchParams;
  const q = query.q?.trim() ?? "";
  const month = /^\d{4}-\d{2}$/.test(query.month ?? "")
    ? query.month!
    : romeDay().slice(0, 7);
  const orders = await db.workOrder.findMany({
    include: {
      device: { include: { customer: true } },
      items: true,
      products: true,
      payments: true,
    },
    orderBy: { createdAt: "desc" },
    where: q
      ? {
          OR: [
            { device: { model: { contains: q, mode: "insensitive" } } },
            {
              device: {
                customer: { name: { contains: q, mode: "insensitive" } },
              },
            },
            { device: { customer: { phone: { contains: q } } } },
            ...(/^(NGT-)?\d+$/i.test(q)
              ? [{ number: Number(q.replace(/^NGT-/i, "")) }]
              : []),
          ],
        }
      : {},
  });
  const filtered = orders.filter(
    (o) =>
      (!query.status || o.status === query.status) &&
      romeDay(o.createdAt).startsWith(month) &&
      (query.attention === "overdue"
        ? isOverdue(o)
        : query.attention === "unpaid"
          ? o.status !== "CANCELLED" && balance(o.items, o.payments, o) > 0
          : true),
  );
  return (
    <>
      <PageHeader
        title={it.nav.orders}
        description={it.ordersDescription}
        action
      />
      <form className="filters">
        <label className="grow">
          <span className="sr-only">{it.search}</span>
          <input name="q" placeholder={it.orderSearch} defaultValue={q} />
        </label>
        <label>
          <span className="sr-only">{it.month}</span>
          <input name="month" type="month" defaultValue={month} />
        </label>
        <label>
          <span className="sr-only">{it.statusLabel}</span>
          <select name="status" defaultValue={query.status ?? ""}>
            <option value="">
              {it.all} · {it.statusLabel}
            </option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {it.status[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">{it.attention}</span>
          <select name="attention" defaultValue={query.attention ?? ""}>
            <option value="">
              {it.all} · {it.attention}
            </option>
            <option value="overdue">{it.overdue}</option>
            <option value="unpaid">{it.unpaid}</option>
          </select>
        </label>
        <button className="button button-outline">{it.filter}</button>
      </form>
      <section className="panel table-panel">
        <OrderTable orders={filtered} />
      </section>
    </>
  );
}
