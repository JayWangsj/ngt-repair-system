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
    <section className="panel padded order-products">
      <h2>{it.orderProducts.title}</h2>
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
            <select name="productId" required>
              <option value="">{it.selectOption}</option>
              {available.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · {money(cents(product.salePrice))} ·{" "}
                  {product.stock}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{it.orderProducts.quantity}</span>
            <input
              name="quantity"
              type="number"
              min="1"
              max="999"
              defaultValue="1"
            />
          </label>
          <Button disabled={pending || !available.length}>
            {it.orderProducts.add}
          </Button>
        </form>
      )}
      {error && <p className="message error">{error}</p>}
    </section>
  );
}

export function WorkOrderCheckout({
  orderId,
  remaining,
  customerName,
}: {
  orderId: string;
  remaining: number;
  customerName: string;
  owner: boolean;
}) {
  const it = useMessages();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const result = await checkoutWorkOrderAction(orderId, {
      requestId,
      amount: String(data.get("amount") ?? "0"),
      method: String(data.get("method") ?? "CASH"),
      pickedUpBy: String(data.get("pickedUpBy") ?? ""),
      override: data.get("override") === "on",
    });
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }
  return (
    <form className="action-form" onSubmit={submit}>
      <p className="muted">{it.orderProducts.checkoutDescription}</p>
      <label>
        <span>{it.amount}</span>
        <input
          name="amount"
          inputMode="decimal"
          defaultValue={decimal(remaining)}
          required
        />
      </label>
      <label>
        <span>{it.paymentMethod}</span>
        <select name="method">
          {creatablePaymentMethods.map((method) => (
            <option key={method} value={method}>
              {it.methods[method]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{it.pickedUpBy}</span>
        <input name="pickedUpBy" defaultValue={customerName} required />
      </label>
      {error && <p className="message error">{error}</p>}
      <Button disabled={pending}>
        {pending
          ? it.saving
          : `${it.orderProducts.checkout} · ${money(remaining)}`}
      </Button>
    </form>
  );
}
