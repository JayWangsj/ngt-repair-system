"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ListChecks,
  PackageOpen,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { deleteProductsAction, updateProductAction } from "@/app/actions";
import { decimal, inventoryStatus, money } from "@/lib/domain";
import { useMessages } from "./language";
import { FormDialog, ProductForm, type CategoryView } from "./forms";
import { SearchableCombobox, SimpleSelect } from "./business-select";
import { Button } from "./ui/button";
import { QuantityStepper } from "./ui/quantity-stepper";
export type { CategoryView } from "./forms";

const presetCategories = [
  "Accessori",
  "Ricambi",
  "Cavi",
  "Caricabatterie",
  "Usato",
];

export type ProductView = {
  id: string;
  name: string;
  category: string;
  usage: "RETAIL" | "REPAIR";
  costPrice: number;
  salePrice: number;
  stockQuantity: number;
  reservedQuantity: number;
  minStock: number;
  favorite: boolean;
  enabled: boolean;
};

type InventoryMovementView = {
  id: string;
  productName: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  type:
    | "INITIAL_STOCK"
    | "STOCK_IN"
    | "RETAIL_SALE"
    | "REPAIR_USE"
    | "SALE_RETURN"
    | "MANUAL_ADJUSTMENT";
  at: string;
};

export function InventoryHistoryCard({
  movements,
}: {
  movements: InventoryMovementView[];
}) {
  const it = useMessages();
  const [open, setOpen] = useState(false);
  const latest = movements[0];
  const typeLabel = (type: InventoryMovementView["type"]) =>
    it.inventory.movementTypes[type];
  return (
    <>
      <button
        type="button"
        className="metric inventory-history-card"
        onClick={() => setOpen(true)}
      >
        <span className="inventory-history-border-flow" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <rect
              x="0.75"
              y="0.75"
              width="98.5"
              height="98.5"
              rx="7"
              pathLength="100"
            />
          </svg>
        </span>
        <span className="inventory-history-card-heading">
          <span className="inventory-history-title">
            {it.inventory.movementHistory}
            <span
              className="inventory-history-title-underline"
              aria-hidden="true"
            />
          </span>
          <ArrowRight
            className="inventory-history-arrow"
            size={19}
            aria-hidden="true"
          />
        </span>
        {latest ? (
          <span className="inventory-history-preview">
            <span className="metric-icon orange">
              <PackageOpen size={20} aria-hidden="true" />
            </span>
            <span>
              <strong>{latest.productName}</strong>
              <span>
                {latest.stockBefore} → {latest.stockAfter}{" "}
                <em
                  className={
                    latest.quantity > 0
                      ? "movement-positive"
                      : "movement-negative"
                  }
                >
                  ({latest.quantity > 0 ? "+" : ""}
                  {latest.quantity})
                </em>
              </span>
              <small>
                {typeLabel(latest.type)} · {latest.at}
              </small>
            </span>
          </span>
        ) : (
          <small className="inventory-history-empty">
            {it.inventory.noMovements}
          </small>
        )}
      </button>
      {open && (
        <FormDialog
          title={it.inventory.movementHistory}
          onClose={() => setOpen(false)}
        >
          <div className="inventory-movements-dialog" data-form-dialog-body>
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
                      {typeLabel(movement.type)} · {movement.at}
                    </small>
                  </div>
                  <b>
                    {movement.stockBefore} → {movement.stockAfter}
                  </b>
                </div>
              ))
            ) : (
              <p className="inventory-empty">{it.inventory.noMovements}</p>
            )}
          </div>
        </FormDialog>
      )}
    </>
  );
}

export function NewProductDialogButton({
  categories,
  mode = "inventory",
}: {
  categories: CategoryView[];
  mode?: "inventory" | "retail";
}) {
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
          <ProductForm
            categories={categories}
            mode={mode}
            onClose={() => setOpen(false)}
          />
        </FormDialog>
      )}
    </>
  );
}

function StockEditor({
  value,
  label,
  onSave,
}: {
  value: number;
  label: string;
  onSave: (value: number) => void;
}) {
  return (
    <div onClick={(event) => event.stopPropagation()}>
      <QuantityStepper
        key={value}
        className="is-table"
        ariaLabel={label}
        defaultValue={value}
        min={0}
        onCommit={onSave}
      />
    </div>
  );
}

