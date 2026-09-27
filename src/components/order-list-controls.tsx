"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setPaidTotalAction,
  statusAction,
  updateDueDateAction,
} from "@/app/actions";
import {
  dateOnly,
  decimal,
  money,
  romeDay,
  transitions,
  type OrderStatus,
} from "@/lib/domain";
import { useMessages } from "./language";
import { StatusDropdown } from "./status-dropdown";
import { WorkOrderCheckoutDialog } from "./work-order-products";
import { Field, FormDialog } from "./forms";
import { Button } from "./ui/button";

export type OrderListRow = {
  id: string;
  code: string;
  customerId: string;
  customerName: string;
  brand: string;
  model: string;
  projects: string;
  status: OrderStatus;
  dueDate: string;
  overdue: boolean;
  due: number;
  paid: number;
  balance: number;
};

function StaticStatus({ status }: { status: OrderStatus }) {
  const it = useMessages();
  return (
    <span className={`badge status-${status.toLowerCase()}`}>
      <span />
      {it.status[status]}
    </span>
  );
}

function StatusControl({
  row,
  active,
}: {
  row: Pick<
    OrderListRow,
    "id" | "status" | "customerName" | "due" | "paid" | "balance"
  >;
  active: boolean;
}) {
  const it = useMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const choices = transitions[row.status].filter(
    (status) => !["REWORKING", "REFUNDED"].includes(status),
  );
  if (!active) return <StaticStatus status={row.status} />;
  return (
    <div className="inline-order-control">
      <StatusDropdown
        value={row.status}
        label={it.status[row.status]}
        options={choices.map((status) => ({
          value: status,
          label: it.status[status],
        }))}
        disabled={pending}
        readonly={choices.length === 0}
        onChange={(next) => {
          if (next === "COMPLETED") {
            setCheckoutOpen(true);
            return;
          }
          if (next === "CANCELLED") {
            setCancelOpen(true);
            return;
          }
          startTransition(async () => {
            const result = await statusAction(row.id, {
              status: next,
              note: "",
              pickedUpBy: "",
            });
            if (!result.ok) return setError(result.error);
            setError("");
            router.refresh();
          });
        }}
      />
      {error && <small className="inline-control-error">{error}</small>}
      <WorkOrderCheckoutDialog
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        orderId={row.id}
        due={row.due}
        paid={row.paid}
        remaining={row.balance}
        customerName={row.customerName}
      />
      {cancelOpen && (
        <FormDialog
          title={it.cancelOrder}
          subtitle={it.cancelOrderWarning}
          onClose={() => setCancelOpen(false)}
        >
          <form
            className="dialog-form"
            data-form-dialog-body
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await statusAction(row.id, {
                  status: "CANCELLED",
                  note: cancelReason,
                  pickedUpBy: "",
                });
                if (!result.ok) return setError(result.error);
                setCancelOpen(false);
                setError("");
                router.refresh();
              });
            }}
          >
            <Field label={it.cancelReasonOptional}>
              <textarea
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                maxLength={2000}
              />
            </Field>
            <div className="dialog-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCancelOpen(false)}
              >
                {it.cancel}
              </Button>
              <Button variant="danger" disabled={pending}>
                {it.confirmCancelOrder}
              </Button>
            </div>
          </form>
        </FormDialog>
      )}
    </div>
  );
}

export function DetailStatusControl({
  id,
  status,
  customerName,
  due,
  paid,
  balance,
}: Pick<
  OrderListRow,
  "id" | "status" | "customerName" | "due" | "paid" | "balance"
>) {
  return (
    <div className="detail-status-control">
      <StatusControl
        row={{ id, status, customerName, due, paid, balance }}
        active
      />
    </div>
  );
}

