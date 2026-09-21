import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { PageHeader, OrderTable } from "@/components/common";
import { CustomerForm, DeviceForm, DeleteRecord } from "@/components/forms";
import { getMessages } from "@/lib/i18n-server";
export default async function CustomerDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const it = await getMessages();
  await requireActor();
  const { id } = await params;
  const customer = await db.customer.findUnique({
    where: { id },
    include: { phones: true, devices: { where: { deletedAt: null } } },
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
      <PageHeader title={customer.name} description={customer.phone} />
      <section className="panel padded">
        {!customer.deletedAt && (
          <>
            <CustomerForm customer={customer} />
            <DeleteRecord id={id} kind="customer" />
          </>
        )}
      </section>
      <h2 className="spaced">{it.devices}</h2>
      <div className="device-grid">
        {customer.devices.map((d) => (
          <article className="panel padded" key={d.id}>
            <h3>
              {d.brand} {d.model}
            </h3>
            <p>{d.series}</p>
            <DeviceForm device={d} />
            <DeleteRecord id={d.id} kind="device" />
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
