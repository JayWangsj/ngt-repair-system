import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { OrderTable } from "@/components/common";
import { CustomerSummary, CustomerDevices } from "@/components/customers";
import { getMessages } from "@/lib/i18n-server";
export default async function CustomerDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const it = await getMessages();
  await requireActor();
  const { id } = await params;
  const { q = "" } = await searchParams;
  const returnTo = q ? `/customers?q=${encodeURIComponent(q)}` : "/customers";
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
      products: true,
      payments: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return (
    <>
      <Link className="button button-outline customer-back" href={returnTo}>
        ← {it.backCustomers}
      </Link>
      <CustomerSummary
        customer={{
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          phones: customer.phones.map((p) => ({ phone: p.phone })),
        }}
        query={q}
        deleted={Boolean(customer.deletedAt)}
      />
      <h2 className="spaced">
        {it.devices} ({customer.devices.length})
      </h2>
      <CustomerDevices
        devices={customer.devices.map((d) => ({
          id: d.id,
          category: d.category,
          brand: d.brand,
          model: d.model,
          imei: d.imei,
        }))}
        readOnly={Boolean(customer.deletedAt)}
      />
      <h2 className="spaced">{it.customerHistory}</h2>
      <section className="panel table-panel">
        <OrderTable orders={orders} hideCustomer compact />
      </section>
    </>
  );
}
