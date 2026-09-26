import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { cents, dateTime, money, saleCode } from "@/lib/domain";
import { getMessages } from "@/lib/i18n-server";
import { requireActor } from "@/lib/session";
import { PageHeader } from "@/components/common";

export default async function RetailSaleDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireActor();
  const it = await getMessages();
  const { id } = await params;
  const sale = await db.retailSale.findUnique({
    where: { id },
    include: { items: true, payments: { orderBy: { receivedAt: "asc" } } },
  });
  if (!sale) notFound();
  return (
    <>
      <PageHeader
        title={`${it.retail.detail} · ${saleCode(sale.code)}`}
        description={`${dateTime(sale.createdAt)} · ${sale.actorName}`}
      />
      <div className="detail-grid retail-detail-grid">
        <section className="panel table-panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{it.inventory.product}</th>
                  <th className="numeric">{it.retail.unitPrice}</th>
                  <th className="numeric">{it.retail.quantity}</th>
                  <th className="numeric">{it.retail.subtotal}</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.productName}</strong>
                      <small>{item.category}</small>
                    </td>
                    <td className="numeric">{money(cents(item.unitPrice))}</td>
                    <td className="numeric">{item.quantity}</td>
                    <td className="numeric">{money(cents(item.subtotal))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="panel padded retail-receipt-summary">
          <div>
            <span>{it.retail.subtotal}</span>
            <strong>{money(cents(sale.subtotal))}</strong>
          </div>
          <div>
            <span>{it.retail.discount}</span>
            <strong>− {money(cents(sale.discount))}</strong>
          </div>
          <div className="retail-receipt-total">
            <span>{it.retail.total}</span>
            <strong>{money(cents(sale.total))}</strong>
          </div>
          <div>
            <span>{it.retail.paymentMethod}</span>
            <strong>
              {sale.payments[0] ? it.methods[sale.payments[0].method] : "—"}
            </strong>
          </div>
          <div>
            <span>{it.retail.date}</span>
            <strong>{dateTime(sale.createdAt)}</strong>
          </div>
        </aside>
      </div>
    </>
  );
}
