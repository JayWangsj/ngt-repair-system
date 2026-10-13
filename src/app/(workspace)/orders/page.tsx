import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { getMessages } from "@/lib/i18n-server";
import { PageHeader, OrderTable } from "@/components/common";
import { OrderFilters } from "@/components/order-filters";
import { balance, romeDay, statuses, type OrderStatus } from "@/lib/domain";
import { requireActor } from "@/lib/session";
import {
  getBusinessDay,
  romeDateRange,
  validBusinessDate,
} from "@/lib/business-date";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const pageSize = 25;
const closedStatuses = ["COMPLETED", "CANCELLED", "REFUNDED"] as const;

function nextMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  return value === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(value + 1).padStart(2, "0")}-01`;
}

export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    attention?: string;
    month?: string;
    type?: string;
    page?: string;
  }>;
}) {
  const it = await getMessages();
  await requireActor();
  const query = await searchParams;
  const today = await getBusinessDay();
  const q = query.q?.trim() ?? "";
  const month =
    query.attention === "overdue" || query.attention === "unpaid"
      ? ""
      : query.month === undefined
        ? romeDay().slice(0, 7)
        : validBusinessDate(`${query.month}-01`)
          ? query.month
          : "";
  const status = statuses.includes(query.status as OrderStatus)
    ? (query.status as OrderStatus)
    : "";
  const type =
    query.type === "REPAIR" || query.type === "QUICK_SERVICE" ? query.type : "";
  const attention =
    query.attention === "overdue" || query.attention === "unpaid"
      ? query.attention
      : "";
  const filters: Prisma.WorkOrderWhereInput[] = [];
  if (q)
    filters.push({
      OR: [
        { device: { model: { contains: q, mode: "insensitive" } } },
        {
          device: { customer: { name: { contains: q, mode: "insensitive" } } },
        },
        { device: { customer: { phone: { contains: q } } } },
        { code: { contains: q, mode: "insensitive" } },
        ...(/^\d+$/.test(q) ? [{ number: Number(q) }] : []),
      ],
    });
  if (status) filters.push({ status });
  if (type) filters.push({ type });
  if (month)
    filters.push({
      createdAt: romeDateRange(`${month}-01`, nextMonth(month)),
    });
  if (attention === "overdue")
    filters.push(
      { status: { notIn: [...closedStatuses] } },
      { dueDate: { lt: today } },
    );
  if (attention === "unpaid")
    filters.push({ status: { notIn: [...closedStatuses] } });
  const where: Prisma.WorkOrderWhereInput =
    filters.length > 0 ? { AND: filters } : {};
  const findOrders = (pagination: { skip?: number; take?: number } = {}) =>
    db.workOrder.findMany({
      where,
      include: {
        device: { include: { customer: true } },
        items: true,
        products: true,
        payments: true,
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      ...pagination,
    });
  const requestedPage = Math.max(
    1,
    Number.parseInt(query.page ?? "1", 10) || 1,
  );
  let page: number;
  let pageCount: number;
  let totalCount: number;
  let orders: Awaited<ReturnType<typeof findOrders>> = [];
  if (attention === "unpaid") {
    const candidates = await findOrders();
    const unpaid = candidates.filter(
      (order) => balance(order.items, order.payments, order) > 0,
    );
    totalCount = unpaid.length;
    pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
    page = Math.min(requestedPage, pageCount);
    orders = unpaid.slice((page - 1) * pageSize, page * pageSize);
  } else {
    totalCount = await db.workOrder.count({ where });
    pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
    page = Math.min(requestedPage, pageCount);
    orders = await findOrders({ skip: (page - 1) * pageSize, take: pageSize });
  }
  function pageHref(targetPage: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (month) params.set("month", month);
    if (status) params.set("status", status);
    if (attention) params.set("attention", attention);
    if (type) params.set("type", type);
    params.set("page", String(targetPage));
    return `/orders?${params.toString()}`;
  }
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
          status,
          attention,
          type,
        }}
      />
      <section className="panel table-panel">
        <OrderTable orders={orders} />
      </section>
      {pageCount > 1 && (
        <nav className="order-pagination" aria-label={it.orderPagination}>
          <span>
            {it.pageOf
              .replace("{current}", String(page))
              .replace("{total}", String(pageCount))
              .replace("{count}", String(totalCount))}
          </span>
          <div>
            {page > 1 && (
              <Button asChild variant="outline">
                <Link href={pageHref(page - 1)}>{it.previousPage}</Link>
              </Button>
            )}
            {page < pageCount && (
              <Button asChild variant="outline">
                <Link href={pageHref(page + 1)}>{it.nextPage}</Link>
              </Button>
            )}
          </div>
        </nav>
      )}
    </>
  );
}
