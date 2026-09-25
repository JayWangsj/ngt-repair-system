"use client";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownUp, Plus, Star } from "lucide-react";
import { adjustInventoryAction, createProductAction } from "@/app/actions";
import { dateTime, inventoryStatus, money } from "@/lib/domain";
import { useMessages } from "./language";
import { Field, FormDialog } from "./forms";
import { Button } from "./ui/button";

export type ProductView = {
  id: string;
  name: string;
  category: string;
  usage: "RETAIL" | "REPAIR" | "BOTH";
  costPrice: number;
  salePrice: number;
  stockQuantity: number;
  minStock: number;
  favorite: boolean;
  enabled: boolean;
};

export type InventoryMovementView = {
  id: string;
  productName: string;
  quantity: number;
  stockAfter: number;
  type: string;
  note: string;
  createdAt: string;
};

function ProductForm({ onClose }: { onClose: () => void }) {
  const it = useMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      const result = await createProductAction({
        requestId: crypto.randomUUID(),
        name: String(form.get("name") ?? ""),
        category: String(form.get("category") ?? ""),
        usage: String(form.get("usage") ?? ""),
        costPrice: String(form.get("costPrice") ?? ""),
        salePrice: String(form.get("salePrice") ?? ""),
        initialStock: String(form.get("initialStock") ?? "0"),
        minStock: String(form.get("minStock") ?? "0"),
        favorite: form.get("favorite") === "on",
        enabled: form.get("enabled") === "on",
      });
      if (!result.ok) return setError(result.error);
      onClose();
      router.refresh();
    });
  }
  return (
    <form className="dialog-form" onSubmit={submit} aria-busy={pending}>
      <div className="form-grid">
        <Field label={it.inventory.product}>
          <input name="name" required maxLength={120} autoFocus />
        </Field>
        <Field label={it.inventory.category}>
          <input name="category" required maxLength={120} />
        </Field>
        <Field label={it.inventory.usage}>
          <select name="usage" defaultValue="RETAIL">
            <option value="RETAIL">{it.inventory.retail}</option>
            <option value="REPAIR">{it.inventory.repair}</option>
            <option value="BOTH">{it.inventory.both}</option>
          </select>
        </Field>
        <Field label={it.inventory.costPrice}>
          <input
            name="costPrice"
            inputMode="decimal"
            defaultValue="0"
            required
          />
        </Field>
        <Field label={it.inventory.salePrice}>
          <input
            name="salePrice"
            inputMode="decimal"
            defaultValue="0"
            required
          />
        </Field>
        <Field label={it.inventory.initialStock}>
          <input
            name="initialStock"
            type="number"
            min="0"
            defaultValue="0"
            required
          />
        </Field>
        <Field label={it.inventory.minimumStock}>
          <input
            name="minStock"
            type="number"
            min="0"
            defaultValue="0"
            required
          />
        </Field>
      </div>
      <div className="dialog-checks">
        <label className="checkbox">
          <input name="favorite" type="checkbox" />
          {it.inventory.favorite}
        </label>
        <label className="checkbox">
          <input name="enabled" type="checkbox" defaultChecked />
          {it.inventory.active}
        </label>
      </div>
      {error && <p className="message error">{error}</p>}
      <div className="dialog-actions">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={pending}
        >
          {it.cancel}
        </Button>
        <Button disabled={pending}>{it.inventory.saveProduct}</Button>
      </div>
    </form>
  );
}

export function NewProductDialogButton() {
  const it = useMessages();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={18} />
        {it.inventory.newProduct}
      </Button>
      {open && (
        <FormDialog
          title={it.inventory.newProduct}
          onClose={() => setOpen(false)}
        >
          <ProductForm onClose={() => setOpen(false)} />
        </FormDialog>
      )}
    </>
  );
}

function AdjustmentDialog({
  product,
  onClose,
}: {
  product: ProductView;
  onClose: () => void;
}) {
  const it = useMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await adjustInventoryAction(product.id, {
        requestId: crypto.randomUUID(),
        quantity: String(form.get("quantity") ?? ""),
        type: String(form.get("type") ?? ""),
        note: String(form.get("note") ?? ""),
      });
      if (!result.ok) return setError(result.error);
      onClose();
      router.refresh();
    });
  }
  return (
    <form className="dialog-form" onSubmit={submit} aria-busy={pending}>
      <p className="inventory-dialog-product">
        <strong>{product.name}</strong>
        <span>
          {it.inventory.currentStock}: {product.stockQuantity}
        </span>
      </p>
      <div className="form-grid">
        <Field label={it.inventory.adjust}>
          <select name="type" defaultValue="STOCK_IN">
            <option value="STOCK_IN">{it.inventory.stockIn}</option>
            <option value="MANUAL_ADJUSTMENT">
              {it.inventory.manualAdjustment}
            </option>
          </select>
        </Field>
        <Field label={it.inventory.quantityChange}>
          <input name="quantity" type="number" required />
        </Field>
      </div>
      <Field label={it.inventory.note}>
        <textarea name="note" maxLength={2000} />
      </Field>
      {error && <p className="message error">{error}</p>}
      <div className="dialog-actions">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={pending}
        >
          {it.cancel}
        </Button>
        <Button disabled={pending}>{it.inventory.saveMovement}</Button>
      </div>
    </form>
  );
}

