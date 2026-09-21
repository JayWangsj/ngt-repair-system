import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { PageHeader, OrderTable } from "@/components/common";
import { dateTime } from "@/lib/domain";
import { it } from "@/messages/it";
export default async function CustomerDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireActor();
  const { id } = await params;
  const customer = await db.customer.findUnique({
    where: { id },
    include: { devices: true },
  });
  if (!customer) notFound();
  const orders = await db.workOrder.findMany({
    where: { device: { customerId: id } },
    include: {
      device: { include: { customer: true } },
      items: true,
      payments: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return (
    <>
      <PageHeader title={customer.name} description={customer.phone} action />
      <section className="panel padded">
        <dl className="detail-list">
          <div>
            <dt>{it.consent}</dt>
            <dd>
              {customer.consentAt
                ? `${dateTime(customer.consentAt)} · v${customer.consentVersion}`
                : it.notRecorded}
            </dd>
          </div>
          <div>
            <dt>{it.taxCode}</dt>
            <dd>{customer.codiceFiscale ?? "—"}</dd>
          </div>
          <div>
            <dt>{it.vat}</dt>
            <dd>{customer.partitaIva ?? "—"}</dd>
          </div>
        </dl>
      </section>
      <h2 className="spaced">{it.devices}</h2>
      <div className="device-grid">
        {customer.devices.map((d) => (
          <article className="panel padded" key={d.id}>
            <h3>
              {d.brand} {d.model}
            </h3>
            <p>{d.series}</p>
            <small>IMEI: {d.imei ?? "—"}</small>
          </article>
        ))}
      </div>
      <h2 className="spaced">{it.customerHistory}</h2>
      <section className="panel table-panel">
        <OrderTable orders={orders} />
      </section>
    </>
  );
}
