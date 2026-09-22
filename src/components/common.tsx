import Link from "next/link";
import type {
  WorkOrder,
  Device,
  Customer,
  WorkOrderItem,
  Payment,
} from "@prisma/client";
import { Plus, Wrench } from "lucide-react";
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
  payments: Payment[];
};
export async function OrderTable({ orders }: { orders: Row[] }) {
  const it = await getMessages();
  if (!orders.length) return <Empty />;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{it.order}</th>
            <th>{it.customer}</th>
            <th>{it.device}</th>
            <th>{it.statusLabel}</th>
            <th>{it.dueDate}</th>
            <th className="numeric">{it.total}</th>
            <th className="numeric">{it.balance}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <Link className="order-link" href={`/orders/${order.id}`}>
                  {orderCode(order.number)}
                </Link>
              </td>
              <td>{order.device.customer.name}</td>
              <td>
                <strong>
                  {order.device.brand} {order.device.model}
                </strong>
                <small>{order.items.map((i) => i.project).join(", ")}</small>
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
              <td>
                <Link
                  className="button button-outline table-action"
                  aria-label={`${it.viewOrder} ${orderCode(order.number)}`}
                  href={`/orders/${order.id}`}
                >
                  {it.viewOrder}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
