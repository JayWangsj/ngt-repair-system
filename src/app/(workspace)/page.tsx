import Link from "next/link";
import {
  AlertTriangle,
  ChartNoAxesColumnIncreasing,
  Clock3,
  Inbox,
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
import {
  recentRomeDays,
  revenueSeries,
  summarizePayments,
} from "@/lib/business-metrics";
import { getLocale, getMessages } from "@/lib/i18n-server";
import { Badge, PageHeader } from "@/components/common";
import { requireActor } from "@/lib/session";
import { DashboardMotion } from "@/components/dashboard-motion";
import { getBusinessDay } from "@/lib/business-date";

function percentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function revenueTrend(current: number, previous: number) {
  if (previous <= 0) return null;
  const change = Math.round(((current - previous) / previous) * 100);
  return { change, label: `${change >= 0 ? "+" : ""}${change}%` };
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const it = await getMessages();
  const locale = await getLocale();
  const actor = await requireActor();
  const businessToday = await getBusinessDay();
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
  const requestedDay = (await searchParams).day;
  const today =
    requestedDay && /^\d{4}-\d{2}-\d{2}$/.test(requestedDay)
      ? requestedDay
      : romeDay();
  const active = orders.filter(
    (order) => !["COMPLETED", "CANCELLED"].includes(order.status),
  );
  const overdue = active.filter((order) => isOverdue(order, businessToday));
  const lowStock = products.filter(
    (product) =>
      product.stockQuantity > 0 && product.stockQuantity <= product.minStock,
  );
  const outOfStock = products.filter((product) => product.stockQuantity <= 0);
  const todayRevenue = summarizePayments(payments, today);
  const yesterdayRevenue = summarizePayments(
    payments,
    recentRomeDays(today, 2)[0],
  );
  const series = revenueSeries(payments, today);
  const chartMax = Math.max(
    ...series.flatMap((day) => [day.repair, day.retail]),
    1,
  );
  const hasRevenueSeries = series.some((day) => day.total !== 0);
  const repairShare = percentage(todayRevenue.repair, todayRevenue.total);
  const retailShare = percentage(todayRevenue.retail, todayRevenue.total);
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
    {
      label: it.active,
      value: active.length,
      count: active.length,
      type: "integer",
      icon: Wrench,
      color: "teal",
      trend: null,
    },
    {
      label: it.ready,
      value: active.filter((order) => order.status === "READY").length,
      count: active.filter((order) => order.status === "READY").length,
      type: "integer",
      icon: PackageCheck,
      color: "blue",
      trend: null,
    },
    {
      label: it.overdue,
      value: overdue.length,
      count: overdue.length,
      type: "integer",
      icon: Clock3,
      color: "orange",
      trend: null,
    },
    ...(actor.role === "OWNER"
      ? [
          {
            label: it.receipts,
            value: money(todayRevenue.total),
            count: todayRevenue.total,
            type: "money",
            icon: Wallet,
            color: "green",
            featured: true,
            trend: revenueTrend(todayRevenue.total, yesterdayRevenue.total),
          },
          {
            label: it.dashboard.repairRevenue,
            value: money(todayRevenue.repair),
            count: todayRevenue.repair,
            type: "money",
            icon: Wrench,
            color: "blue",
            trend: revenueTrend(todayRevenue.repair, yesterdayRevenue.repair),
          },
          {
            label: it.dashboard.retailRevenue,
            value: money(todayRevenue.retail),
            count: todayRevenue.retail,
            type: "money",
            icon: ShoppingBag,
            color: "orange",
            trend: revenueTrend(todayRevenue.retail, yesterdayRevenue.retail),
          },
        ]
      : []),
  ];
  const fingerprint = JSON.stringify({
    today,
    metrics: metrics.map(({ count }) => count),
    series: series.map(({ repair, retail }) => [repair, retail]),
    methods: todayRevenue.methods,
    attention: [overdue.length, lowStock.length, outOfStock.length],
    recent: [orders[0]?.updatedAt, sales[0]?.createdAt],
  });

  return (
    <DashboardMotion fingerprint={fingerprint} locale={locale}>
      <PageHeader
        title={it.today}
        description={it.dashboardDescription}
        action
      />
      <form className="date-strip dashboard-date-filter">
        <span className="live-dot" />
        <span>
          {new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "it-IT", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Europe/Rome",
          }).format(new Date(`${today}T12:00:00Z`))}
        </span>
        <input name="day" type="date" defaultValue={today} />
      </form>
      <div className="metrics dashboard-kpis">
        {metrics.map(
          ({
            label,
            value,
            count,
            type,
            icon: Icon,
            color,
            trend,
            ...metric
          }) => (
            <div
              className={`metric ${"featured" in metric ? "metric-featured" : ""}`}
              key={label}
            >
              <div className="metric-top">
                <span>{label}</span>
                <span className={`metric-icon ${color}`}>
                  <Icon size={21} />
                </span>
              </div>
              <strong data-count={count} data-count-type={type}>
                {value}
              </strong>
              {trend ? (
                <small
                  className={`metric-trend ${trend.change >= 0 ? "is-positive" : "is-negative"}`}
                >
                  <span aria-hidden="true">
                    {trend.change >= 0 ? "↑" : "↓"}
                  </span>
                  {it.dashboard.vsYesterday} {trend.label}
                </small>
              ) : label === it.receipts ? (
                <small>
                  {it.dashboard.repairRevenue} {money(todayRevenue.repair)} ·{" "}
                  {it.dashboard.retailRevenue} {money(todayRevenue.retail)}
                </small>
              ) : label === it.dashboard.repairRevenue ||
                label === it.dashboard.retailRevenue ? (
                <small>{it.today}</small>
              ) : (
                <small>{it.workspace}</small>
              )}
            </div>
          ),
        )}
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
            {hasRevenueSeries ? (
              <div className="revenue-bars">
                {series.map((day) => {
                  const dateLabel = new Intl.DateTimeFormat(
                    locale === "zh" ? "zh-CN" : "it-IT",
                    {
                      month: "2-digit",
                      day: "2-digit",
                      timeZone: "Europe/Rome",
                    },
                  ).format(new Date(`${day.day}T12:00:00Z`));
                  return (
                    <div
                      aria-label={`${dateLabel}: ${it.dashboard.repairRevenue} ${money(day.repair)}, ${it.dashboard.retailRevenue} ${money(day.retail)}, ${it.dashboard.totalRevenue} ${money(day.total)}`}
                      className="revenue-day"
                      key={day.day}
                      tabIndex={0}
                    >
                      <div className="revenue-bar-track">
                        <div
                          className="revenue-bar repair"
                          data-bar={`${(day.repair / chartMax) * 100}%`}
                          style={{
                            height: `${(day.repair / chartMax) * 100}%`,
                          }}
                        />
                        <div
                          className="revenue-bar retail"
                          data-bar={`${(day.retail / chartMax) * 100}%`}
                          style={{
                            height: `${(day.retail / chartMax) * 100}%`,
                          }}
                        />
                      </div>
                      <small>{dateLabel}</small>
                      <div className="revenue-tooltip" role="tooltip">
                        <strong>{dateLabel}</strong>
                        <span>
                          <i className="repair" />
                          {it.dashboard.repairRevenue}
                          <b>{money(day.repair)}</b>
                        </span>
                        <span>
                          <i className="retail" />
                          {it.dashboard.retailRevenue}
                          <b>{money(day.retail)}</b>
                        </span>
                        <span className="total">
                          {it.dashboard.totalRevenue}
                          <b>{money(day.total)}</b>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="dashboard-empty dashboard-chart-empty">
                <ChartNoAxesColumnIncreasing size={22} />
                <span>{it.dashboard.noRevenue}</span>
              </div>
            )}
          </section>
          <section className="panel padded revenue-source-card">
            <h2>{it.dashboard.receiptComposition}</h2>
            {todayRevenue.total ? (
              <div className="revenue-source-content">
                <div className="revenue-donut">
                  <svg aria-hidden="true" viewBox="0 0 42 42">
                    <circle className="donut-track" cx="21" cy="21" r="15.9" />
                    <circle
                      className="donut-segment repair"
                      cx="21"
                      cy="21"
                      data-donut-segment={repairShare}
                      pathLength="100"
                      r="15.9"
                      style={{
                        strokeDasharray: `${repairShare} ${100 - repairShare}`,
                      }}
                    />
                    <circle
                      className="donut-segment retail"
                      cx="21"
                      cy="21"
                      data-donut-segment={retailShare}
                      data-donut-offset={-repairShare}
                      pathLength="100"
                      r="15.9"
                      style={{
                        strokeDasharray: `${retailShare} ${100 - retailShare}`,
                        strokeDashoffset: -repairShare,
                      }}
                    />
                  </svg>
                  <span>
                    <strong
                      data-count={todayRevenue.total}
                      data-count-type="money"
                    >
                      {money(todayRevenue.total)}
                    </strong>
                    <small>{it.receipts}</small>
                  </span>
                </div>
                <div className="revenue-source-legend">
                  <p>
                    <i className="repair" />
                    <span>{it.dashboard.repairRevenue}</span>
                    <strong>{money(todayRevenue.repair)}</strong>
                    <small>{repairShare}%</small>
                  </p>
                  <p>
                    <i className="retail" />
                    <span>{it.dashboard.retailRevenue}</span>
                    <strong>{money(todayRevenue.retail)}</strong>
                    <small>{retailShare}%</small>
                  </p>
                </div>
              </div>
            ) : (
              <div className="dashboard-empty dashboard-compact-empty">
                <Inbox size={20} />
                <span>{it.dashboard.noReceipts}</span>
              </div>
            )}
          </section>
          <section className="panel padded payment-method-card">
            <h2>{it.dashboard.paymentMethods}</h2>
            {(["CASH", "CARD", "OTHER"] as const).map((method) => (
              <div className="payment-method-row" key={method}>
                <span>{it.methods[method]}</span>
                <div>
                  <i
                    data-progress={`${percentage(todayRevenue.methods[method], todayRevenue.total)}%`}
                    style={{
                      width: `${percentage(todayRevenue.methods[method], todayRevenue.total)}%`,
                    }}
                  />
                </div>
                <strong>{money(todayRevenue.methods[method])}</strong>
                <small>
                  {percentage(todayRevenue.methods[method], todayRevenue.total)}
                  %
                </small>
              </div>
            ))}
            <Link
              className="dashboard-detail-link dashboard-action-link"
              href="/reports"
            >
              <span className="dashboard-link-label">
                {it.dashboard.viewStats}
              </span>
              <span className="dashboard-link-chevron" aria-hidden="true">
                &gt;
              </span>
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
            <p className="dashboard-empty">
              <Inbox size={18} />
              {it.dashboard.noAttention}
            </p>
          )}
        </section>

        <section className="panel padded dashboard-list-card">
          <div className="section-heading">
            <h2>{it.recent}</h2>
            <Link className="dashboard-action-link" href="/orders">
              <span className="dashboard-link-label">{it.viewAll}</span>
              <span className="dashboard-link-chevron" aria-hidden="true">
                &gt;
              </span>
            </Link>
          </div>
          {orders.slice(0, 5).map((order) => (
            <Link
              className="dashboard-list-row"
              href={`/orders/${order.id}`}
              key={order.id}
            >
              <span>
                <strong>{orderCode(order.code)}</strong>
                <small>
                  {order.device.brand} {order.device.model}
                </small>
              </span>
              <Badge status={order.status} />
            </Link>
          ))}
          {!orders.length && (
            <p className="dashboard-empty">
              <Inbox size={18} />
              {it.empty}
            </p>
          )}
        </section>

        <section className="panel padded dashboard-list-card">
          <div className="section-heading">
            <h2>{it.dashboard.recentSales}</h2>
            <Link className="dashboard-action-link" href="/retail?view=sales">
              <span className="dashboard-link-label">{it.viewAll}</span>
              <span className="dashboard-link-chevron" aria-hidden="true">
                &gt;
              </span>
            </Link>
          </div>
          {sales.map((sale) => (
            <Link
              className="dashboard-list-row"
              href={`/retail?view=sale&id=${sale.id}`}
              key={sale.id}
            >
              <span>
                <strong>{saleCode(sale.code)}</strong>
                <small>{dateTime(sale.createdAt)}</small>
              </span>
              <strong>{money(cents(sale.total))}</strong>
            </Link>
          ))}
          {!sales.length && (
            <p className="dashboard-empty">
              <Inbox size={18} />
              {it.retail.noSales}
            </p>
          )}
        </section>

        <section className="panel padded dashboard-list-card">
          <div className="section-heading">
            <h2>{it.dashboard.hotProducts}</h2>
            <Link className="dashboard-action-link" href="/retail?view=sales">
              <span className="dashboard-link-label">{it.viewAll}</span>
              <span className="dashboard-link-chevron" aria-hidden="true">
                &gt;
              </span>
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
          {!hotProducts.length && (
            <p className="dashboard-empty">
              <Inbox size={18} />
              {it.empty}
            </p>
          )}
        </section>
      </div>
    </DashboardMotion>
  );
}
