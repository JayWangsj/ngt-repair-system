import Link from "next/link";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { PageHeader, Empty } from "@/components/common";
import { it } from "@/messages/it";
export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireActor();
  const { q = "" } = await searchParams;
  const customers = await db.customer.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        }
      : {},
    include: { _count: { select: { devices: true } } },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageHeader
        title={it.nav.customers}
        description={it.customersDescription}
        action
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
                    <td>{c.phone}</td>
                    <td>{c._count.devices}</td>
                    <td>
                      <Link href={`/customers/${c.id}`}>{it.details} ↗</Link>
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
