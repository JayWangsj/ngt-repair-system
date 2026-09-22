import Link from "next/link";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { PageHeader, Empty } from "@/components/common";
import { getMessages } from "@/lib/i18n-server";
export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const it = await getMessages();
  await requireActor();
  const { q = "" } = await searchParams;
  const customers = await db.customer.findMany({
    where: {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { phones: { some: { phone: { contains: q } } } },
            ],
          }
        : {}),
    },
    include: {
      phones: true,
      _count: { select: { devices: { where: { deletedAt: null } } } },
    },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageHeader
        title={it.nav.customers}
        description={it.customersDescription}
        actionHref="/customers/new"
        actionLabel={it.addCustomer}
      />
      <form className="filters">
        <label className="grow">
          <span className="sr-only">{it.search}</span>
          <input name="q" defaultValue={q} placeholder={it.customerSearch} />
        </label>
        <button className="button button-outline">{it.search}</button>
      </form>
      <section className="panel table-panel">
        {customers.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{it.customer}</th>
                  <th>{it.phone}</th>
                  <th>{it.devices}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link className="order-link" href={`/customers/${c.id}`}>
                        {c.name}
                      </Link>
                    </td>
                    <td>
                      {[
                        ...new Set([c.phone, ...c.phones.map((p) => p.phone)]),
                      ].join(" · ")}
                    </td>
                    <td>{c._count.devices}</td>
                    <td>
                      <Link
                        className="button button-outline table-action"
                        href={`/customers/${c.id}`}
                      >
                        {it.viewDetails}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
      </section>
    </>
  );
}
