import Link from "next/link";
import type {
  WorkOrder,
  Device,
  Customer,
  WorkOrderItem,
  WorkOrderProduct,
  Payment,
} from "@prisma/client";
import { Plus, Wrench } from "lucide-react";
import { getMessages } from "@/lib/i18n-server";
import { balance, isOverdue, settlement, type OrderStatus } from "@/lib/domain";
import { Button } from "./ui/button";
import { OrderListBody } from "./order-list-controls";
export function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Link className="button button-outline back-link" href={href}>
      ← {label}
    </Link>
  );
}
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
            <th className="numeric">{it.payments}</th>
          </tr>
        </thead>
        <OrderListBody
          hideCustomer={hideCustomer}
          compact={compact}
          rows={orders.map((order) => {
            const due = ["REFUNDED", "CANCELLED"].includes(order.status)
              ? 0
              : settlement(order.items, order).due;
            const remaining = balance(order.items, order.payments, order);
            return {
              id: order.id,
              code: order.code,
              customerId: order.device.customerId,
              customerName: order.device.customer.name,
              brand: order.device.brand,
              model: order.device.model,
              projects: order.inspectionMode
                ? it.inspectionPending
                : order.items.map((item) => item.project).join(", "),
              status: order.status,
              dueDate: order.dueDate ?? "",
              overdue: isOverdue(order),
              due,
              paid: ["REFUNDED", "CANCELLED"].includes(order.status)
                ? 0
                : due - remaining,
              balance: remaining,
            };
          })}
        />
      </table>
    </div>
  );
}