function DueDateControl({
  row,
  active,
}: {
  row: OrderListRow;
  active: boolean;
}) {
  const it = useMessages();
  const router = useRouter();
  const [value, setValue] = useState(row.dueDate);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const closed = ["COMPLETED", "REFUNDED", "CANCELLED"].includes(row.status);
  if (!active || closed)
    return (
      <div className="order-static-value">
        <span>{dateOnly(row.dueDate || null)}</span>
        {row.overdue && <small>{it.overdue}</small>}
      </div>
    );
  function save() {
    if (value === row.dueDate) return;
    startTransition(async () => {
      const result = await updateDueDateAction(row.id, value);
      if (!result.ok) return setError(result.error);
      setError("");
      router.refresh();
    });
  }
  return (
    <div className="inline-order-control">
      <input
        className="order-due-input"
        aria-label={it.dueDate}
        type="date"
        min={romeDay()}
        value={value}
        disabled={pending}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
      />
      {error && <small className="inline-control-error">{error}</small>}
    </div>
  );
}

function PaymentControl({
  row,
  active,
}: {
  row: OrderListRow;
  active: boolean;
}) {
  const it = useMessages();
  const router = useRouter();
  const [value, setValue] = useState(decimal(row.paid));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  function save() {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed) && Math.round(parsed * 100) === row.paid)
      return;
    startTransition(async () => {
      const result = await setPaidTotalAction(row.id, {
        requestId: crypto.randomUUID(),
        amount: value,
        method: "CASH",
      });
      if (!result.ok) return setError(result.error);
      setError("");
      router.refresh();
    });
  }
  return (
    <div className="order-payment-values">
      <span>
        <small>{it.total}</small>
        <strong>{money(row.due)}</strong>
      </span>
      <span>
        <small>{it.paid}</small>
        {active &&
        !["COMPLETED", "REFUNDED", "CANCELLED"].includes(row.status) ? (
          <input
            aria-label={it.paid}
            value={value}
            inputMode="decimal"
            disabled={pending}
            onChange={(event) => setValue(event.target.value)}
            onBlur={save}
          />
        ) : (
          <strong>{money(row.paid)}</strong>
        )}
      </span>
      <span className="order-balance-value">
        <small>{it.balance}</small>
        <strong>{money(row.balance)}</strong>
      </span>
      {error && <small className="inline-control-error">{error}</small>}
    </div>
  );
}

export function OrderListBody({
  rows,
  hideCustomer = false,
  compact = false,
}: {
  rows: OrderListRow[];
  hideCustomer?: boolean;
  compact?: boolean;
}) {
  const [activeId, setActiveId] = useState("");
  const body = useRef<HTMLTableSectionElement>(null);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!body.current?.contains(event.target as Node))
        requestAnimationFrame(() => setActiveId(""));
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return (
    <tbody className="order-list-body" ref={body}>
      {rows.map((row) => {
        const active = row.id === activeId;
        return (
          <tr
            key={row.id}
            className={active ? "order-row-active" : ""}
            onClick={() => setActiveId(row.id)}
          >
            <td>
              <Link
                className="order-link order-code-link"
                href={`/orders/${row.id}`}
                onClick={(event) => event.stopPropagation()}
              >
                <span>{row.code}</span>
                <ChevronRight size={15} aria-hidden="true" />
              </Link>
            </td>
            {!hideCustomer && (
              <td>
                <Link
                  className="order-link order-customer-link"
                  href={`/customers/${row.customerId}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <span>{row.customerName}</span>
                  <ChevronRight size={15} aria-hidden="true" />
                </Link>
              </td>
            )}
            <td>
              <strong>
                {row.brand} {row.model}
              </strong>
              <small className={compact ? "order-project-summary" : undefined}>
                {row.projects}
              </small>
            </td>
            <td className="order-inline-edit-cell">
              <StatusControl row={row} active={active} />
            </td>
            <td
              className={`order-inline-edit-cell${row.overdue ? " danger-text" : ""}`}
            >
              <DueDateControl key={row.dueDate} row={row} active={active} />
            </td>
            <td className="numeric order-inline-edit-cell">
              <PaymentControl key={row.paid} row={row} active={active} />
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}
