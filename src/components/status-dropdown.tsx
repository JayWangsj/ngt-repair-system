"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { statusAction } from "@/app/actions";
import {
  allowedTransitions,
  type OrderStatus,
  type StatusMutationSnapshot,
} from "@/lib/domain";
import { useMessages } from "./language";
import { Field, FormDialog } from "./forms";
import { WorkOrderCheckoutDialog } from "./work-order-products";
import { Button } from "./ui/button";

type Option = { value: OrderStatus; label: string };

function StatusSelect({
  value,
  label,
  options,
  disabled,
  onChange,
}: {
  value: OrderStatus;
  label: string;
  options: Option[];
  disabled: boolean;
  onChange: (value: OrderStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const interactive = !disabled && options.length > 0;
  function place() {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect)
      setPosition({ top: rect.bottom + 5, left: rect.left, width: rect.width });
  }
  useLayoutEffect(() => {
    if (open) place();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target))
        setOpen(false);
    }
    const reposition = () => place();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);
  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (!interactive) return;
    if (["ArrowDown", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      requestAnimationFrame(() =>
        menu.current?.querySelector<HTMLButtonElement>("button")?.focus(),
      );
    }
  }
  return (
    <span
      className={`status-dropdown status-dropdown-sm ${open ? "is-open" : ""}`}
      data-prevent-card-autosave
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        ref={trigger}
        type="button"
        className={`status-dropdown-trigger status-${value.toLowerCase()}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={interactive ? menuId : undefined}
        disabled={disabled}
        onClick={() => interactive && setOpen((current) => !current)}
        onKeyDown={keyboard}
      >
        <span className="status-dropdown-dot" aria-hidden="true" />
        <span>{label}</span>
        {interactive && <ChevronDown size={13} aria-hidden="true" />}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={menuId}
            className="status-dropdown-menu"
            role="listbox"
            aria-label={label}
            data-prevent-card-autosave
            style={{
              top: position.top,
              left: position.left,
              minWidth: position.width,
            }}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                trigger.current?.focus();
              }
            }}
          >
            {options.map((option) => (
              <button
                type="button"
                role="option"
                aria-selected="false"
                className={`status-dropdown-option status-${option.value.toLowerCase()}`}
                key={option.value}
                onClick={() => {
                  setOpen(false);
                  onChange(option.value);
                }}
              >
                <span className="status-dropdown-dot" aria-hidden="true" />
                {option.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}

export type StatusDropdownOrder = {
  id: string;
  status: OrderStatus;
  customerName: string;
  due: number;
  paid: number;
  balance: number;
  afterSalesOpen?: boolean;
};

export function StatusDropdown({
  order,
  active = true,
  onSettled,
}: {
  order: StatusDropdownOrder;
  active?: boolean;
  onSettled?: (order: StatusDropdownOrder) => void;
}) {
  const it = useMessages();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(order);
  const [error, setError] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const choices = allowedTransitions(
    currentOrder.status,
    currentOrder.afterSalesOpen,
  ).filter((status) => status !== "REFUNDED");
  function settled(snapshot: StatusMutationSnapshot) {
    const nextOrder = { ...currentOrder, ...snapshot };
    setCurrentOrder(nextOrder);
    setError("");
    onSettled?.(nextOrder);
    router.refresh();
  }
  if (!active)
    return (
      <span className={`badge status-${currentOrder.status.toLowerCase()}`}>
        <span />
        {it.status[currentOrder.status]}
      </span>
    );
  return (
    <div className="inline-order-control">
      <StatusSelect
        value={currentOrder.status}
        label={it.status[currentOrder.status]}
        options={choices.map((status) => ({
          value: status,
          label: it.status[status],
        }))}
        disabled={pending}
        onChange={(next) => {
          if (next === "COMPLETED") return setCheckoutOpen(true);
          if (next === "CANCELLED") return setCancelOpen(true);
          void (async () => {
            setPending(true);
            try {
              const result = await statusAction(order.id, {
                status: next,
                note: "",
                pickedUpBy: "",
              });
              if (!result.ok) return setError(result.error);
              if (!result.data) return setError(it.connectionError);
              settled(result.data);
            } catch {
              setError(it.connectionError);
            } finally {
              setPending(false);
            }
          })();
        }}
      />
      {error && !cancelOpen && (
        <small className="inline-control-error">{error}</small>
      )}
      <WorkOrderCheckoutDialog
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={settled}
        requireDelivery
        orderId={order.id}
        due={currentOrder.due}
        paid={currentOrder.paid}
        remaining={currentOrder.balance}
        customerName={currentOrder.customerName}
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
              void (async () => {
                setPending(true);
                try {
                  const result = await statusAction(order.id, {
                    status: "CANCELLED",
                    note: cancelReason,
                    pickedUpBy: "",
                  });
                  if (!result.ok) return setError(result.error);
                  if (!result.data) return setError(it.connectionError);
                  setCancelOpen(false);
                  settled(result.data);
                } catch {
                  setError(it.connectionError);
                } finally {
                  setPending(false);
                }
              })();
            }}
          >
            <Field label={it.cancelReasonOptional}>
              <textarea
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                maxLength={2000}
              />
            </Field>
            {error && <p className="message error">{error}</p>}
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
