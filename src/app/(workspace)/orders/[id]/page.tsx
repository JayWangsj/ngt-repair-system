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
} from "@/lib/domain";
import { Badge, PageHeader } from "@/components/common";
import {
  EditOrderForm,
  EditQuoteForm,
  PaymentForm,
  StatusForm,
  QuoteSummary,
} from "@/components/forms";
import { getLocale, getMessages } from "@/lib/i18n-server";
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const it = await getMessages();
  const actor = await requireActor();
  const { id } = await params;
  const order = await db.workOrder.findUnique({
    where: { id },
    include: orderInclude,
  });
  if (!order) notFound();
  const [rules, logs] = await Promise.all([
    db.priceRule.findMany({ where: { enabled: true } }),
    db.auditLog.findMany({
      where: { entityId: id },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const remaining = balance(order.items, order.payments, order);
  const closed = ["COMPLETED", "CANCELLED"].includes(order.status);
  return (
    <>
      <Link className="back-link" href="/orders">
        ← {it.nav.orders}
      </Link>
      <PageHeader
        title={orderCode(order.number)}
        description={`${order.device.brand} ${order.device.model} · ${order.device.customer.name}`}
      />
      <div className="detail-status">
        <Badge status={order.status} />
        <span>
          {it.created}: {dateTime(order.createdAt)}
        </span>
        <span>
          {it.dueDate}: {dateOnly(order.dueDate)}
        </span>
      </div>
      <div className="detail-grid">
        <div className="stack">
          <section className="panel padded">
            <div className="section-heading">
              <h2>{it.details}</h2>
              <Link href={`/customers/${order.device.customerId}`}>
                {it.customer} ↗
              </Link>
            </div>
            <dl className="detail-list">
              <div>
                <dt>{it.phone}</dt>
                <dd>{order.device.customer.phone}</dd>
              </div>
              <div>
                <dt>{it.imei}</dt>
                <dd>{order.device.imei ?? "—"}</dd>
              </div>
              <div>
                <dt>{it.fault}</dt>
                <dd>{faultLabel(order.fault, await getLocale())}</dd>
              </div>
              <div>
                <dt>{it.appearance}</dt>
                <dd>{order.appearance || "—"}</dd>
              </div>
              <div>
                <dt>{it.accessories}</dt>
                <dd>{order.accessories || "—"}</dd>
              </div>
              <div>
                <dt>{it.notes}</dt>
                <dd>{order.notes || "—"}</dd>
              </div>
            </dl>
            {!closed && (
              <details>
                <summary>{it.edit}</summary>
                <EditOrderForm
                  id={id}
                  values={{
                    fault: order.fault,
                    notes: order.notes,
                    appearance: order.appearance,
                    accessories: order.accessories,
                    dueDate: order.dueDate,
                  }}
                />
              </details>
            )}
            {order.pickedUpAt && (
              <p className="message success">
                {it.delivered}: {order.pickedUpBy} ·{" "}
                {dateTime(order.pickedUpAt)}
              </p>
            )}
          </section>
          <section className="panel padded">
            <h2>{it.quote}</h2>
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
              items={order.items.map((i) => ({
                final: i.final.toString(),
                discount: i.discount.toString(),
              }))}
              orderDiscount={order.orderDiscount.toString()}
              includeVat={order.includeVat}
            />

            {!closed && (
              <>
                <details>
                  <summary>{it.editQuote}</summary>
                  <EditQuoteForm
                    key={order.updatedAt.toISOString()}
                    id={id}
                    initialDiscount={order.orderDiscount.toString()}
                    initialVat={order.includeVat}
                    initial={order.items.map((i) => ({
                      project: i.project,
                      final: i.final.toString(),
                      discount: i.discount.toString(),
                      adjustmentReason: i.adjustmentReason,
                    }))}
                    device={{
                      brand: order.device.brand,
                      series: order.device.series,
                      model: order.device.model,
                    }}
                    owner={actor.role === "OWNER"}
                    rules={rules.map((r) => ({
                      ...r,
                      suggested: r.suggested.toString(),
                      cost: undefined,
                      updatedAt: undefined,
                    }))}
                  />
                </details>
              </>
            )}
          </section>
          <section className="panel padded">
            <h2>{it.history}</h2>
            <ol className="timeline">
              {order.history.map((h) => (
                <li key={h.id}>
                  <span className="timeline-dot" />
                  <strong>{it.status[h.to]}</strong>
                  <small>
                    {dateTime(h.createdAt)} · {h.actorName}
                  </small>
                  {h.note && <p>{h.note}</p>}
                </li>
              ))}
            </ol>
            <details>
              <summary>{it.audit}</summary>
              {logs.map((log) => (
                <div className="audit-row" key={log.id}>
                  <strong>
                    {it.actions[log.action as keyof typeof it.actions] ??
                      log.action}
                  </strong>
                  <small>
                    {dateTime(log.createdAt)} · {log.actorName}
                  </small>
                  {log.action === "QUOTE_UPDATED" && (
                    <pre>{JSON.stringify(log.context, null, 2)}</pre>
                  )}
                </div>
              ))}
            </details>
          </section>
        </div>
        <div className="stack">
          <section className="panel padded balance-card">
            <span>{it.balance}</span>
            <strong>{money(remaining)}</strong>
            <div>
              <span>
                {it.total}: {money(settlement(order.items, order).due)}
              </span>
              <span>
                {it.paid}:{" "}
                {money(settlement(order.items, order).due - remaining)}
              </span>
            </div>
          </section>
          {!closed && (
            <section className="panel padded">
              <h2>{it.updateStatus}</h2>
              <StatusForm
                customerName={order.customerName || order.device.customer.name}
                key={order.status}
                id={id}
                status={order.status}
                remaining={remaining}
                owner={actor.role === "OWNER"}
              />
            </section>
          )}
          <section className="panel padded">
            <h2>{it.payments}</h2>
            {order.payments.length ? (
              order.payments.map((p) => (
                <div className="payment-row" key={p.id}>
                  <strong>{money(cents(p.amount))}</strong>
                  <span>
                    {it.kinds[p.kind]} · {it.methods[p.method]}
                  </span>
                  <small>
                    {dateTime(p.receivedAt)} · {p.actorName}
                  </small>
                </div>
              ))
            ) : (
              <p className="muted">{it.noPayments}</p>
            )}
            {remaining > 0 && order.status !== "CANCELLED" && (
              <PaymentForm key={remaining} id={id} remaining={remaining} />
            )}
          </section>
        </div>
      </div>
    </>
  );
}
