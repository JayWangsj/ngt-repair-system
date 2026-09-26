"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Pencil } from "lucide-react";
import Link from "next/link";
import { Button } from "./ui/button";
import { FormCloseContext } from "./ui/form-close-context";
import { AfterSalesForm, FormDialog, RefundForm } from "./forms";
import { useMessages } from "./language";

export function OrderDetailCard({
  title,
  children,
  edit,
  headerExtra,
  locked = false,
  className = "",
  defaultExpanded = true,
  testId,
}: {
  title: string;
  children: ReactNode;
  edit?: ReactNode;
  headerExtra?: ReactNode;
  locked?: boolean;
  className?: string;
  defaultExpanded?: boolean;
  testId?: string;
}) {
  const it = useMessages();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editing, setEditing] = useState(false);
  const editable = Boolean(edit) && !locked;
  const closeEdit = () => setEditing(false);
  return (
    <section
      className={`panel padded order-detail-card ${editable ? "is-editable" : ""} ${editing ? "is-editing" : ""} ${locked ? "is-locked" : ""} ${className}`}
      data-testid={testId}
    >
      <div className="order-card-heading">
        <button
          type="button"
          className="order-card-toggle"
          aria-expanded={expanded}
          disabled={editing}
          onClick={() => setExpanded((value) => !value)}
        >
          <h2>{title}</h2>
          {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </button>
        <div className="order-card-actions">
          {headerExtra}
          {editing && <small>{it.editing}</small>}
          {editable && !editing && (
            <button
              type="button"
              className="order-card-edit"
              aria-label={it.edit}
              title={it.edit}
              onClick={() => {
                setExpanded(true);
                setEditing(true);
              }}
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div
        className={`order-card-collapse ${expanded ? "is-expanded" : ""}`}
        aria-hidden={!expanded}
        inert={!expanded || undefined}
      >
        <div className="order-card-body">
          {editing ? (
            <FormCloseContext.Provider value={closeEdit}>
              {edit}
            </FormCloseContext.Provider>
          ) : (
            children
          )}
        </div>
      </div>
    </section>
  );
}

export function CustomerDetailLink({
  href,
  name,
}: {
  href: string;
  name: string;
}) {
  return (
    <Link
      className="order-customer-link"
      href={href}
      onClick={(event) => event.stopPropagation()}
    >
      <span>{name}</span>
      <span aria-hidden="true">&gt;</span>
    </Link>
  );
}

export function AfterSalesActions({
  orderId,
  received,
}: {
  orderId: string;
  received: number;
}) {
  const it = useMessages();
  const [dialog, setDialog] = useState<"rework" | "refund" | null>(null);
  return (
    <section className="panel padded after-sales-actions">
      <h2>{it.afterSales.title}</h2>
      <div className="after-sales-buttons">
        <Button onClick={() => setDialog("rework")}>
          {it.afterSales.rework}
        </Button>
        <Button
          variant="danger"
          disabled={received <= 0}
          onClick={() => setDialog("refund")}
        >
          {it.afterSales.refund}
        </Button>
      </div>
      {dialog === "rework" && (
        <FormDialog
          title={it.afterSales.openRework}
          onClose={() => setDialog(null)}
        >
          <AfterSalesForm id={orderId} />
        </FormDialog>
      )}
      {dialog === "refund" && (
        <FormDialog
          title={it.afterSales.confirmRefund}
          onClose={() => setDialog(null)}
        >
          <RefundForm id={orderId} received={received} />
        </FormDialog>
      )}
    </section>
  );
}
