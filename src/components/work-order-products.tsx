"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  addWorkOrderProductAction,
  checkoutWorkOrderAction,
  removeWorkOrderProductAction,
} from "@/app/actions";
import { cents, creatablePaymentMethods, decimal, money } from "@/lib/domain";
import { useMessages } from "./language";
import { Button } from "./ui/button";
import { OrderDetailCard } from "./order-detail-ui";
import { FormDialog } from "./forms";
import { SearchableCombobox, SimpleSelect } from "./business-select";

type ProductOption = {
  id: string;
  name: string;
  category: string;
  usage: "RETAIL" | "REPAIR" | "BOTH";
  salePrice: string;
  stock: number;
};
type ProductLine = {
  id: string;
  productName: string;
  kind: "REPAIR_PART" | "RETAIL_ADDON";
  unitPrice: string;
  quantity: number;
  consumedAt: string | null;
};

export function WorkOrderProducts({
  orderId,
  products,
  lines,
  closed,
}: {
  orderId: string;
  products: ProductOption[];
  lines: ProductLine[];
  closed: boolean;
}) {
  const it = useMessages();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState("1");
  const available = products.filter(
    (product) => product.usage !== "REPAIR" && product.stock > 0,
  );

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const result = await addWorkOrderProductAction(orderId, {
      productId: String(data.get("productId") ?? ""),
      kind: "RETAIL_ADDON",
      quantity: Number(data.get("quantity") ?? 1),
    });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setSelectedProduct("");
    setQuantity("1");
    router.refresh();
  }

  async function remove(lineId: string) {
    setPending(true);
    setError("");
    const result = await removeWorkOrderProductAction(orderId, lineId);
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <OrderDetailCard
      title={it.orderProducts.title}
      locked={closed}
      className="order-products"
      testId="products-card"
      defaultExpanded
    >
      <p className="muted">{it.orderProducts.description}</p>
      {lines.length ? (
        <div className="order-product-lines">
          {lines.map((line) => (
            <div className="order-product-line" key={line.id}>
              <div>
                <strong>{line.productName}</strong>
                <small>
                  {line.kind === "REPAIR_PART"
                    ? it.orderProducts.repairParts
                    : it.orderProducts.retailAddons}
                  {line.consumedAt ? ` · ${it.orderProducts.consumed}` : ""}
                </small>
              </div>
              <span>× {line.quantity}</span>
              <strong>
                {line.kind === "REPAIR_PART"
                  ? it.orderProducts.included
                  : money(cents(line.unitPrice) * line.quantity)}
              </strong>
              {!closed && !line.consumedAt && (
                <button
                  className="icon-button"
                  type="button"
                  aria-label={it.remove}
                  disabled={pending}
                  onClick={() => remove(line.id)}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">{it.orderProducts.empty}</p>
      )}
      {!closed && (
        <form className="order-product-form" onSubmit={add}>
          <label>
            <span>{it.orderProducts.product}</span>
            <SearchableCombobox
              name="productId"
              value={selectedProduct}
              onChange={setSelectedProduct}
              groups={[
                {
                  options: available.map((product) => ({
                    value: product.id,
                    label: product.name,
                    secondary: `${it.inventory.currentStock}: ${product.stock}`,
                    trailing: money(cents(product.salePrice)),
                    keywords: product.category,
                  })),
                },
              ]}
              placeholder={it.selectOption}
              ariaLabel={it.orderProducts.product}
              searchPlaceholder={it.search}
              emptyText={it.orderProducts.empty}
              clearable
            />
          </label>
          <label>
            <span>{it.orderProducts.quantity}</span>
            <input
              name="quantity"
              type="number"
              min="1"
              max="999"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
          <Button
            disabled={
              pending ||
              !available.some((product) => product.id === selectedProduct) ||
              !/^\d+$/.test(quantity) ||
              Number(quantity) < 1 ||
              Number(quantity) > 999
            }
          >
            {it.orderProducts.add}
          </Button>
        </form>
      )}
      {error && <p className="message error">{error}</p>}
    </OrderDetailCard>
  );
}

export function WorkOrderCheckout({
  orderId,
  due,
  paid,
  remaining,
  customerName,
  onClose,
  onSuccess,
  requireDelivery = false,
}: {
  orderId: string;
  due: number;
  paid: number;
  remaining: number;
  customerName: string;
  onClose?: () => void;
  onSuccess?: () => void;
  requireDelivery?: boolean;
}) {
  const it = useMessages();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(decimal(remaining));
  const [method, setMethod] = useState("CASH");
  let enteredAmount = 0;
  try {
    enteredAmount = cents(amount || "0");
  } catch {}
  const now = () => {
    const date = new Date();
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const submittedAmount = String(data.get("amount") ?? "0");
    let submittedCents: number;
    try {
      submittedCents = cents(submittedAmount);
      if (submittedCents < 0 || submittedCents > remaining)
        return setError(it.orderProducts.checkoutAmountRange);
      if (remaining > 0 && submittedCents === 0)
        return setError(it.orderProducts.checkoutAmountRange);
      if (requireDelivery && submittedCents !== remaining)
        return setError(it.orderProducts.checkoutAmountRange);
    } catch {
      return setError(it.validationError);
    }
    setPending(true);
    try {
      const result = await checkoutWorkOrderAction(orderId, {
        requestId,
        amount: submittedAmount,
        method,
        pickedUpBy: String(data.get("pickedUpBy") ?? ""),
        pickedUpAt: new Date(String(data.get("pickedUpAt"))).toISOString(),
        override: data.get("override") === "on",
      });
      if (!result.ok) return setError(result.error);
      const delivered = submittedCents === remaining;
      if (!delivered) {
        setRequestId(crypto.randomUUID());
        setAmount(decimal(remaining - submittedCents));
      }
      onClose?.();
      onSuccess?.();
      router.refresh();
    } catch {
      setError(it.connectionError);
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      className="action-form checkout-form"
      data-prevent-card-autosave
      onSubmit={submit}
    >
      <p className="muted">{it.orderProducts.checkoutDescription}</p>
      <dl className="checkout-summary">
        <div>
          <dt>{it.total}</dt>
          <dd>{money(due)}</dd>
        </div>
        <div>
          <dt>{it.paid}</dt>
          <dd>{money(paid)}</dd>
        </div>
        <div>
          <dt>{it.balance}</dt>
          <dd>{money(remaining)}</dd>
        </div>
      </dl>
      {remaining > 0 && (
        <>
          <label>
            <span>{it.amount}</span>
            <input
              name="amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>
          <label>
            <span>{it.paymentMethod}</span>
            <SimpleSelect
              name="method"
              value={method}
              onChange={setMethod}
              placeholder={it.selectOption}
              ariaLabel={it.paymentMethod}
              options={creatablePaymentMethods.map((option) => ({
                value: option,
                label: it.methods[option],
              }))}
            />
          </label>
        </>
      )}
      {remaining === 0 && <input type="hidden" name="amount" value="0" />}
      <label>
        <span>{it.pickedUpBy}</span>
        <input name="pickedUpBy" defaultValue={customerName} required />
      </label>
      <label>
        <span>{it.orderProducts.deliveryTime}</span>
        <input
          name="pickedUpAt"
          type="datetime-local"
          defaultValue={now()}
          required
        />
      </label>
      {error && <p className="message error">{error}</p>}
      <div className="dialog-actions">
        {onClose && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            {it.cancel}
          </Button>
        )}
        <Button disabled={pending} aria-busy={pending}>
          {pending
            ? it.saving
            : remaining === 0
              ? it.orderProducts.confirmDelivery
              : enteredAmount < remaining
                ? `${it.orderProducts.collectPayment} · ${money(enteredAmount)}`
                : `${it.orderProducts.checkout} · ${money(remaining)}`}
        </Button>
      </div>
    </form>
  );
}

export function WorkOrderCheckoutDialog({
  open,
  onClose,
  ...props
}: Omit<Parameters<typeof WorkOrderCheckout>[0], "onClose"> & {
  open: boolean;
  onClose: () => void;
}) {
  const it = useMessages();
  if (!open) return null;
  return (
    <FormDialog
      title={
        props.remaining > 0
          ? it.orderProducts.checkout
          : it.orderProducts.confirmDelivery
      }
      onClose={onClose}
    >
      <WorkOrderCheckout {...props} onClose={onClose} />
    </FormDialog>
  );
}
