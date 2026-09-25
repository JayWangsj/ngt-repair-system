import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { cents, dateTime, money, romeDay, saleCode } from "@/lib/domain";
import { getMessages } from "@/lib/i18n-server";
import { requireActor } from "@/lib/session";
import { PageHeader } from "@/components/common";

export default async function RetailSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; period?: string }>;
}) {
  await requireActor();
  const it = await getMessages();
  const query = await searchParams;
  const mode = query.mode === "month" ? "month" : "day";
  const today = romeDay();
  const period =
    mode === "month"
      ? /^\d{4}-\d{2}$/.test(query.period ?? "")
        ? query.period!
        : today.slice(0, 7)
      : /^\d{4}-\d{2}-\d{2}$/.test(query.period ?? "")
        ? query.period!
        : today;
  const allSales = await db.retailSale.findMany({
    include: { payments: { orderBy: { receivedAt: "asc" } } },
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
        <select name="mode" defaultValue={mode}>
          <option value="day">{it.day}</option>
          <option value="month">{it.month}</option>
        </select>
        <input
          name="period"
          type={mode === "month" ? "month" : "date"}
          defaultValue={period}
        />
        <button className="button button-outline">{it.filter}</button>
      </form>
      <section className="panel table-panel">
        {sales.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{it.retail.saleNumber}</th>
                  <th>{it.retail.date}</th>
                  <th>{it.retail.quantity}</th>
                  <th>{it.retail.paymentMethod}</th>
                  <th className="numeric">{it.retail.amount}</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <Link
                        className="order-link"
                        href={`/retail/sales/${sale.id}`}
                      >
                        {saleCode(sale.number)} <ChevronRight size={15} />
                      </Link>
                    </td>
                    <td>{dateTime(sale.createdAt)}</td>
                    <td>{sale.itemCount}</td>
                    <td>
                      {sale.payments[0]
                        ? it.methods[sale.payments[0].method]
                        : "—"}
                    </td>
                    <td className="numeric">{money(cents(sale.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="inventory-empty">{it.retail.noSales}</p>
        )}
      </section>
    </>
  );
}
