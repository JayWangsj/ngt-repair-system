import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { cents, dateTime, money, saleCode } from "@/lib/domain";
import { getMessages } from "@/lib/i18n-server";
import { requireActor } from "@/lib/session";
import { PageHeader } from "@/components/common";

export default async function RetailSalesPage() {
  await requireActor();
  const it = await getMessages();
  const sales = await db.retailSale.findMany({
    include: { payments: { orderBy: { receivedAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <>
      <PageHeader
        title={it.retail.salesHistory}
        description={it.retail.description}
        actionHref="/retail"
        actionLabel={it.retail.title}
      />
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
