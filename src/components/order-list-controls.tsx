"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPaidTotalAction, updateDueDateAction } from "@/app/actions";
import {
  dateOnly,
  decimal,
  money,
  romeDay,
  type OrderStatus,
} from "@/lib/domain";
import { useMessages } from "./language";
import { StatusDropdown, type StatusDropdownOrder } from "./status-dropdown";

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

function StatusControl({
  row,
  active,
  onSettled,
}: {
  row: Pick<
    OrderListRow,
    "id" | "status" | "customerName" | "due" | "paid" | "balance"
  >;
  active: boolean;
  onSettled?: (order: StatusDropdownOrder) => void;
}) {
  return (
    <StatusDropdown
      key={`${row.status}:${row.due}:${row.paid}:${row.balance}`}
      order={row}
      active={active}
      onSettled={onSettled}
    />
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
  const [settledRows, setSettledRows] = useState<
    Record<string, { before: StatusDropdownOrder; after: StatusDropdownOrder }>
  >({});
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
      {rows.map((sourceRow) => {
        const settled = settledRows[sourceRow.id];
        const sourceIsUnchanged =
          settled &&
          settled.before.status === sourceRow.status &&
          settled.before.due === sourceRow.due &&
          settled.before.paid === sourceRow.paid &&
          settled.before.balance === sourceRow.balance;
        const row = sourceIsUnchanged
          ? { ...sourceRow, ...settled.after }
          : sourceRow;
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
              <StatusControl
                row={row}
                active={active}
                onSettled={(settled) => {
                  setSettledRows((current) => ({
                    ...current,
                    [row.id]: { before: sourceRow, after: settled },
                  }));
                  setActiveId("");
                }}
              />
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
