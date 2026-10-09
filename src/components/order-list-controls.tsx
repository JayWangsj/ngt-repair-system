"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { setPaidTotalAction, updateDueDateAction } from "@/app/actions";
import { dateOnly, decimal, money, type OrderStatus } from "@/lib/domain";
import {
  defaultOrderMotionSettings,
  normalizeOrderMotionSettings,
  orderMotionChangeEvent,
  readOrderMotionSettings,
} from "@/lib/order-motion";
import { useBusinessDay } from "./business-date";
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
  afterSalesOpen: boolean;
};

function StatusControl({
  row,
  active,
  onSettled,
  refreshOnSettled,
}: {
  row: Pick<
    OrderListRow,
    | "id"
    | "status"
    | "customerName"
    | "due"
    | "paid"
    | "balance"
    | "afterSalesOpen"
  >;
  active: boolean;
  onSettled?: (order: StatusDropdownOrder) => void;
  refreshOnSettled?: boolean;
}) {
  return (
    <StatusDropdown
      key={`${row.status}:${row.due}:${row.paid}:${row.balance}`}
      order={row}
      active={active}
      onSettled={onSettled}
      refreshOnSettled={refreshOnSettled}
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
  afterSalesOpen,
}: Pick<
  OrderListRow,
  | "id"
  | "status"
  | "customerName"
  | "due"
  | "paid"
  | "balance"
  | "afterSalesOpen"
>) {
  return (
    <div className="detail-status-control">
      <StatusControl
        row={{ id, status, customerName, due, paid, balance, afterSalesOpen }}
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
  const today = useBusinessDay();
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
        min={today}
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
  const [highlightedId, setHighlightedId] = useState("");
  const [suppressedHoverId, setSuppressedHoverId] = useState("");
  const body = useRef<HTMLTableSectionElement>(null);
  const pendingStatusAnimation = useRef("");
  const previousRowPositions = useRef(new Map<string, DOMRect>());
  const lockedScrollPosition = useRef<{ x: number; y: number } | null>(null);
  const floatingRow = useRef<HTMLTableElement | null>(null);
  const landingTimer = useRef<number | null>(null);
  const highlightTimer = useRef<number | null>(null);
  const motionSettings = useRef(defaultOrderMotionSettings);
  useEffect(() => {
    function outside(event: PointerEvent) {
      const protectedTarget = (event.target as Element).closest?.(
        "[data-prevent-card-autosave]",
      );
      if (
        protectedTarget &&
        (protectedTarget.tagName !== "DIALOG" ||
          !protectedTarget.contains(body.current))
      )
        return;
      if (!body.current?.contains(event.target as Node))
        requestAnimationFrame(() => setActiveId(""));
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  useEffect(() => {
    motionSettings.current = readOrderMotionSettings();
    function update(event: Event) {
      motionSettings.current = normalizeOrderMotionSettings(
        (event as CustomEvent).detail,
      );
    }
    window.addEventListener(orderMotionChangeEvent, update);
    return () => window.removeEventListener(orderMotionChangeEvent, update);
  }, []);
  useEffect(
    () => () => {
      if (landingTimer.current) window.clearTimeout(landingTimer.current);
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
      floatingRow.current?.remove();
    },
    [],
  );
  useLayoutEffect(() => {
    const changedId = pendingStatusAnimation.current;
    if (!changedId || !body.current) return;
    const elements = Array.from(
      body.current.querySelectorAll<HTMLTableRowElement>("tr[data-order-id]"),
    );
    const target = elements.find(
      (element) => element.dataset.orderId === changedId,
    );
    pendingStatusAnimation.current = "";
    if (!target) return;
    const motion = motionSettings.current;
    const total = motion.rise + motion.hold + motion.glide + motion.land;
    const travelDuration = motion.rise + motion.hold + motion.glide;
    const liftOffset = motion.rise / total;
    const holdOffset = (motion.rise + motion.hold) / total;
    const glideOffset = travelDuration / total;
    const displacedHoldOffset = (motion.rise + motion.hold) / travelDuration;
    const previousTarget = previousRowPositions.current.get(changedId);
    const currentTarget = target.getBoundingClientRect();
    const targetDelta = previousTarget
      ? currentTarget.top - previousTarget.top
      : 0;
    target.classList.add("order-row-status-moving");
    if (previousTarget && Math.abs(targetDelta) >= 1) {
      floatingRow.current?.remove();
      const table = document.createElement("table");
      const floatingBody = document.createElement("tbody");
      const clone = target.cloneNode(true) as HTMLTableRowElement;
      const sourceCells = Array.from(
        target.querySelectorAll<HTMLTableCellElement>("td"),
      );
      const clonedCells = Array.from(
        clone.querySelectorAll<HTMLTableCellElement>("td"),
      );
      clone.removeAttribute("data-order-id");
      clone.classList.add("order-row-floating");
      clone
        .querySelectorAll<HTMLElement>("[id]")
        .forEach((element) => element.removeAttribute("id"));
      clone
        .querySelectorAll<HTMLAnchorElement>("a[href]")
        .forEach((element) => element.removeAttribute("href"));
      clonedCells.forEach((cell, index) => {
        const width = sourceCells[index]?.getBoundingClientRect().width;
        if (width) cell.style.width = `${width}px`;
      });
      floatingBody.className = "order-list-body";
      floatingBody.append(clone);
      table.className = "order-table order-floating-table";
      table.setAttribute("aria-hidden", "true");
      table.dataset.floatingOrderId = changedId;
      Object.assign(table.style, {
        top: `${previousTarget.top}px`,
        left: `${previousTarget.left}px`,
        width: `${previousTarget.width}px`,
        height: `${previousTarget.height}px`,
      });
      table.append(floatingBody);
      document.body.append(table);
      floatingRow.current = table;
      target.classList.add("order-row-floating-placeholder");

      const scale = 1.02;
      const restingShadow = "0 2px 5px -3px rgb(74 54 0 / 20%)";
      const floatingShadow = `0 ${motion.shadowY}px ${motion.shadowBlur}px ${motion.shadowSpread}px rgb(74 54 0 / ${motion.shadowOpacity}%)`;
      table.animate(
        [
          {
            transform: "translateY(0) scale(1)",
            boxShadow: restingShadow,
            offset: 0,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          },
          {
            transform: `translateY(-${motion.lift}px) scale(${scale})`,
            boxShadow: floatingShadow,
            offset: liftOffset,
            easing: "linear",
          },
          {
            transform: `translateY(-${motion.lift}px) scale(${scale})`,
            boxShadow: floatingShadow,
            offset: holdOffset,
            easing: "cubic-bezier(0.2, 0.75, 0.25, 1)",
          },
          {
            transform: `translateY(${targetDelta - motion.lift}px) scale(${scale})`,
            boxShadow: floatingShadow,
            offset: glideOffset,
            easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          },
          {
            transform: `translateY(${targetDelta}px) scale(1)`,
            boxShadow: restingShadow,
            offset: 1,
          },
        ],
        { duration: total, easing: "linear", fill: "both" },
      );
    }
    elements.forEach((element) => {
      const previous = previousRowPositions.current.get(
        element.dataset.orderId ?? "",
      );
      if (!previous) return;
      const delta = previous.top - element.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) return;
      const changed = element === target;
      if (changed && floatingRow.current) return;
      const cells = Array.from(
        element.querySelectorAll<HTMLTableCellElement>("td"),
      );
      cells.forEach((cell, index) => {
        const edgeShadow =
          index === 0
            ? "inset 4px 0 #d7aa00"
            : index === cells.length - 1
              ? "inset -1px 0 rgb(215 170 0 / 28%)"
              : "inset 0 0 transparent";
        const restingShadow = `${edgeShadow}, inset 0 1px rgb(255 255 255 / 62%), 0 2px 4px -3px rgb(74 54 0 / 18%)`;
        const floatingShadow = `${edgeShadow}, inset 0 2px rgb(255 255 255 / 78%), inset 0 -1px rgb(174 128 0 / 18%), 0 ${motion.shadowY}px ${motion.shadowBlur}px ${motion.shadowSpread}px rgb(74 54 0 / ${motion.shadowOpacity}%)`;
        cell.animate(
          changed
            ? [
                {
                  transform: `translateY(${delta}px)`,
                  backgroundColor: "#fff8dc",
                  boxShadow: restingShadow,
                  offset: 0,
                },
                {
                  transform: `translateY(${delta - motion.lift}px)`,
                  backgroundColor: "#fff1b2",
                  boxShadow: floatingShadow,
                  offset: liftOffset,
                },
                {
                  transform: `translateY(${delta - motion.lift}px)`,
                  backgroundColor: "#fff1b2",
                  boxShadow: floatingShadow,
                  offset: holdOffset,
                },
                {
                  transform: `translateY(-${motion.lift}px)`,
                  backgroundColor: "#fff1b2",
                  boxShadow: floatingShadow,
                  offset: glideOffset,
                },
                {
                  transform: "translateY(0)",
                  backgroundColor: "#fff5ca",
                  boxShadow: restingShadow,
                  offset: 1,
                },
              ]
            : [
                { transform: `translateY(${delta}px)`, offset: 0 },
                {
                  transform: `translateY(${delta}px)`,
                  offset: displacedHoldOffset,
                },
                { transform: "translateY(0)", offset: 1 },
              ],
          {
            duration: changed ? total : travelDuration,
            easing: changed ? "cubic-bezier(0.22, 1, 0.36, 1)" : "ease-out",
          },
        );
      });
    });
    if (landingTimer.current) window.clearTimeout(landingTimer.current);
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    const lockedScroll = lockedScrollPosition.current;
    if (lockedScroll) {
      window.scrollTo({
        left: lockedScroll.x,
        top: lockedScroll.y,
        behavior: "auto",
      });
      requestAnimationFrame(() =>
        window.scrollTo({
          left: lockedScroll.x,
          top: lockedScroll.y,
          behavior: "auto",
        }),
      );
    }
    landingTimer.current = window.setTimeout(() => {
      floatingRow.current?.remove();
      floatingRow.current = null;
      target.classList.remove("order-row-floating-placeholder");
      target.classList.add("order-row-status-highlight");
      target.classList.remove("order-row-status-moving");
      lockedScrollPosition.current = null;
      setHighlightedId(changedId);
      highlightTimer.current = window.setTimeout(
        () => setHighlightedId(""),
        1500,
      );
    }, total);
  }, [rows]);
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
            data-order-id={row.id}
            className={`business-list-row ${active ? "order-row-active" : ""} ${suppressedHoverId === row.id ? "order-row-hover-suppressed" : ""} ${highlightedId === row.id ? "order-row-status-highlight" : ""}`.trim()}
            onClick={() => setActiveId(row.id)}
            onPointerLeave={() => {
              if (suppressedHoverId === row.id) setSuppressedHoverId("");
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const target = event.target;
              if (!(target instanceof HTMLInputElement)) return;
              event.preventDefault();
              target.blur();
              requestAnimationFrame(() => setActiveId(""));
            }}
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
            <td className="order-inline-edit-cell order-status-cell">
              <StatusControl
                row={row}
                active={active}
                refreshOnSettled={!compact}
                onSettled={(settled) => {
                  if (!compact) {
                    lockedScrollPosition.current = {
                      x: window.scrollX,
                      y: window.scrollY,
                    };
                    previousRowPositions.current = new Map(
                      Array.from(
                        body.current?.querySelectorAll<HTMLTableRowElement>(
                          "tr[data-order-id]",
                        ) ?? [],
                      ).map((element) => [
                        element.dataset.orderId ?? "",
                        element.getBoundingClientRect(),
                      ]),
                    );
                    pendingStatusAnimation.current = row.id;
                  }
                  setSettledRows((current) => ({
                    ...current,
                    [row.id]: { before: sourceRow, after: settled },
                  }));
                  if (compact) setSuppressedHoverId(row.id);
                  setActiveId("");
                }}
              />
            </td>
            <td
              className={`order-inline-edit-cell order-due-cell${row.overdue ? " danger-text" : ""}`}
            >
              <DueDateControl key={row.dueDate} row={row} active={active} />
            </td>
            <td className="numeric order-inline-edit-cell order-payment-cell">
              <PaymentControl key={row.paid} row={row} active={active} />
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}
