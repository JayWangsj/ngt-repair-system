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
  total,
} from "@/lib/domain";
import { Badge, PageHeader } from "@/components/common";
import {
  ConfirmForm,
  EditOrderForm,
  EditQuoteForm,
  PaymentForm,
  StatusForm,
} from "@/components/forms";
import { it } from "@/messages/it";
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
  const remaining = balance(order.items, order.payments);
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
                <dd>{order.fault}</dd>
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
            <div className="quote-total">
              <span>{it.total}</span>
              <strong>{money(total(order.items))}</strong>
            </div>
            <p
              className={`message ${order.confirmedAt ? "success" : "warning"}`}
            >
              {order.confirmedAt
                ? `${it.confirmed} · ${dateTime(order.confirmedAt)} · ${order.confirmationNote}`
                : it.notConfirmed}
            </p>
            {!closed && (
              <>
                {!order.confirmedAt && <ConfirmForm id={id} />}
                <details>
                  <summary>{it.editQuote}</summary>
                  <EditQuoteForm
                    key={order.updatedAt.toISOString()}
                    id={id}
                    initial={order.items.map((i) => ({
                      project: i.project,
                      final: i.final.toString(),
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
                {it.total}: {money(total(order.items))}
              </span>
              <span>
                {it.paid}: {money(total(order.items) - remaining)}
              </span>
            </div>
          </section>
          {!closed && (
            <section className="panel padded">
              <h2>{it.updateStatus}</h2>
              <StatusForm
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
