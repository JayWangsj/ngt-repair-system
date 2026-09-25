"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Check, Minus, Plus, ShoppingBag, Star, Trash2 } from "lucide-react";
import { createRetailSaleAction } from "@/app/actions";
import { cents, creatablePaymentMethods, money } from "@/lib/domain";
import { useMessages } from "./language";
import { NewProductDialogButton } from "./inventory";
import { Button } from "./ui/button";

type RetailProduct = {
  id: string;
  name: string;
  category: string;
  salePrice: number;
  stockQuantity: number;
  favorite: boolean;
};

export function RetailWorkbench({ products }: { products: RetailProduct[] }) {
  const it = useMessages();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [favorites, setFavorites] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [discount, setDiscount] = useState("0");
  const [method, setMethod] =
    useState<(typeof creatablePaymentMethods)[number]>("CASH");
  const [completed, setCompleted] = useState<{
    id: string;
    total: number;
    count: number;
    method: typeof method;
  } | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category))].sort(),
    [products],
  );
  const filtered = products.filter((product) => {
    const normalized = query.trim().toLocaleLowerCase();
    return (
      (!normalized ||
        product.name.toLocaleLowerCase().includes(normalized) ||
        product.category.toLocaleLowerCase().includes(normalized)) &&
      (!category || product.category === category) &&
      (!favorites || product.favorite)
    );
  });
  const items = products
    .filter((product) => cart[product.id])
    .map((product) => ({ ...product, quantity: cart[product.id] }));
  const subtotal = items.reduce(
    (sum, item) => sum + item.salePrice * item.quantity,
    0,
  );
  let discountCents = 0;
  try {
    discountCents = cents(discount || "0");
  } catch {
    discountCents = subtotal;
  }
  const total = Math.max(0, subtotal - discountCents);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  function setQuantity(product: RetailProduct, quantity: number) {
    setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[product.id];
      else next[product.id] = Math.min(quantity, product.stockQuantity);
      return next;
    });
  }
  function checkout() {
    const requestId = crypto.randomUUID();
    setError("");
    startTransition(async () => {
      const result = await createRetailSaleAction({
        requestId,
        items: items.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
        })),
        discount,
        method,
      });
      if (!result.ok || !result.id)
        return setError(result.ok ? it.connectionError : result.error);
      setCompleted({ id: result.id, total, count, method });
    });
  }
  if (completed)
    return (
      <section className="panel retail-success" role="status">
        <span>
          <Check size={34} />
        </span>
        <h2>{it.retail.completed}</h2>
        <strong>{money(completed.total)}</strong>
        <p>
          {it.methods[completed.method]} · {completed.count}{" "}
          {it.retail.products}
        </p>
        <div>
          <Button asChild variant="outline">
            <Link href={`/retail/sales/${completed.id}`}>
              {it.retail.viewSale}
            </Link>
          </Button>
          <Button
            onClick={() => {
              setCart({});
              setDiscount("0");
              setCompleted(null);
            }}
          >
            {it.retail.nextSale}
          </Button>
        </div>
      </section>
    );
  return (
    <div className="retail-layout">
      <section className="retail-products">
        <div className="panel retail-toolbar">
          <input
            aria-label={it.retail.search}
            placeholder={it.retail.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="retail-tabs">
            <button
              className={!category && !favorites ? "active" : ""}
              onClick={() => {
                setCategory("");
                setFavorites(false);
              }}
            >
              {it.retail.all}
            </button>
            <button
              className={favorites ? "active" : ""}
              onClick={() => {
                setFavorites(true);
                setCategory("");
              }}
            >
              <Star size={15} />
              {it.retail.favorites}
            </button>
            {categories.map((item) => (
              <button
                className={category === item ? "active" : ""}
                key={item}
                onClick={() => {
                  setCategory(item);
                  setFavorites(false);
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="retail-product-grid">
          {filtered.map((product) => {
            const unavailable = product.stockQuantity <= 0;
            return (
              <button
                className="retail-product-card"
                key={product.id}
                disabled={unavailable}
                onClick={() =>
                  setQuantity(product, (cart[product.id] ?? 0) + 1)
                }
              >
                {product.favorite && (
                  <Star
                    className="retail-favorite"
                    size={16}
                    fill="currentColor"
                  />
                )}
                <span className="retail-product-icon">
                  <ShoppingBag size={24} />
                </span>
                <strong>{product.name}</strong>
                <small>{product.category}</small>
                <b>{money(product.salePrice)}</b>
                <span className={unavailable ? "danger-text" : "muted"}>
                  {unavailable
                    ? it.retail.outOfStock
                    : `${it.inventory.currentStock} ${product.stockQuantity}`}
                </span>
              </button>
            );
          })}
          <div className="retail-new-product">
            <NewProductDialogButton />
          </div>
        </div>
      </section>
      <aside className="panel retail-cart">
        <div className="section-heading">
          <div>
            <h2>{it.retail.cart}</h2>
            <span className="muted">
              {count} {it.retail.products}
            </span>
          </div>
          {items.length > 0 && (
            <Button variant="ghost" onClick={() => setCart({})}>
              <Trash2 size={15} />
              {it.retail.clear}
            </Button>
          )}
        </div>
        <div className="retail-cart-items">
          {items.length ? (
            items.map((item) => (
              <div className="retail-cart-row" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <small>{money(item.salePrice)}</small>
                </div>
                <button
                  aria-label={`${it.retail.remove} ${item.name}`}
                  onClick={() => setQuantity(item, 0)}
                >
                  ×
                </button>
                <div className="quantity-control">
                  <button
                    aria-label={`- ${item.name}`}
                    onClick={() => setQuantity(item, item.quantity - 1)}
                  >
                    <Minus size={14} />
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    aria-label={`+ ${item.name}`}
                    disabled={item.quantity >= item.stockQuantity}
                    onClick={() => setQuantity(item, item.quantity + 1)}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <b>{money(item.salePrice * item.quantity)}</b>
              </div>
            ))
          ) : (
            <p className="retail-empty-cart">{it.retail.emptyCart}</p>
          )}
        </div>
        <div className="retail-totals">
          <div>
            <span>{it.retail.subtotal}</span>
            <strong>{money(subtotal)}</strong>
          </div>
          <label>
            <span>{it.retail.discount}</span>
            <input
              aria-label={it.retail.discount}
              inputMode="decimal"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
            />
          </label>
          <div className="retail-total">
            <span>{it.retail.total}</span>
            <strong>{money(total)}</strong>
          </div>
        </div>
        <fieldset className="payment-methods">
          <legend>{it.retail.paymentMethod}</legend>
          {creatablePaymentMethods.map((value) => (
            <button
              type="button"
              className={method === value ? "active" : ""}
              key={value}
              onClick={() => setMethod(value)}
            >
              {it.methods[value]}
            </button>
          ))}
        </fieldset>
        {error && <p className="message error">{error}</p>}
        <Button
          className="retail-checkout"
          disabled={
            pending || !items.length || total <= 0 || discountCents >= subtotal
          }
          onClick={checkout}
        >
          {it.retail.checkout} {money(total)}
        </Button>
      </aside>
    </div>
  );
}
