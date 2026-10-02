"use client";

import {
  createContext,
  useCallback,
  useContext,
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
import { ensureComfortableInteractionSpace } from "@/lib/comfortable-scroll";

export type OrderDetailEditTarget = {
  kind: "repair";
  index: number;
  field: "project" | "part";
};

const OrderDetailEditContext = createContext<{
  editing: boolean;
  session: number;
  target: OrderDetailEditTarget | null;
  requestEdit: (target: OrderDetailEditTarget) => void;
  clearTarget: () => void;
} | null>(null);

export function useOrderDetailEdit() {
  return useContext(OrderDetailEditContext);
}

export function OrderDetailCard({
  title,
  children,
  edit,
  persistent,
  locked = false,
  className = "",
  defaultExpanded = true,
  testId,
}: {
  title: string;
  children: ReactNode;
  edit?: ReactNode;
  persistent?: ReactNode;
  locked?: boolean;
  className?: string;
  defaultExpanded?: boolean;
  testId?: string;
}) {
  const it = useMessages();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editing, setEditing] = useState(false);
  const [editSession, setEditSession] = useState(0);
  const [editTarget, setEditTarget] = useState<OrderDetailEditTarget | null>(
    null,
  );
  const card = useRef<HTMLElement>(null);
  const heading = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const saves = useRef(new Set<() => Promise<boolean>>());
  const [saving, setSaving] = useState(false);
  const editable = Boolean(edit) && !locked;
  const closeEdit = () => {
    setEditTarget(null);
    setEditing(false);
  };
  const requestEdit = (target: OrderDetailEditTarget) => {
    setExpanded(true);
    if (!editing) setEditSession((current) => current + 1);
    setEditTarget(target);
    setEditing(true);
  };
  const registerSave = useCallback((handler: () => Promise<boolean>) => {
    saves.current.add(handler);
    return () => saves.current.delete(handler);
  }, []);
  useEffect(() => {
    if (!expanded || editTarget) return;
    const frame = requestAnimationFrame(() => {
      if (!heading.current || !body.current) return;
      ensureComfortableInteractionSpace(heading.current, {
        spaceBelow: Math.min(
          body.current.scrollHeight,
          window.innerHeight * 0.55,
        ),
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [editTarget, editing, expanded]);
  const saveAll = useCallback(async () => {
    for (const save of saves.current) if (!(await save())) return false;
    return true;
  }, []);
  async function toggleExpanded() {
    if (!expanded) return setExpanded(true);
    if (!editing) return setExpanded(false);
    if (saving) return;
    setSaving(true);
    const saved = await saveAll();
    setSaving(false);
    if (!saved) return;
    setEditTarget(null);
    setEditing(false);
    setExpanded(false);
  }
  async function submitEdit() {
    if (saving) return;
    setSaving(true);
    const saved = await saveAll();
    setSaving(false);
    if (saved) closeEdit();
  }
  useEffect(() => {
    if (!editing) return;
    async function outside(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node) || card.current?.contains(target)) return;
      const clickTarget =
        target instanceof HTMLElement ? target : target.parentElement;
      const clickPosition = { x: event.clientX, y: event.clientY };
      const actionTarget = clickTarget?.closest<HTMLElement>("button, a");
      const targetCard =
        actionTarget?.closest<HTMLElement>("[data-testid]")?.dataset.testid;
      const targetLabel = actionTarget?.getAttribute("aria-label");
      const continueOriginalClick =
        actionTarget?.classList.contains("order-card-edit");
      if (clickTarget?.closest("[data-prevent-card-autosave]")) return;
      if (!continueOriginalClick) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      if (saving) return;
      setSaving(true);
      const saved = await saveAll();
      setSaving(false);
      if (!saved) return;
      setEditTarget(null);
      setEditing(false);
      if (continueOriginalClick) return;
      requestAnimationFrame(() => {
        const targetScope = targetCard
          ? document.querySelector<HTMLElement>(`[data-testid="${targetCard}"]`)
          : null;
        const nextTarget =
          (targetLabel
            ? Array.from(
                targetScope?.querySelectorAll<HTMLElement>("[aria-label]") ??
                  [],
              ).find(
                (candidate) =>
                  candidate.getAttribute("aria-label") === targetLabel,
              )
            : null) ??
          (document.elementFromPoint(
            clickPosition.x,
            clickPosition.y,
          ) as HTMLElement | null);
        nextTarget?.click();
      });
    }
    document.addEventListener("click", outside, true);
    return () => document.removeEventListener("click", outside, true);
  }, [editing, saveAll, saving]);
  return (
    <OrderDetailEditContext.Provider
      value={{
        editing,
        session: editSession,
        target: editTarget,
        requestEdit,
        clearTarget: () => setEditTarget(null),
      }}
    >
      <section
        ref={card}
        className={`panel padded order-detail-card ${editable ? "is-editable" : ""} ${editing ? "is-editing" : ""} ${locked ? "is-locked" : ""} ${className}`}
        data-testid={testId}
      >
        <div
          ref={heading}
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
                  setEditSession((current) => current + 1);
                  setEditTarget(null);
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
          <div ref={body} className="order-card-body">
            {editing ? (
              <FormAutoSaveContext.Provider value={registerSave}>
                <FormCloseContext.Provider value={closeEdit}>
                  {edit}
                  {persistent}
                  <div className="dialog-actions order-card-edit-actions">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={closeEdit}
                    >
                      {it.cancel}
                    </Button>
                    <Button
                      type="button"
                      disabled={saving}
                      onClick={() => void submitEdit()}
                    >
                      {saving ? it.saving : it.save}
                    </Button>
                  </div>
                </FormCloseContext.Provider>
              </FormAutoSaveContext.Provider>
            ) : (
              <>
                {children}
                {persistent}
              </>
            )}
          </div>
        </div>
      </section>
    </OrderDetailEditContext.Provider>
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
  productCategories,
}: {
  orderId: string;
  received: number;
  originalProjects: AfterSalesProject[];
  products: import("./forms").CreatedProduct[];
  productCategories: import("./forms").CategoryView[];
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
            productCategories={productCategories}
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
