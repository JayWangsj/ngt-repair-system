import { db } from "@/lib/db";
import { getMessages } from "@/lib/i18n-server";
import { PageHeader, OrderTable } from "@/components/common";
import { SimpleSelect } from "@/components/business-select";
import { balance, isOverdue, romeDay, statuses } from "@/lib/domain";
import { requireActor } from "@/lib/session";
import { getBusinessDay } from "@/lib/business-date";
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
  const today = await getBusinessDay();
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
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
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
            { code: { contains: q, mode: "insensitive" } },
            ...(/^\d+$/.test(q) ? [{ number: Number(q) }] : []),
          ],
        }
      : {},
  });
  const filtered = orders.filter(
    (o) =>
      (!query.status || o.status === query.status) &&
      romeDay(o.createdAt).startsWith(month) &&
      (query.attention === "overdue"
        ? isOverdue(o, today)
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
          <SimpleSelect
            name="status"
            defaultValue={query.status ?? ""}
            placeholder={`${it.all} · ${it.statusLabel}`}
            ariaLabel={it.statusLabel}
            options={[
              { value: "", label: `${it.all} · ${it.statusLabel}` },
              ...statuses.map((status) => ({
                value: status,
                label: it.status[status],
              })),
            ]}
          />
        </label>
        <label>
          <span className="sr-only">{it.attention}</span>
          <SimpleSelect
            name="attention"
            defaultValue={query.attention ?? ""}
            placeholder={`${it.all} · ${it.attention}`}
            ariaLabel={it.attention}
            options={[
              { value: "", label: `${it.all} · ${it.attention}` },
              { value: "overdue", label: it.overdue },
              { value: "unpaid", label: it.unpaid },
            ]}
          />
        </label>
        <button className="button button-outline">{it.filter}</button>
      </form>
      <section className="panel table-panel">
        <OrderTable orders={filtered} />
      </section>
    </>
  );
}