export function InventoryWorkspace({
  products,
  movements,
}: {
  products: ProductView[];
  movements: InventoryMovementView[];
}) {
  const it = useMessages();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [usage, setUsage] = useState("");
  const [status, setStatus] = useState("");
  const [adjusting, setAdjusting] = useState<ProductView | null>(null);
  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category))].sort(),
    [products],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return products.filter((product) => {
      const productStatus = inventoryStatus(
        product.stockQuantity,
        product.minStock,
      );
      return (
        (!normalized ||
          product.name.toLocaleLowerCase().includes(normalized) ||
          product.category.toLocaleLowerCase().includes(normalized)) &&
        (!category || product.category === category) &&
        (!usage || product.usage === usage) &&
        (!status || productStatus === status)
      );
    });
  }, [products, query, category, usage, status]);
  const usageLabel = (value: ProductView["usage"]) =>
    value === "RETAIL"
      ? it.inventory.retail
      : value === "REPAIR"
        ? it.inventory.repair
        : it.inventory.both;
  const statusLabel = (value: ReturnType<typeof inventoryStatus>) =>
    value === "IN_STOCK"
      ? it.inventory.inStock
      : value === "LOW_STOCK"
        ? it.inventory.low
        : it.inventory.out;
  return (
    <div className="inventory-layout">
      <section className="panel inventory-main">
        <div className="inventory-filters">
          <input
            aria-label={it.inventory.search}
            placeholder={it.inventory.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            aria-label={it.inventory.category}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">{it.inventory.allCategories}</option>
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            aria-label={it.inventory.usage}
            value={usage}
            onChange={(event) => setUsage(event.target.value)}
          >
            <option value="">{it.inventory.allUsages}</option>
            <option value="RETAIL">{it.inventory.retail}</option>
            <option value="REPAIR">{it.inventory.repair}</option>
            <option value="BOTH">{it.inventory.both}</option>
          </select>
          <select
            aria-label={it.inventory.status}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">{it.inventory.allStatuses}</option>
            <option value="IN_STOCK">{it.inventory.inStock}</option>
            <option value="LOW_STOCK">{it.inventory.low}</option>
            <option value="OUT_OF_STOCK">{it.inventory.out}</option>
          </select>
        </div>
        {filtered.length ? (
          <div className="table-scroll">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>{it.inventory.product}</th>
                  <th>{it.inventory.category}</th>
                  <th>{it.inventory.usage}</th>
                  <th className="numeric">{it.inventory.costPrice}</th>
                  <th className="numeric">{it.inventory.salePrice}</th>
                  <th className="numeric">{it.inventory.currentStock}</th>
                  <th className="numeric">{it.inventory.minimumStock}</th>
                  <th>{it.inventory.status}</th>
                  <th>
                    <span className="sr-only">{it.actionsLabel}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const productStatus = inventoryStatus(
                    product.stockQuantity,
                    product.minStock,
                  );
                  return (
                    <tr
                      key={product.id}
                      className={product.enabled ? "" : "inventory-disabled"}
                    >
                      <td>
                        <span className="product-name">
                          <strong>{product.name}</strong>
                          {product.favorite && (
                            <Star size={14} fill="currentColor" />
                          )}
                        </span>
                      </td>
                      <td>{product.category}</td>
                      <td>{usageLabel(product.usage)}</td>
                      <td className="numeric">{money(product.costPrice)}</td>
                      <td className="numeric">{money(product.salePrice)}</td>
                      <td className="numeric">
                        <strong>{product.stockQuantity}</strong>
                      </td>
                      <td className="numeric">{product.minStock}</td>
                      <td>
                        <span
                          className={`stock-badge stock-${productStatus.toLowerCase()}`}
                        >
                          {statusLabel(productStatus)}
                        </span>
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          onClick={() => setAdjusting(product)}
                        >
                          <ArrowDownUp size={16} />
                          {it.inventory.adjust}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="inventory-empty">{it.inventory.noProducts}</p>
        )}
      </section>
      <aside className="panel inventory-movements">
        <h2>{it.inventory.recentMovements}</h2>
        {movements.length ? (
          movements.map((movement) => (
            <div className="movement-row" key={movement.id}>
              <span
                className={
                  movement.quantity > 0
                    ? "movement-positive"
                    : "movement-negative"
                }
              >
                {movement.quantity > 0 ? "+" : ""}
                {movement.quantity}
              </span>
              <div>
                <strong>{movement.productName}</strong>
                <small>
                  {movement.note || movement.type.replaceAll("_", " ")} ·{" "}
                  {dateTime(movement.createdAt)}
                </small>
              </div>
              <b>{movement.stockAfter}</b>
            </div>
          ))
        ) : (
          <p className="muted">{it.inventory.noMovements}</p>
        )}
      </aside>
      {adjusting && (
        <FormDialog
          title={it.inventory.adjust}
          onClose={() => setAdjusting(null)}
        >
          <AdjustmentDialog
            product={adjusting}
            onClose={() => setAdjusting(null)}
          />
        </FormDialog>
      )}
    </div>
  );
}
