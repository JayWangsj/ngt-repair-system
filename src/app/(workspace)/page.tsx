import Link from "next/link";
import {
  ArrowUpRight,
  Wallet,
  Wrench,
  PackageCheck,
  Clock3,
} from "lucide-react";
import { db } from "@/lib/db";
import {
  balance,
  settlement,
  cents,
  isOverdue,
  money,
  romeDay,
  statuses,
} from "@/lib/domain";
import { getLocale, getMessages } from "@/lib/i18n-server";
import { OrderTable, PageHeader } from "@/components/common";
import { requireActor } from "@/lib/session";
export default async function Dashboard() {
  const it = await getMessages();
  const actor = await requireActor();
  const orders = await db.workOrder.findMany({
    include: {
      device: { include: { customer: true } },
      items: true,
      products: true,
      payments: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const today = romeDay();
  const active = orders.filter(
    (o) => !["COMPLETED", "CANCELLED"].includes(o.status),
  );
  const priorities = active.filter(
    (o) =>
      o.status === "READY" || o.status === "WAITING_APPROVAL" || isOverdue(o),
  );
  const receipts = orders
    .flatMap((o) => o.payments)
    .filter((p) => romeDay(p.receivedAt) === today)
    .reduce((sum, p) => sum + cents(p.amount), 0);
  const metrics = [
    { label: it.active, value: active.length, icon: Wrench, color: "teal" },
    {
      label: it.ready,
      value: active.filter((o) => o.status === "READY").length,
      icon: PackageCheck,
      color: "blue",
    },
    {
      label: it.overdue,
      value: active.filter((o) => isOverdue(o)).length,
      icon: Clock3,
      color: "orange",
    },
    ...(actor.role === "OWNER"
      ? [
          {
            label: it.receipts,
            value: money(receipts),
            icon: Wallet,
            color: "green",
          },
        ]
      : [
          {
            label: it.waiting,
            value: active.filter((o) => o.status === "WAITING_APPROVAL").length,
            icon: Clock3,
            color: "green",
          },
        ]),
  ];
  return (
    <>
      <PageHeader
        title={it.today}
        description={it.dashboardDescription}
        action
      />
      <div className="date-strip">
        <span className="live-dot" />
        {new Intl.DateTimeFormat(
          (await getLocale()) === "zh" ? "zh-CN" : "it-IT",
          {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Europe/Rome",
          },
        ).format(new Date())}
      </div>
      <div className="metrics">
        {metrics.map(({ label, value, icon: Icon, color }) => (
          <div className="metric" key={label}>
            <div className="metric-top">
              <span>{label}</span>
              <span className={`metric-icon ${color}`}>
                <Icon size={21} />
              </span>
            </div>
            <strong>{value}</strong>
            <small>{it.workspace}</small>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>{it.workflow}</h2>
          <span className="muted">
            {orders.length} {it.nav.orders.toLowerCase()}
          </span>
        </div>
        <div className="workflow">
          {statuses.map((s) => (
            <Link href={`/orders?status=${s}`} key={s}>
              <span className={`status-dot status-${s.toLowerCase()}`} />
              <strong>{orders.filter((o) => o.status === s).length}</strong>
              <span>{it.status[s]}</span>
            </Link>
          ))}
        </div>
      </section>
      <div className="section-heading spaced">
        <h2>
          {it.priorities}
          <span className="count">{priorities.length}</span>
        </h2>
        <Link href="/orders?attention=overdue">
          {it.overdue}
          <ArrowUpRight size={16} />
        </Link>
      </div>
      <section className="panel table-panel">
        <OrderTable orders={priorities.slice(0, 8)} />
      </section>
      <div className="bottom-grid">
        <section className="panel insight">
          <span className="eyebrow">{it.unpaid}</span>
          <h2>
            {
              orders.filter(
                (o) =>
                  o.status !== "CANCELLED" &&
                  balance(o.items, o.payments, o) > 0,
              ).length
            }{" "}
            {it.nav.orders.toLowerCase()}
          </h2>
          <p>{it.openBalance}</p>
          <Link href="/orders?attention=unpaid">
            {it.viewAll}
            <ArrowUpRight size={17} />
          </Link>
        </section>
        <section className="panel recent-panel">
          <div className="section-heading">
            <h2>{it.recent}</h2>
            <Link href="/orders">
              {it.viewAll}
              <ArrowUpRight size={16} />
            </Link>
          </div>
          {orders.slice(0, 4).map((o) => (
            <Link className="recent-row" href={`/orders/${o.id}`} key={o.id}>
              <div className="device-icon">
                <Wrench size={18} />
              </div>
              <span>
                <strong>
                  {o.device.brand} {o.device.model}
                </strong>
                <small>{o.device.customer.name}</small>
              </span>
              <span className="recent-price">
                {money(settlement(o.items, o).due)}
              </span>
              <ArrowUpRight size={16} />
            </Link>
          ))}
          {!orders.length && <p className="muted">{it.empty}</p>}
        </section>
      </div>
    </>
  );
}
