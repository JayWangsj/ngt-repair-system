import Link from "next/link";
import type {
  WorkOrder,
  Device,
  Customer,
  WorkOrderItem,
  WorkOrderProduct,
  Payment,
} from "@prisma/client";
import { Plus, Wrench, ChevronRight } from "lucide-react";
import { getMessages } from "@/lib/i18n-server";
import {
  balance,
  dateOnly,
  isOverdue,
  money,
  orderCode,
  settlement,
  type OrderStatus,
} from "@/lib/domain";
import { Button } from "./ui/button";
export async function PageHeader({
  title,
  description,
  action = false,
  actionHref,
  actionLabel,
  actionNode,
}: {
  title: string;
  description?: string;
  action?: boolean;
  actionHref?: string;
  actionLabel?: string;
  actionNode?: import("react").ReactNode;
}) {
  const it = await getMessages();
  return (
    <header className="page-header">
      <div>
        <div className="eyebrow">{it.workspace}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actionNode}
      {(action || actionHref) && (
        <Button asChild>
          <Link href={actionHref ?? "/orders/new"}>
            <Plus size={18} />
            {actionLabel ?? it.newOrder}
          </Link>
        </Button>
      )}
    </header>
  );
}
export async function Badge({ status }: { status: OrderStatus }) {
  const it = await getMessages();
  return (
    <span className={`badge status-${status.toLowerCase()}`}>
      <span />
      {it.status[status]}
    </span>
  );
}
export async function Empty({ text }: { text?: string }) {
  const it = await getMessages();
  return (
    <div className="empty">
      <Wrench size={26} />
      <p>{text ?? it.empty}</p>
    </div>
  );
}
type Row = WorkOrder & {
  device: Device & { customer: Customer };
  items: WorkOrderItem[];
  products: WorkOrderProduct[];
  payments: Payment[];
};
export async function OrderTable({
  orders,
  hideCustomer = false,
  compact = false,
}: {
  orders: Row[];
  hideCustomer?: boolean;
  compact?: boolean;
}) {
  const it = await getMessages();
  if (!orders.length)
    return compact ? <p className="compact-empty">{it.empty}</p> : <Empty />;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{it.order}</th>
            {!hideCustomer && <th>{it.customer}</th>}
            <th>{it.device}</th>
            <th>{it.statusLabel}</th>
            <th>{it.dueDate}</th>
            <th className="numeric">{it.total}</th>
            <th className="numeric">{it.balance}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <Link className="order-link" href={`/orders/${order.id}`}>
                  {orderCode(order.number)}
                  <ChevronRight size={15} aria-hidden="true" />
                </Link>
              </td>
              {!hideCustomer && (
                <td>
                  <Link
                    className="order-link"
                    href={`/customers/${order.device.customerId}`}
                  >
                    {order.device.customer.name}
                  </Link>
                </td>
              )}
              <td>
                <strong>
                  {order.device.brand} {order.device.model}
                </strong>
                <small
                  className={compact ? "order-project-summary" : undefined}
                >
                  {order.items.map((i) => i.project).join(", ")}
                </small>
              </td>
              <td>
                <Badge status={order.status} />
              </td>
              <td className={isOverdue(order) ? "danger-text" : ""}>
                {dateOnly(order.dueDate)}
                {isOverdue(order) && <small>{it.overdue}</small>}
              </td>
              <td className="numeric">
                {money(settlement(order.items, order).due)}
              </td>
              <td className="numeric">
                {money(balance(order.items, order.payments, order))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
