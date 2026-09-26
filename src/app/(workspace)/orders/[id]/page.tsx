import { faultLabel } from "@/lib/catalog";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { orderInclude } from "@/lib/service";
import { requireActor } from "@/lib/session";
import {
  balance,
  cents,
  dateOnly,
  dateTime,
  money,
  orderCode,
  settlement,
  warrantyPeriod,
} from "@/lib/domain";
import { Badge, PageHeader } from "@/components/common";
import {
  EditOrderForm,
  EditQuoteForm,
  PaymentForm,
  QuoteSummary,
  WarrantyForm,
} from "@/components/forms";
import { getLocale, getMessages } from "@/lib/i18n-server";
import {
  WorkOrderCheckout,
  WorkOrderProducts,
} from "@/components/work-order-products";
import {
  AfterSalesActions,
  CustomerDetailLink,
  OrderDetailCard,
} from "@/components/order-detail-ui";
import { DetailStatusControl } from "@/components/order-list-controls";

type TimelineEvent = {
  id: string;
  at: Date;
  title: string;
  actor: string;
  detail?: string;
};

function auditContext(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const it = await getMessages();
  const locale = await getLocale();
  const actor = await requireActor();
  const { id } = await params;
  const [order, audits] = await Promise.all([
    db.workOrder.findUnique({ where: { id }, include: orderInclude }),
    db.auditLog.findMany({
      where: {
        entityId: id,
        action: {
          in: ["ORDER_CREATED", "AFTER_SALES_OPENED", "REFUND_ISSUED"],
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!order) notFound();
  const [rules, products] = await Promise.all([
    db.priceRule.findMany({ where: { enabled: true } }),
    db.product.findMany({
      where: { enabled: true },
      orderBy: [{ favorite: "desc" }, { name: "asc" }],
    }),
  ]);
  const totals = settlement(order.items, order);
  const remaining = balance(order.items, order.payments, order);
  const receivedTotal = order.payments.reduce(
    (sum, payment) => sum + cents(payment.amount),
    0,
  );
  const refunded = order.status === "REFUNDED";
  const received = refunded ? 0 : receivedTotal;
  const currentDue = refunded ? 0 : totals.due;
  const repairAmount = refunded
    ? 0
    : totals.due - totals.productTotal - totals.afterSalesTotal;
  const productAmount = refunded ? 0 : totals.productTotal;
  const afterSalesAmount = refunded ? 0 : totals.afterSalesTotal;
  const originalLocked =
    order.afterSalesOpen ||
    ["COMPLETED", "REWORKING", "REFUNDED", "CANCELLED"].includes(order.status);
  const warranty = warrantyPeriod(order.pickedUpAt, order.warrantyMonths);
  const duration =
    order.warrantyMonths === 0
      ? it.warranty.none
      : order.warrantyMonths === 1
        ? it.warranty.oneMonth
        : order.warrantyMonths === 3
          ? it.warranty.threeMonths
          : order.warrantyMonths === 6
            ? it.warranty.sixMonths
            : order.warrantyMonths === 12
              ? it.warranty.twelveMonths
              : `${order.warrantyMonths} ${it.warranty.months}`;

  const events: TimelineEvent[] = [];
  for (const audit of audits) {
    const context = auditContext(audit.context);
    if (audit.action === "ORDER_CREATED")
      events.push({
        id: audit.id,
        at: order.createdAt,
        title: it.actions.ORDER_CREATED,
        actor: audit.actorName,
      });
    if (audit.action === "AFTER_SALES_OPENED") {
      const detail = [context.reason, context.notes]
        .filter(Boolean)
        .join(" · ");
      events.push({
        id: audit.id,
        at: audit.createdAt,
        title: it.actions.AFTER_SALES_OPENED,
        actor: audit.actorName,
        detail,
      });
      if (context.fee && cents(String(context.fee)) > 0)
        events.push({
          id: `${audit.id}:fee`,
          at: audit.createdAt,
          title: `${it.afterSales.feeEvent} +${money(cents(String(context.fee)))}`,
          actor: audit.actorName,
        });
    }
    if (audit.action === "REFUND_ISSUED") {
      const originalMethods = Array.isArray(context.originalMethods)
        ? context.originalMethods
            .map((method) =>
              typeof method === "string" && method in it.methods
                ? it.methods[method as keyof typeof it.methods]
                : null,
            )
            .filter(Boolean)
            .join(", ")
        : "";
      events.push({
        id: audit.id,
        at: audit.createdAt,
        title: `${it.afterSales.refundEvent} ${money(cents(String(context.amount)))}`,
        actor: audit.actorName,
        detail: [
          context.method
            ? `${it.afterSales.refundMethod}: ${it.methods[context.method as keyof typeof it.methods]}`
            : null,
          originalMethods
            ? `${it.afterSales.originalMethod}: ${originalMethods}`
            : null,
          context.reason,
        ]
          .filter(Boolean)
          .join(" · "),
      });
      events.push({
        id: `${audit.id}:status`,
        at: new Date(audit.createdAt.getTime() + 1),
        title: `${it.actions.STATUS_CHANGED}: ${it.status.REFUNDED}`,
        actor: audit.actorName,
      });
    }
  }
  for (const history of order.history) {
    if (
      !history.from ||
      history.to === "REWORKING" ||
      history.to === "REFUNDED"
    )
      continue;
    events.push({
      id: history.id,
      at: history.createdAt,
      title:
        history.to === "COMPLETED"
          ? it.actions.ORDER_DELIVERED
          : `${it.actions.STATUS_CHANGED}: ${it.status[history.to]}`,
      actor: history.actorName,
      detail: history.note,
    });
  }
  for (const payment of order.payments) {
    if (payment.kind === "REFUND") continue;
    events.push({
      id: payment.id,
      at: payment.receivedAt,
      title: `${
        payment.kind === "AFTER_SALES"
          ? it.afterSales.paymentEvent
          : it.actions.PAYMENT_ADDED
      } ${money(cents(payment.amount))}`,
      actor: payment.actorName,
      detail: it.methods[payment.method],
    });
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <>
      <Link className="button button-outline back-link" href="/orders">
        ← {it.nav.orders}
      </Link>
      <PageHeader
        title={orderCode(order.code)}
        description={`${order.device.brand} ${order.device.model} · ${order.device.customer.name}`}
      />
      <div className="detail-status">
        <DetailStatusControl
          id={id}
          status={order.status}
          customerName={order.customerName || order.device.customer.name}
          due={currentDue}
          paid={received}
          balance={remaining}
        />
        <span>
          {it.created}: {dateTime(order.createdAt)}
        </span>
        <span>
          {it.dueDate}: {dateOnly(order.afterSalesDueDate ?? order.dueDate)}
        </span>
      </div>
      {order.status === "COMPLETED" && (
        <p className="order-lock-notice">{it.lockedDelivered}</p>
      )}
      {order.status === "REFUNDED" && (
        <p className="order-lock-notice refunded">{it.lockedRefunded}</p>
      )}
      <div className="detail-grid">
        <div className="stack">
          <OrderDetailCard
            title={it.details}
            locked={originalLocked}
            testId="details-card"
            edit={
              <EditOrderForm
                id={id}
                values={{
                  fault: order.fault,
                  notes: order.notes,
                  accessories: order.accessories,
                  dueDate: order.dueDate,
                }}
              />
            }
          >
            <dl className="detail-list">
              <div>
                <dt>{it.customer}</dt>
                <dd>
                  <CustomerDetailLink
                    href={`/customers/${order.device.customerId}`}
                    name={order.device.customer.name}
                  />
                </dd>
              </div>
              <div>
                <dt>{it.phone}</dt>
                <dd>
                  <a href={`tel:${order.device.customer.phone}`}>
                    {order.device.customer.phone}
                  </a>
                </dd>
              </div>
              <div>
                <dt>{it.fault}</dt>
                <dd>{faultLabel(order.fault, locale)}</dd>
              </div>
              <div>
                <dt>{it.dueDate}</dt>
                <dd>{dateOnly(order.dueDate)}</dd>
              </div>
              <div>
                <dt>{it.notes}</dt>
                <dd>{order.notes || "—"}</dd>
              </div>
            </dl>
            {order.pickedUpAt && (
              <p className="message success">
                {it.delivered}: {order.pickedUpBy} ·{" "}
                {dateTime(order.pickedUpAt)}
              </p>
            )}
          </OrderDetailCard>

          <WorkOrderProducts
            orderId={id}
            closed={originalLocked}
            products={products.map((product) => ({
              id: product.id,
              name: product.name,
              category: product.category,
              usage: product.usage,
              salePrice: product.salePrice.toString(),
              stock: product.stockQuantity,
            }))}
            lines={order.products.map((line) => ({
              id: line.id,
              productName: line.productName,
              kind: line.kind,
              unitPrice: line.unitPrice.toString(),
              quantity: line.quantity,
              consumedAt: line.consumedAt?.toISOString() ?? null,
            }))}
          />

          <OrderDetailCard
            title={it.quote}
            locked={originalLocked}
            testId="quote-card"
            edit={
              <EditQuoteForm
                key={order.updatedAt.toISOString()}
                id={id}
                initialDiscount={order.orderDiscount.toString()}
                initialVat={order.includeVat}
                initial={order.items.map((item) => ({
                  project: item.project,
                  final: item.final.toString(),
                  discount: item.discount.toString(),
                  adjustmentReason: item.adjustmentReason,
                }))}
                device={{
                  category: order.device.category,
                  brand: order.device.brand,
                  series: order.device.series,
                  model: order.device.model,
                }}
                owner={actor.role === "OWNER"}
                rules={rules.map((rule) => ({
                  ...rule,
                  suggested: rule.suggested.toString(),
                  cost: undefined,
                  updatedAt: undefined,
                }))}
              />
            }
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{it.project}</th>
                    <th>{it.suggested}</th>
                    <th>{it.final}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.project}</strong>
                        <small>
                          {it.levels[item.matchLevel as keyof typeof it.levels]}{" "}
                          · {item.minutes} min
                        </small>
                        {item.adjustmentReason && (
                          <small>{item.adjustmentReason}</small>
                        )}
                      </td>
                      <td>
                        {item.suggested === null
                          ? "—"
                          : money(cents(item.suggested))}
                      </td>
                      <td>{money(cents(item.final))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <QuoteSummary
              items={order.items.map((item) => ({
                final: item.final.toString(),
                discount: item.discount.toString(),
              }))}
              orderDiscount={order.orderDiscount.toString()}
              includeVat={order.includeVat}
            />
          </OrderDetailCard>

          <OrderDetailCard
            title={it.warranty.title}
            locked={originalLocked}
            testId="warranty-card"
            edit={
              <WarrantyForm
                id={id}
                values={{
                  months: order.warrantyMonths,
                  scope: order.warrantyScope,
                  notes: order.warrantyNotes,
                }}
              />
            }
          >
            <dl className="detail-list warranty-details">
              {order.pickedUpAt && order.warrantyMonths > 0 && (
                <div>
                  <dt>{it.warranty.status}</dt>
                  <dd>
                    {warranty?.active
                      ? it.warranty.active
                      : it.warranty.expired}
                  </dd>
                </div>
              )}
              <div>
                <dt>{it.warranty.duration}</dt>
                <dd>{duration}</dd>
              </div>
              <div>
                <dt>{it.warranty.period}</dt>
                <dd>
                  {warranty
                    ? `${warranty.start.replaceAll("-", "/")} → ${warranty.end.replaceAll("-", "/")}`
                    : it.warranty.startsAfterDelivery}
                </dd>
              </div>
              <div>
                <dt>{it.warranty.scope}</dt>
                <dd>{order.warrantyScope || "—"}</dd>
              </div>
              {order.warrantyNotes && (
                <div>
                  <dt>{it.warranty.notes}</dt>
                  <dd>{order.warrantyNotes}</dd>
                </div>
              )}
            </dl>
          </OrderDetailCard>

          <OrderDetailCard
            title={it.history}
            locked
            className="history-card"
            testId="history-card"
          >
            <ol className="timeline">
              {events.map((event) => (
                <li key={event.id}>
                  <span className="timeline-dot" />
                  <strong>{event.title}</strong>
                  <small>
                    {dateTime(event.at)} · {event.actor}
                  </small>
                  {event.detail && <p>{event.detail}</p>}
                </li>
              ))}
            </ol>
          </OrderDetailCard>
        </div>

        <div className="stack">
          <section className="panel padded balance-card">
            <span>{it.balance}</span>
            <strong>{money(remaining)}</strong>
            <div>
              <span>
                {it.orderProducts.repairAmount}: {money(repairAmount)}
              </span>
              <span>
                {it.orderProducts.retailAddons}: {money(productAmount)}
              </span>
              {afterSalesAmount > 0 && (
                <span>
                  {it.afterSales.feeEvent}: {money(afterSalesAmount)}
                </span>
              )}
              <span>
                {it.total}: {money(currentDue)}
              </span>
              <span>
                {it.paid}: {money(received)}
              </span>
            </div>
          </section>

          {order.status === "READY" && (
            <section className="panel padded status-operation-card">
              <h2>{it.orderProducts.checkout}</h2>
              <WorkOrderCheckout
                orderId={id}
                due={currentDue}
                paid={received}
                remaining={remaining}
                customerName={order.customerName || order.device.customer.name}
              />
            </section>
          )}

          {["COMPLETED", "REFUNDED"].includes(order.status) && (
            <section className="panel padded current-status-card">
              <h2>{it.currentStatus}</h2>
              <Badge status={order.status} />
              {order.pickedUpAt && <p>{dateTime(order.pickedUpAt)}</p>}
            </section>
          )}

          <section className="panel padded payments-card">
            <h2>{it.payments}</h2>
            {order.payments.length ? (
              order.payments.map((payment) => (
                <div
                  className={`payment-row ${payment.kind === "REFUND" ? "is-refund" : ""}`}
                  key={payment.id}
                >
                  <strong>{money(cents(payment.amount))}</strong>
                  <span>
                    {it.kinds[payment.kind]} · {it.methods[payment.method]}
                  </span>
                  <small>
                    {dateTime(payment.receivedAt)} · {payment.actorName}
                  </small>
                </div>
              ))
            ) : (
              <p className="muted">{it.noPayments}</p>
            )}
            {remaining > 0 &&
              !["READY", "COMPLETED", "REFUNDED", "CANCELLED"].includes(
                order.status,
              ) && (
                <PaymentForm key={remaining} id={id} remaining={remaining} />
              )}
          </section>

          {order.status === "COMPLETED" && (
            <AfterSalesActions orderId={id} received={receivedTotal} />
          )}
        </div>
      </div>
    </>
  );
}
