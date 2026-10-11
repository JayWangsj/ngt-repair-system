import { db } from "@/lib/db";
import { getMessages } from "@/lib/i18n-server";
import { PageHeader, OrderTable } from "@/components/common";
import { OrderFilters } from "@/components/order-filters";
import { balance, isOverdue, romeDay } from "@/lib/domain";
import { requireActor } from "@/lib/session";
import { getBusinessDay } from "@/lib/business-date";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    attention?: string;
    month?: string;
    type?: string;
  }>;
}) {
  const it = await getMessages();
  await requireActor();
  const query = await searchParams;
  const today = await getBusinessDay();
  const q = query.q?.trim() ?? "";
  const month = /^\d{4}-\d{2}$/.test(query.month ?? "")
    ? query.month!
    : query.attention === "overdue" || query.attention === "unpaid"
      ? ""
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
      (!query.type || o.type === query.type) &&
      (!month || romeDay(o.createdAt).startsWith(month)) &&
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
        actionNode={
          <div className="page-header-actions">
            <Button asChild>
              <Link href="/orders/new">
                <Plus size={18} />
                {it.quickService.repairMode}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/orders/new?type=quick">
                <Plus size={18} />
                {it.quickService.quickMode}
              </Link>
            </Button>
          </div>
        }
      />
      <OrderFilters
        initial={{
          q,
          month,
          status: query.status ?? "",
          attention: query.attention ?? "",
          type: query.type ?? "",
        }}
      />
      <section className="panel table-panel">
        <OrderTable orders={filtered} />
      </section>
    </>
  );
}
