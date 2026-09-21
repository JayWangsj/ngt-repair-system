import Link from "next/link";
import type {
  WorkOrder,
  Device,
  Customer,
  WorkOrderItem,
  Payment,
} from "@prisma/client";
import { ArrowUpRight, Plus, Wrench } from "lucide-react";
import { it } from "@/messages/it";
import {
  balance,
  dateOnly,
  isOverdue,
  money,
  orderCode,
  total,
  type OrderStatus,
} from "@/lib/domain";
import { Button } from "./ui/button";
export function PageHeader({
  title,
  description,
  action = false,
}: {
  title: string;
  description?: string;
  action?: boolean;
}) {
  return (
    <header className="page-header">
      <div>
        <div className="eyebrow">{it.workspace}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && (
        <Button asChild>
          <Link href="/orders/new">
            <Plus size={18} />
            {it.newOrder}
          </Link>
        </Button>
      )}
    </header>
  );
}
export function Badge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge status-${status.toLowerCase()}`}>
      <span />
      {it.status[status]}
    </span>
  );
}
export function Empty({ text = it.empty }: { text?: string }) {
  return (
    <div className="empty">
      <Wrench size={26} />
      <p>{text}</p>
    </div>
  );
}
type Row = WorkOrder & {
  device: Device & { customer: Customer };
  items: WorkOrderItem[];
  payments: Payment[];
};
export function OrderTable({ orders }: { orders: Row[] }) {
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
              <td className="numeric">{money(total(order.items))}</td>
              <td className="numeric">
                {money(balance(order.items, order.payments))}
              </td>
              <td>
                <Link
                  aria-label={`${it.details} ${orderCode(order.number)}`}
                  href={`/orders/${order.id}`}
                >
                  <ArrowUpRight size={18} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
