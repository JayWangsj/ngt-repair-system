import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Clock3,
  PackageCheck,
  ShoppingBag,
  Wallet,
  Wrench,
} from "lucide-react";
import { db } from "@/lib/db";
import {
  dateTime,
  cents,
  isOverdue,
  money,
  orderCode,
  romeDay,
  saleCode,
  statuses,
} from "@/lib/domain";
import { revenueSeries, summarizePayments } from "@/lib/business-metrics";
import { getLocale, getMessages } from "@/lib/i18n-server";
import { Badge, PageHeader } from "@/components/common";
import { requireActor } from "@/lib/session";

export default async function Dashboard() {
  const it = await getMessages();
  const locale = await getLocale();
  const actor = await requireActor();
  const [orders, payments, products, sales, saleItems] = await Promise.all([
    db.workOrder.findMany({
      include: {
        device: { include: { customer: true } },
        items: true,
        products: true,
        payments: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    db.payment.findMany({
      include: { allocations: true },
      orderBy: { receivedAt: "asc" },
    }),
    db.product.findMany({ where: { enabled: true } }),
    db.retailSale.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    db.retailSaleItem.findMany({ include: { sale: true } }),
  ]);
  const today = romeDay();
  const active = orders.filter(
    (order) => !["COMPLETED", "CANCELLED"].includes(order.status),
  );
  const overdue = active.filter((order) => isOverdue(order));
  const lowStock = products.filter(
    (product) =>
      product.stockQuantity > 0 && product.stockQuantity <= product.minStock,
  );
  const outOfStock = products.filter((product) => product.stockQuantity <= 0);
  const todayRevenue = summarizePayments(payments, today);
  const series = revenueSeries(payments, today);
  const chartMax = Math.max(...series.map((day) => day.total), 1);
  const sourceTotal = Math.max(todayRevenue.total, 1);
  const hotProducts = Object.values(
    saleItems
      .filter((item) => romeDay(item.sale.createdAt) === today)
      .reduce<
        Record<string, { name: string; quantity: number; revenue: number }>
      >((result, item) => {
        const row = result[item.productId] ?? {
          name: item.productName,
          quantity: 0,
          revenue: 0,
        };
        row.quantity += item.quantity;
        row.revenue += cents(item.subtotal);
        result[item.productId] = row;
        return result;
      }, {}),
  )
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);
  const metrics = [
    { label: it.active, value: active.length, icon: Wrench, color: "teal" },
    {
      label: it.ready,
      value: active.filter((order) => order.status === "READY").length,
      icon: PackageCheck,
      color: "blue",
    },
    {
      label: it.overdue,
      value: overdue.length,
      icon: Clock3,
      color: "orange",
    },
    ...(actor.role === "OWNER"
      ? [
          {
            label: it.receipts,
            value: money(todayRevenue.total),
            icon: Wallet,
            color: "green",
          },
        ]
      : [
          {
            label: it.waiting,
            value: active.filter((order) => order.status === "WAITING_APPROVAL")
              .length,
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
        {new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "it-IT", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Europe/Rome",
        }).format(new Date())}
      </div>
      <div className="metrics dashboard-kpis">
        {metrics.map(({ label, value, icon: Icon, color }) => (
          <div className="metric" key={label}>
            <div className="metric-top">
              <span>{label}</span>
              <span className={`metric-icon ${color}`}>
                <Icon size={21} />
              </span>
            </div>
            <strong>{value}</strong>
            {label === it.receipts ? (
              <small>
                {it.dashboard.repairRevenue} {money(todayRevenue.repair)} ·{" "}
                {it.dashboard.retailRevenue} {money(todayRevenue.retail)}
              </small>
            ) : (
              <small>{it.workspace}</small>
            )}
          </div>
        ))}
      </div>

      {actor.role === "OWNER" && (
        <div className="dashboard-charts">
          <section className="panel padded revenue-chart-card">
            <div className="section-heading">
              <h2>{it.dashboard.revenue7}</h2>
              <div className="chart-legend">
                <span>
                  <i className="repair" />
                  {it.dashboard.repairRevenue}
                </span>
                <span>
                  <i className="retail" />
                  {it.dashboard.retailRevenue}
                </span>
              </div>
            </div>
            <div className="revenue-bars">
              {series.map((day) => (
                <div className="revenue-day" key={day.day}>
                  <div className="revenue-bar-track" title={money(day.total)}>
                    <div
                      className="revenue-bar repair"
                      style={{ height: `${(day.repair / chartMax) * 100}%` }}
                    />
                    <div
                      className="revenue-bar retail"
                      style={{ height: `${(day.retail / chartMax) * 100}%` }}
                    />
                  </div>
                  <small>{day.day.slice(5).replace("-", "/")}</small>
                </div>
              ))}
            </div>
          </section>
          <section className="panel padded revenue-source-card">
            <h2>{it.receipts}</h2>
            <div className="revenue-source-content">
              <div
                className="revenue-donut"
                style={{
                  background: `conic-gradient(var(--accent) 0 ${(todayRevenue.repair / sourceTotal) * 100}%, #ffe49a 0 100%)`,
                }}
              >
                <span>
                  <strong>{money(todayRevenue.total)}</strong>
                  <small>{it.receipts}</small>
                </span>
              </div>
              <div className="revenue-source-legend">
                <p>
                  <i className="repair" />
                  <span>{it.dashboard.repairRevenue}</span>
                  <strong>{money(todayRevenue.repair)}</strong>
                </p>
                <p>
                  <i className="retail" />
                  <span>{it.dashboard.retailRevenue}</span>
                  <strong>{money(todayRevenue.retail)}</strong>
                </p>
              </div>
            </div>
          </section>
          <section className="panel padded payment-method-card">
            <h2>{it.dashboard.paymentMethods}</h2>
            {(["CASH", "CARD", "OTHER"] as const).map((method) => (
              <div className="payment-method-row" key={method}>
                <span>{it.methods[method]}</span>
                <div>
                  <i
                    style={{
                      width: `${(todayRevenue.methods[method] / sourceTotal) * 100}%`,
                    }}
                  />
                </div>
                <strong>{money(todayRevenue.methods[method])}</strong>
              </div>
            ))}
            <Link className="dashboard-detail-link" href="/reports">
              {it.dashboard.viewStats}
              <ArrowUpRight size={15} />
            </Link>
          </section>
        </div>
      )}

      <section className="panel dashboard-workflow">
        <div className="section-heading">
          <h2>{it.workflow}</h2>
          <span className="muted">
            {orders.length} {it.nav.orders.toLowerCase()}
          </span>
        </div>
        <div className="workflow">
          {statuses.map((status) => (
            <Link href={`/orders?status=${status}`} key={status}>
              <span className={`status-dot status-${status.toLowerCase()}`} />
              <strong>
                {orders.filter((order) => order.status === status).length}
              </strong>
              <span>{it.status[status]}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="dashboard-lists">
        <section className="panel padded attention-card">
          <div className="section-heading">
            <h2>{it.priorities}</h2>
          </div>
          {overdue.length + lowStock.length + outOfStock.length ? (
            <>
              <Link href="/orders?attention=overdue">
                <Clock3 size={18} />
                <span>{it.overdue}</span>
                <strong>{overdue.length}</strong>
              </Link>
              <Link href="/inventory?status=LOW_STOCK">
                <AlertTriangle size={18} />
                <span>{it.dashboard.lowStock}</span>
                <strong>{lowStock.length}</strong>
              </Link>
              <Link href="/inventory?status=OUT_OF_STOCK">
                <ShoppingBag size={18} />
                <span>{it.dashboard.outOfStock}</span>
                <strong>{outOfStock.length}</strong>
              </Link>
            </>
          ) : (
            <p className="muted">{it.dashboard.noAttention}</p>
          )}
        </section>

        <section className="panel padded dashboard-list-card">
          <div className="section-heading">
            <h2>{it.recent}</h2>
            <Link href="/orders">
              {it.viewAll}
              <ArrowUpRight size={15} />
            </Link>
          </div>
          {orders.slice(0, 5).map((order) => (
            <Link
              className="dashboard-list-row"
              href={`/orders/${order.id}`}
              key={order.id}
            >
              <span>
                <strong>{orderCode(order.number)}</strong>
                <small>
                  {order.device.brand} {order.device.model}
                </small>
              </span>
              <Badge status={order.status} />
            </Link>
          ))}
          {!orders.length && <p className="muted">{it.empty}</p>}
        </section>

        <section className="panel padded dashboard-list-card">
          <div className="section-heading">
            <h2>{it.dashboard.recentSales}</h2>
            <Link href="/retail/sales">
              {it.viewAll}
              <ArrowUpRight size={15} />
            </Link>
          </div>
          {sales.map((sale) => (
            <Link
              className="dashboard-list-row"
              href={`/retail/sales/${sale.id}`}
              key={sale.id}
            >
              <span>
                <strong>{saleCode(sale.number)}</strong>
                <small>{dateTime(sale.createdAt)}</small>
              </span>
              <strong>{money(cents(sale.total))}</strong>
            </Link>
          ))}
          {!sales.length && <p className="muted">{it.retail.noSales}</p>}
        </section>

        <section className="panel padded dashboard-list-card">
          <div className="section-heading">
            <h2>{it.dashboard.hotProducts}</h2>
            <Link href="/retail/sales">
              {it.viewAll}
              <ArrowUpRight size={15} />
            </Link>
          </div>
          {hotProducts.map((product, index) => (
            <div className="dashboard-list-row" key={product.name}>
              <span>
                <strong>
                  {index + 1}. {product.name}
                </strong>
                <small>
                  {product.quantity} {it.retail.itemsSold}
                </small>
              </span>
              <strong>{money(product.revenue)}</strong>
            </div>
          ))}
          {!hotProducts.length && <p className="muted">{it.empty}</p>}
        </section>
      </div>
    </>
  );
}
