import { faultLabel } from "@/lib/catalog";
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
  warrantyProgress,
} from "@/lib/domain";
import { BackButton, Badge, PageHeader } from "@/components/common";
import {
  EditOrderForm,
  EditQuoteForm,
  ConfirmForm,
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
import { CompleteInspectionButton } from "@/components/inspection-quote";

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
          in: [
            "ORDER_CREATED",
            "INSPECTION_STARTED",
            "INSPECTION_COMPLETED",
            "QUOTE_CREATED",
            "AFTER_SALES_OPENED",
            "REFUND_ISSUED",
            "STATUS_CHANGED",
          ],
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!order) notFound();
  const [
    rules,
    products,
    customers,
    faultOptions,
    productCategories,
    reservations,
  ] = await Promise.all([
    db.priceRule.findMany({ where: { enabled: true } }),
    db.product.findMany({
      where: { enabled: true },
      orderBy: [{ favorite: "desc" }, { name: "asc" }],
    }),
    db.customer.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        phones: { select: { phone: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.faultOption.findMany({
      select: {
        id: true,
        category: true,
        name: true,
        note: true,
        hidden: true,
        sortOrder: true,
        _count: { select: { orders: true } },
      },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    }),
    db.inventoryCategory.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, repairOnly: true },
      orderBy: { name: "asc" },
    }),
    db.workOrderProduct.groupBy({
      by: ["productId"],
      where: {
        kind: "REPAIR_PART",
        consumedAt: null,
        order: {
          status: { notIn: ["COMPLETED", "REFUNDED", "CANCELLED"] },
        },
      },
      _sum: { quantity: true },
    }),
  ]);
  const reservedByProduct = new Map(
    reservations.map((entry) => [entry.productId, entry._sum.quantity ?? 0]),
  );
  const totals = settlement(order.items, order);
  const remaining = balance(order.items, order.payments, order);
  const receivedTotal = order.payments.reduce(
    (sum, payment) => sum + cents(payment.amount),
    0,
  );
  const financiallyClosed = ["REFUNDED", "CANCELLED"].includes(order.status);
  const received = financiallyClosed ? 0 : receivedTotal;
  const currentDue = financiallyClosed ? 0 : totals.due;
  const repairAmount = financiallyClosed
    ? 0
    : totals.due - totals.productTotal - totals.afterSalesTotal;
  const productAmount = financiallyClosed ? 0 : totals.productTotal;
  const afterSalesAmount = financiallyClosed ? 0 : totals.afterSalesTotal;
  const originalLocked =
    order.afterSalesOpen ||
    ["COMPLETED", "REWORKING", "REFUNDED", "CANCELLED"].includes(order.status);
  const warrantyDays =
    order.warrantyDays ||
    ({ 1: 30, 3: 90, 6: 180, 12: 365 }[order.warrantyMonths] ??
      order.warrantyMonths * 30);
  const warranty = warrantyPeriod(order.pickedUpAt, warrantyDays);
  const reworkWarranty = warrantyProgress(order.pickedUpAt, warrantyDays);
  const originalProjectNames = new Set(
    order.items.map((item) => item.project.trim().toLocaleLowerCase()),
  );
  const catalogProjects = [
    ...new Map(
      rules
        .filter(
          (rule) =>
            !originalProjectNames.has(rule.project.trim().toLocaleLowerCase()),
        )
        .map((rule) => [rule.project.trim().toLocaleLowerCase(), rule]),
    ).values(),
  ];
  const duration = warrantyDays
    ? `${warrantyDays} ${it.warranty.days}`
    : it.warranty.none;

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
    if (audit.action === "INSPECTION_STARTED")
      events.push({
        id: audit.id,
        at: audit.createdAt,
        title: it.actions.INSPECTION_STARTED,
        actor: audit.actorName,
        detail: `${it.diagnosticFee}: ${money(cents(String(context.fee ?? "0")))}`,
      });
    if (audit.action === "INSPECTION_COMPLETED")
      events.push({
        id: audit.id,
        at: audit.createdAt,
        title: it.actions.INSPECTION_COMPLETED,
        actor: audit.actorName,
        detail: String(context.result ?? ""),
      });
    if (audit.action === "QUOTE_CREATED")
      events.push({
        id: audit.id,
        at: audit.createdAt,
        title: it.actions.QUOTE_CREATED,
        actor: audit.actorName,
      });
    if (audit.action === "AFTER_SALES_OPENED") {
      const treatment =
        context.treatment === "WARRANTY"
          ? it.afterSales.warrantyTreatment
          : it.afterSales.paidTreatment;
      const detail = [
        `${String(context.project ?? context.reason)} · ${treatment} · ${money(cents(String(context.fee ?? "0")))}`,
        context.notes ? `${it.afterSales.notes}: ${context.notes}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      events.push({
        id: audit.id,
        at: audit.createdAt,
        title: it.actions.AFTER_SALES_OPENED,
        actor: audit.actorName,
        detail,
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
    if (audit.action === "STATUS_CHANGED" && context.to === "CANCELLED")
      events.push({
        id: audit.id,
        at: audit.createdAt,
        title: `${it.actions.STATUS_CHANGED}: ${it.status.CANCELLED}`,
        actor: audit.actorName,
        detail: [
          `${it.total}: ${money(cents(String(context.originalDue ?? "0")))}`,
          `${it.paid}: ${money(cents(String(context.originalReceived ?? "0")))}`,
          context.reason,
        ]
          .filter(Boolean)
          .join(" · "),
      });
  }
  for (const history of order.history) {
    if (
      !history.from ||
      history.to === "REWORKING" ||
      history.to === "REFUNDED" ||
      history.to === "CANCELLED"
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
      <BackButton href="/orders" label={it.nav.orders} />
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
      {order.status === "CANCELLED" && (
        <p className="order-lock-notice">{it.lockedCancelled}</p>
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
                customers={customers}
                faultOptions={faultOptions.map(({ _count, ...fault }) => ({
                  ...fault,
                  usageCount: _count.orders,
                }))}
                values={{
                  customerId: order.device.customerId,
                  category: order.device.category,
                  fault: order.fault,
                  faultNote: order.faultNote,
                  standardFaultIds: order.faults
                    .filter((fault) => !fault.custom)
                    .flatMap((fault) =>
                      fault.catalogId ? [fault.catalogId] : [],
                    ),
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
                <dd>
                  {order.inspectionMode && !order.inspectionResult
                    ? it.inspectionPending
                    : faultLabel(order.fault, locale)}
                </dd>
              </div>
              {order.faultNote && (
                <div>
                  <dt>{it.faultNotes}</dt>
                  <dd>{order.faultNote}</dd>
                </div>
              )}
              {order.inspectionResult && (
                <div>
                  <dt>{it.inspectionResult}</dt>
                  <dd>{order.inspectionResult}</dd>
                </div>
              )}
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
            title={
              order.status === "DIAGNOSING" ? it.inspectionAndQuote : it.quote
            }
            locked={originalLocked || order.status === "DIAGNOSING"}
            testId="quote-card"
            edit={
              order.status !== "DIAGNOSING" ? (
                <EditQuoteForm
                  key={order.updatedAt.toISOString()}
                  id={id}
                  initialDiscount={order.orderDiscount.toString()}
                  initialVat={order.includeVat}
                  inspectionFee={order.inspectionFee.toString()}
                  initial={order.items.map((item) => ({
                    project: item.project,
                    final: item.final.toString(),
                    discount: item.discount.toString(),
                    adjustmentReason: item.adjustmentReason,
                    requiredProductId: item.requiredProductId ?? "",
                    requiredQuantity: item.requiredQuantity,
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
                  products={products.map((product) => ({
                    id: product.id,
                    name: product.name,
                    category: product.category,
                    stock: product.stockQuantity,
                    reserved: reservedByProduct.get(product.id) ?? 0,
                    available: Math.max(
                      0,
                      product.stockQuantity -
                        (reservedByProduct.get(product.id) ?? 0),
                    ),
                  }))}
                  productCategories={productCategories}
                />
              ) : undefined
            }
          >
            {order.status === "DIAGNOSING" ? (
              <div className="inspection-detail">
                <div className="inspection-banner">
                  <span aria-hidden="true">⌕</span>
                  <div>
                    <strong>{it.inspectionInProgress}</strong>
                    <p>{it.inspectionDetailHelp}</p>
                  </div>
                </div>
                <dl className="quote-summary">
                  <div>
                    <dt>{it.inspectionFeeNet}</dt>
                    <dd>{money(cents(order.inspectionFee))}</dd>
                  </div>
                  <div>
                    <dt>{it.vatAmount}</dt>
                    <dd>{money(totals.vat)}</dd>
                  </div>
                  <div>
                    <dt>{it.includeVat}</dt>
                    <dd>{order.includeVat ? it.yes : it.no}</dd>
                  </div>
                  <div>
                    <dt>{it.total}</dt>
                    <dd>{money(totals.due)}</dd>
                  </div>
                </dl>
                <CompleteInspectionButton
                  orderId={id}
                  inspectionFee={order.inspectionFee.toString()}
                  device={{
                    category: order.device.category,
                    brand: order.device.brand,
                    series: order.device.series,
                    model: order.device.model,
                  }}
                  rules={rules.map((rule) => ({
                    ...rule,
                    suggested: rule.suggested.toString(),
                    cost: undefined,
                    updatedAt: undefined,
                  }))}
                />
              </div>
            ) : (
              <>
                {order.inspectionMode && (
                  <p className="inspection-fee-line">
                    <span>{it.inspectionFeeNet}</span>
                    <strong>{money(cents(order.inspectionFee))}</strong>
                  </p>
                )}
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
                              {
                                it.levels[
                                  item.matchLevel as keyof typeof it.levels
                                ]
                              }{" "}
                              · {item.minutes} min
                            </small>
                            {item.adjustmentReason && (
                              <small>{item.adjustmentReason}</small>
                            )}
                            {item.requiredProduct && (
                              <small>
                                {it.requiredPart}: {item.requiredProduct.name} ·{" "}
                                {it.inventory.currentStock}:{" "}
                                {item.requiredProduct.stockQuantity}
                              </small>
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
                  inspectionFee={order.inspectionFee.toString()}
                />
              </>
            )}
          </OrderDetailCard>

          <OrderDetailCard
            title={it.warranty.title}
            locked={originalLocked}
            testId="warranty-card"
            edit={
              <WarrantyForm
                id={id}
                values={{
                  days: warrantyDays,
                  scope: order.warrantyScope,
                  notes: order.warrantyNotes,
                }}
              />
            }
          >
            <dl className="detail-list warranty-details">
              {order.pickedUpAt && warrantyDays > 0 && (
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
              {totals.inspectionTotal > 0 && (
                <span>
                  {it.inspectionFeeLabel}: {money(totals.inspectionTotal)}
                </span>
              )}
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

          {order.status === "WAITING_APPROVAL" && (
            <section className="panel padded status-operation-card">
              <h2>{it.confirm}</h2>
              <p className="muted">{it.customerApprovalHelp}</p>
              <ConfirmForm id={id} />
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
            <AfterSalesActions
              orderId={id}
              received={receivedTotal}
              warranty={reworkWarranty}
              originalProjects={order.items.map((item) => ({
                value: `original:${item.id}`,
                id: item.ruleId ?? item.id,
                name: item.project,
                source: "original",
                price: money(cents(item.final)),
              }))}
              catalogProjects={catalogProjects.map((rule) => ({
                value: `catalog:${rule.id}`,
                id: rule.id,
                name: rule.project,
                source: "catalog",
                price: money(cents(rule.suggested)),
                description: rule.notes,
              }))}
            />
          )}
        </div>
      </div>
    </>
  );
}