export function InventoryWorkspace({
  products,
  categories: categoryOptions,
}: {
  products: ProductView[];
  categories: CategoryView[];
}) {
  const it = useMessages();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [usage, setUsage] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProductView>>({});
  const draftsRef = useRef(drafts);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category))].sort(),
    [products],
  );
  const filtered = useMemo(
    () =>
      products.filter((product) => {
        const normalized = query.trim().toLocaleLowerCase();
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
      }),
    [products, query, category, usage, status],
  );
  const usageLabel = (value: ProductView["usage"]) =>
    value === "RETAIL" ? it.inventory.retail : it.inventory.repair;
  const statusLabel = (value: ReturnType<typeof inventoryStatus>) =>
    value === "IN_STOCK"
      ? it.inventory.inStock
      : value === "LOW_STOCK"
        ? it.inventory.low
        : it.inventory.out;
  function updateDraft(product: ProductView, changes: Partial<ProductView>) {
    const next = {
      ...draftsRef.current,
      [product.id]: {
        ...(draftsRef.current[product.id] ?? product),
        ...changes,
      },
    };
    draftsRef.current = next;
    setDrafts(next);
  }
  function restoreScroll(top: number) {
    requestAnimationFrame(() => {
      window.scrollTo({ top, behavior: "auto" });
      requestAnimationFrame(() => window.scrollTo({ top, behavior: "auto" }));
    });
  }
  function commit(productId: string, scrollTop = window.scrollY) {
    const next = draftsRef.current[productId];
    if (!next) return;
    setError("");
    startTransition(async () => {
      const result = await updateProductAction(productId, {
        ...next,
        costPrice: decimal(next.costPrice),
        salePrice: decimal(next.salePrice),
      });
      if (!result.ok) {
        setSelectedId(productId);
        return setError(result.error);
      }
      router.refresh();
      restoreScroll(scrollTop);
    });
  }
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!selectedId) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(`[data-inventory-product="${selectedId}"]`)) return;
      const scrollTop = window.scrollY;
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
      commit(selectedId, scrollTop);
      setSelectedId("");
      restoreScroll(scrollTop);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  });
  function removeSelected() {
    if (!checked.length || !window.confirm(it.deleteConfirm)) return;
    startTransition(async () => {
      const result = await deleteProductsAction(checked);
      if (!result.ok) return setError(result.error);
      setChecked([]);
      setBatchMode(false);
      router.refresh();
    });
  }
  return (
    <section className="panel inventory-main">
      <div className="inventory-filters">
        <input
          aria-label={it.inventory.search}
          placeholder={it.inventory.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <SimpleSelect
          value={category}
          onChange={setCategory}
          placeholder={it.inventory.allCategories}
          ariaLabel={it.inventory.category}
          options={[
            { value: "", label: it.inventory.allCategories },
            ...categories.map((item) => ({ value: item, label: item })),
          ]}
        />
        <SimpleSelect
          value={usage}
          onChange={setUsage}
          placeholder={it.inventory.allUsages}
          ariaLabel={it.inventory.usage}
          options={[
            { value: "", label: it.inventory.allUsages },
            { value: "RETAIL", label: it.inventory.retail },
            { value: "REPAIR", label: it.inventory.repair },
          ]}
        />
        <SimpleSelect
          value={status}
          onChange={setStatus}
          placeholder={it.inventory.allStatuses}
          ariaLabel={it.inventory.status}
          options={[
            { value: "", label: it.inventory.allStatuses },
            { value: "IN_STOCK", label: it.inventory.inStock },
            { value: "LOW_STOCK", label: it.inventory.low },
            { value: "OUT_OF_STOCK", label: it.inventory.out },
          ]}
        />
        <div className="inventory-batch-controls">
          {!batchMode ? (
            <Button
              variant="outline"
              aria-pressed="false"
              disabled={pending}
              onClick={() => {
                setBatchMode(true);
                setChecked([]);
              }}
            >
              <ListChecks size={17} aria-hidden="true" />
              {it.batchManage}
            </Button>
          ) : (
            <>
              <span className="inventory-selected-count" role="status">
                {it.inventory.selectedCount.replace(
                  "{count}",
                  String(checked.length),
                )}
              </span>
              <Button
                variant="outline"
                disabled={pending || !filtered.length}
                onClick={() =>
                  setChecked(filtered.map((product) => product.id))
                }
              >
                {it.selectAll}
              </Button>
              <Button
                variant="outline"
                className="button-danger"
                disabled={!checked.length || pending}
                onClick={removeSelected}
              >
                <Trash2 size={17} aria-hidden="true" />
                {it.inventory.deleteBatch}
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setBatchMode(false);
                  setChecked([]);
                }}
              >
                <X size={17} aria-hidden="true" />
                {it.inventory.finishBatch}
              </Button>
            </>
          )}
        </div>
      </div>
      {error && <p className="message error">{error}</p>}
      {filtered.length ? (
        <div className="table-scroll">
          <table className="inventory-table">
            <thead>
              <tr>
                {batchMode && (
                  <th className="inventory-selection">
                    <input
                      type="checkbox"
                      aria-label={it.selectAll}
                      disabled={pending || !filtered.length}
                      checked={
                        filtered.length > 0 &&
                        filtered.every((product) =>
                          checked.includes(product.id),
                        )
                      }
                      ref={(element) => {
                        if (element)
                          element.indeterminate =
                            checked.some((id) =>
                              filtered.some((product) => product.id === id),
                            ) &&
                            !filtered.every((product) =>
                              checked.includes(product.id),
                            );
                      }}
                      onChange={(event) =>
                        setChecked(
                          event.target.checked
                            ? filtered.map((product) => product.id)
                            : [],
                        )
                      }
                    />
                  </th>
                )}
                <th className="inventory-product-cell">
                  {it.inventory.product}
                </th>
                <th className="inventory-category-cell">
                  {it.inventory.category}
                </th>
                <th className="inventory-usage-cell">{it.inventory.usage}</th>
                <th className="numeric inventory-price-cell">
                  {it.inventory.costPrice}
                </th>
                <th className="numeric inventory-price-cell">
                  {it.inventory.salePrice}
                </th>
                <th className="inventory-stepper-cell">
                  {it.inventory.currentStock}
                </th>
                <th className="inventory-quantity-cell">{it.reservedStock}</th>
                <th className="inventory-quantity-cell">{it.availableStock}</th>
                <th className="inventory-stepper-cell">
                  {it.inventory.minimumStock}
                </th>
                <th className="inventory-status-cell">{it.inventory.status}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((source) => {
                const product = drafts[source.id] ?? source;
                const selected = selectedId === product.id;
                const productStatus = inventoryStatus(
                  product.stockQuantity,
                  product.minStock,
                );
                return (
                  <tr
                    key={product.id}
                    className={selected ? "inventory-selected" : ""}
                    data-inventory-product={product.id}
                    onClick={() => {
                      if (batchMode || selected) return;
                      setSelectedId(product.id);
                    }}
                    onKeyDown={(event) => {
                      if (
                        !selected ||
                        event.key !== "Enter" ||
                        !(event.target instanceof HTMLInputElement) ||
                        event.target.closest("[data-prevent-card-autosave]")
                      )
                        return;
                      event.preventDefault();
                      event.stopPropagation();
                      const scrollTop = window.scrollY;
                      event.target.blur();
                      requestAnimationFrame(() => {
                        commit(product.id, scrollTop);
                        setSelectedId("");
                        restoreScroll(scrollTop);
                      });
                    }}
                  >
                    {batchMode && (
                      <td className="inventory-selection">
                        <input
                          type="checkbox"
                          aria-label={`${it.selectOption} ${product.name}`}
                          checked={checked.includes(product.id)}
                          onChange={(event) =>
                            setChecked(
                              event.target.checked
                                ? [...checked, product.id]
                                : checked.filter((id) => id !== product.id),
                            )
                          }
                        />
                      </td>
                    )}
                    <td className="inventory-product-cell">
                      {selected ? (
                        <div className="inventory-name-edit">
                          <button
                            type="button"
                            aria-label={it.inventory.favorite}
                            className="favorite-toggle"
                            onClick={() =>
                              updateDraft(product, {
                                favorite: !product.favorite,
                              })
                            }
                          >
                            <Star
                              size={16}
                              fill={product.favorite ? "currentColor" : "none"}
                            />
                          </button>
                          <input
                            value={product.name}
                            onChange={(event) =>
                              updateDraft(product, {
                                name: event.target.value,
                              })
                            }
                          />
                        </div>
                      ) : (
                        <span className="product-name">
                          {product.favorite && (
                            <Star size={14} fill="currentColor" />
                          )}
                          <strong>{product.name}</strong>
                        </span>
                      )}
                    </td>
                    <td className="inventory-category-cell">
                      {selected ? (
                        <SearchableCombobox
                          value={product.category}
                          onChange={(category) =>
                            updateDraft(product, { category })
                          }
                          groups={[
                            {
                              options: [
                                ...new Set([
                                  product.category,
                                  ...presetCategories,
                                  ...categoryOptions.map((item) => item.name),
                                ]),
                              ].map((item) => ({ value: item, label: item })),
                            },
                          ]}
                          placeholder={it.selectOption}
                          ariaLabel={it.inventory.category}
                          searchPlaceholder={it.inventory.search}
                          emptyText={it.noMatches}
                        />
                      ) : (
                        product.category
                      )}
                    </td>
                    <td className="inventory-usage-cell">
                      {selected ? (
                        <SimpleSelect
                          value={product.usage}
                          onChange={(value) =>
                            updateDraft(product, {
                              usage: value as ProductView["usage"],
                            })
                          }
                          placeholder={it.selectOption}
                          ariaLabel={it.inventory.usage}
                          options={[
                            { value: "RETAIL", label: it.inventory.retail },
                            { value: "REPAIR", label: it.inventory.repair },
                          ]}
                        />
                      ) : (
                        usageLabel(product.usage)
                      )}
                    </td>
                    <td className="numeric inventory-price-cell">
                      {selected ? (
                        <input
                          className="price-input"
                          inputMode="decimal"
                          defaultValue={decimal(product.costPrice)}
                          onBlur={(event) =>
                            updateDraft(product, {
                              costPrice: Math.round(
                                Number(event.target.value.replace(",", ".")) *
                                  100,
                              ),
                            })
                          }
                        />
                      ) : (
                        money(product.costPrice)
                      )}
                    </td>
                    <td className="numeric inventory-price-cell">
                      {product.usage === "REPAIR" ? (
                        "—"
                      ) : selected ? (
                        <input
                          className="price-input"
                          inputMode="decimal"
                          defaultValue={decimal(product.salePrice)}
                          onBlur={(event) =>
                            updateDraft(product, {
                              salePrice: Math.round(
                                Number(event.target.value.replace(",", ".")) *
                                  100,
                              ),
                            })
                          }
                        />
                      ) : (
                        money(product.salePrice)
                      )}
                    </td>
                    <td className="inventory-stepper-cell">
                      {selected ? (
                        <StockEditor
                          value={product.stockQuantity}
                          label={it.inventory.currentStock}
                          onSave={(value) =>
                            updateDraft(product, { stockQuantity: value })
                          }
                        />
                      ) : (
                        product.stockQuantity
                      )}
                    </td>
                    <td className="inventory-quantity-cell">
                      {product.reservedQuantity}
                    </td>
                    <td className="inventory-quantity-cell">
                      {Math.max(
                        0,
                        product.stockQuantity - product.reservedQuantity,
                      )}
                    </td>
                    <td className="inventory-stepper-cell">
                      {selected ? (
                        <StockEditor
                          value={product.minStock}
                          label={it.inventory.minimumStock}
                          onSave={(value) =>
                            updateDraft(product, { minStock: value })
                          }
                        />
                      ) : (
                        product.minStock
                      )}
                    </td>
                    <td className="inventory-status-cell">
                      <span
                        className={`stock-badge stock-${productStatus.toLowerCase()}`}
                      >
                        {statusLabel(productStatus)}
                      </span>
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
  );
}
