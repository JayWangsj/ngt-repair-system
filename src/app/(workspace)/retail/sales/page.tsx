import Link from "next/link";
import { db } from "@/lib/db";
import { cents, dateTime, romeDay } from "@/lib/domain";
import { getMessages } from "@/lib/i18n-server";
import { requireActor } from "@/lib/session";
import { PageHeader } from "@/components/common";
import { RetailSalesHistory } from "@/components/retail-sales-history";

export default async function RetailSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireActor();
  const it = await getMessages();
  const query = await searchParams;
  const today = romeDay();
  const period = /^\d{4}-\d{2}$/.test(query.period ?? "")
    ? query.period!
    : today.slice(0, 7);
  const allSales = await db.retailSale.findMany({
    include: {
      items: true,
      payments: { orderBy: { receivedAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
  const sales = allSales.filter((sale) =>
    romeDay(sale.createdAt).startsWith(period),
  );
  return (
    <>
      <PageHeader
        title={it.retail.salesHistory}
        description={it.retail.description}
      />
      <Link className="button button-outline back-link" href="/retail">
        ← {it.retail.title}
      </Link>
      <form className="filters retail-sales-filter">
        <input name="period" type="month" defaultValue={period} />
        <button className="button button-outline">{it.filter}</button>
      </form>
      <RetailSalesHistory
        sales={sales.map((sale) => ({
          id: sale.id,
          code: sale.code,
          date: dateTime(sale.createdAt),
          itemCount: sale.itemCount,
          method: sale.payments[0]?.method ?? null,
          subtotal: cents(sale.subtotal),
          discount: cents(sale.discount),
          total: cents(sale.total),
          items: sale.items.map((item) => ({
            id: item.id,
            name: item.productName,
            category: item.category,
            unitPrice: cents(item.unitPrice),
            quantity: item.quantity,
            subtotal: cents(item.subtotal),
          })),
        }))}
      />
    </>
  );
}
