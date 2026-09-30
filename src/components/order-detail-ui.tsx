"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronRight, ChevronUp, Pencil } from "lucide-react";
import Link from "next/link";
import { Button } from "./ui/button";
import { FormAutoSaveContext, FormCloseContext } from "./ui/form-close-context";
import {
  AfterSalesForm,
  FormDialog,
  RefundForm,
  type AfterSalesProject,
} from "./forms";
import { useMessages } from "./language";

export function OrderDetailCard({
  title,
  children,
  edit,
  locked = false,
  className = "",
  defaultExpanded = true,
  testId,
}: {
  title: string;
  children: ReactNode;
  edit?: ReactNode;
  locked?: boolean;
  className?: string;
  defaultExpanded?: boolean;
  testId?: string;
}) {
  const it = useMessages();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editing, setEditing] = useState(false);
  const card = useRef<HTMLElement>(null);
  const save = useRef<(() => Promise<boolean>) | null>(null);
  const saving = useRef(false);
  const editable = Boolean(edit) && !locked;
  const closeEdit = () => setEditing(false);
  const registerSave = useCallback(
    (handler: (() => Promise<boolean>) | null) => {
      save.current = handler;
    },
    [],
  );
  async function toggleExpanded() {
    if (!expanded) return setExpanded(true);
    if (!editing) return setExpanded(false);
    if (saving.current) return;
    saving.current = true;
    const saved = (await save.current?.()) ?? true;
    saving.current = false;
    if (!saved) return;
    setEditing(false);
    setExpanded(false);
  }
  useEffect(() => {
    if (!editing) return;
    async function outside(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node) || card.current?.contains(target)) return;
      const clickTarget =
        target instanceof HTMLElement ? target : target.parentElement;
      if (clickTarget?.closest("[data-prevent-card-autosave]")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (saving.current) return;
      saving.current = true;
      const saved = (await save.current?.()) ?? true;
      saving.current = false;
      if (!saved) return;
      setEditing(false);
      requestAnimationFrame(() => {
        if (clickTarget?.isConnected) clickTarget.click();
      });
    }
    document.addEventListener("click", outside, true);
    return () => document.removeEventListener("click", outside, true);
  }, [editing]);
  return (
    <section
      ref={card}
      className={`panel padded order-detail-card ${editable ? "is-editable" : ""} ${editing ? "is-editing" : ""} ${locked ? "is-locked" : ""} ${className}`}
      data-testid={testId}
    >
      <div
        className="order-card-heading"
        role="button"
        tabIndex={0}
        aria-label={title}
        aria-expanded={expanded}
        onClick={() => void toggleExpanded()}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          void toggleExpanded();
        }}
      >
        <div className="order-card-toggle">
          <h2>{title}</h2>
          {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </div>
        <div className="order-card-actions">
          {editing && <small>{it.editing}</small>}
          {editable && !editing && (
            <button
              type="button"
              className="order-card-edit"
              aria-label={it.edit}
              title={it.edit}
              onClick={(event) => {
                event.stopPropagation();
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
            <FormAutoSaveContext.Provider value={registerSave}>
              <FormCloseContext.Provider value={closeEdit}>
                {edit}
              </FormCloseContext.Provider>
            </FormAutoSaveContext.Provider>
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
      className="order-link order-customer-link"
      href={href}
      onClick={(event) => event.stopPropagation()}
    >
      <span>{name}</span>
      <ChevronRight size={15} aria-hidden="true" />
    </Link>
  );
}

export function AfterSalesActions({
  orderId,
  received,
  originalProjects,
  products,
}: {
  orderId: string;
  received: number;
  originalProjects: AfterSalesProject[];
  products: import("./forms").CreatedProduct[];
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
          subtitle={it.afterSales.reworkSubtitle}
          onClose={() => setDialog(null)}
        >
          <AfterSalesForm
            id={orderId}
            originalProjects={originalProjects}
            products={products}
            onSuccess={() => setDialog(null)}
          />
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
