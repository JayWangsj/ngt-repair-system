"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Plus, Star, Trash2 } from "lucide-react";
import {
  createProductAction,
  deleteInventoryCategoryAction,
  deleteProductsAction,
  updateProductAction,
} from "@/app/actions";
import { decimal, inventoryStatus, money } from "@/lib/domain";
import { useMessages } from "./language";
import { Field, FormDialog } from "./forms";
import { EditableSelect } from "./editable-select";
import { SearchableCombobox, SimpleSelect } from "./business-select";
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
  history: { id: string; at: string; label: string }[];
};

export type CategoryView = {
  id: string;
  name: string;
  repairOnly: boolean;
};

const presetCategories = [
  "Accessori",
  "Ricambi",
  "Cavi",
  "Caricabatterie",
  "Usato",
];

function ProductForm({
  categories,
  onClose,
  mode,
}: {
  categories: CategoryView[];
  onClose: () => void;
  mode: "inventory" | "retail";
}) {
  const it = useMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [category, setCategory] = useState("");
  const [usage, setUsage] = useState<"RETAIL" | "REPAIR" | "BOTH">("RETAIL");
  const [hiddenCategories, setHiddenCategories] = useState<string[]>([]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createProductAction({
        requestId: crypto.randomUUID(),
        name: String(form.get("name") ?? ""),
        category,
        usage: mode === "retail" ? "RETAIL" : usage,
        costPrice: String(form.get("costPrice") ?? ""),
        salePrice:
          mode === "inventory" && usage === "REPAIR"
            ? "0"
            : String(form.get("salePrice") ?? ""),
        initialStock: String(form.get("initialStock") ?? "0"),
        minStock: String(form.get("minStock") ?? "0"),
        favorite: form.get("favorite") === "on",
        enabled: true,
      });
      if (!result.ok) return setError(result.error);
      onClose();
      router.refresh();
    });
  }
  const options = [
    ...new Set([
      ...presetCategories,
      ...categories
        .filter(
          (item) =>
            !hiddenCategories.includes(item.id) &&
            (mode === "inventory" || !item.repairOnly),
        )
        .map((item) => item.name),
    ]),
  ]
    .filter((item) => mode === "inventory" || item.toLowerCase() !== "ricambi")
    .sort();
  return (
    <form className="dialog-form" onSubmit={submit} aria-busy={pending}>
      <div className="form-grid">
        <Field label={it.inventory.product}>
          <input name="name" required maxLength={120} autoFocus />
        </Field>
        <div className="inventory-category-field">
          <EditableSelect
            label={it.inventory.category}
            value={category}
            onChange={setCategory}
            options={options}
            required
          />
          {categories.some((item) => item.name === category) && (
            <button
              type="button"
              className="icon-button"
              aria-label={it.remove + " " + category}
              onClick={async () => {
                const selected = categories.find(
                  (item) => item.name === category,
                );
                if (!selected) return;
                const result = await deleteInventoryCategoryAction(selected.id);
                if (!result.ok) return setError(result.error);
                setHiddenCategories([...hiddenCategories, selected.id]);
                setCategory("");
              }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
        {mode === "inventory" && (
          <Field label={it.inventory.usage}>
            <SimpleSelect
              name="usage"
              value={usage}
              onChange={(value) => setUsage(value as typeof usage)}
              placeholder={it.selectOption}
              ariaLabel={it.inventory.usage}
              options={[
                { value: "RETAIL", label: it.inventory.retail },
                { value: "REPAIR", label: it.inventory.repair },
                { value: "BOTH", label: it.inventory.both },
              ]}
            />
          </Field>
        )}
        <Field label={it.inventory.costPrice}>
          <input
            name="costPrice"
            inputMode="decimal"
            defaultValue="0"
            required
          />
        </Field>
        {(mode === "retail" || usage !== "REPAIR") && (
          <Field label={it.inventory.salePrice}>
            <input
              name="salePrice"
              inputMode="decimal"
              defaultValue="0"
              required
            />
          </Field>
        )}
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
      <label className="checkbox">
        <input name="favorite" type="checkbox" />
        {it.inventory.favorite}
      </label>
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
    <div className="stock-stepper" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-label={`- ${label}`}
        disabled={value <= 0}
        onClick={() => onSave(value - 1)}
      >
        −
      </button>
      <input
        aria-label={label}
        type="number"
        min="0"
        value={value}
        onChange={(event) => onSave(Math.max(0, Number(event.target.value)))}
      />
      <button
        type="button"
        aria-label={`+ ${label}`}
        onClick={() => onSave(value + 1)}
      >
        +
      </button>
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
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const table = useRef<HTMLTableElement>(null);
  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category))].sort(),
    [products],
  );
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!table.current?.contains(event.target as Node))
        requestAnimationFrame(() => setSelectedId(""));
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
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
  function save(product: ProductView, changes: Partial<ProductView>) {
    const next = { ...product, ...changes };
    setDrafts((current) => ({ ...current, [product.id]: next }));
    setError("");
    startTransition(async () => {
      const result = await updateProductAction(product.id, {
        ...next,
        costPrice: decimal(next.costPrice),
        salePrice: decimal(next.salePrice),
      });
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }
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
            { value: "BOTH", label: it.inventory.both },
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
      </div>
      <div className="catalog-toolbar inventory-batch-toolbar">
        <Button
          variant="outline"
          aria-pressed={batchMode}
          disabled={pending}
          onClick={() => {
            setBatchMode(!batchMode);
            setChecked([]);
          }}
        >
          {batchMode ? it.finishBatch : it.batchManage}
        </Button>
        {batchMode && (
          <>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={
                  filtered.length > 0 && checked.length === filtered.length
                }
                onChange={(event) =>
                  setChecked(
                    event.target.checked
                      ? filtered.map((product) => product.id)
                      : [],
                  )
                }
              />
              {it.selectAll}
            </label>
            <Button
              variant="outline"
              disabled={!checked.length || pending}
              onClick={removeSelected}
            >
              <Trash2 size={17} />
              {it.inventory.deleteSelected} ({checked.length})
            </Button>
          </>
        )}
      </div>
      {error && <p className="message error">{error}</p>}
      {filtered.length ? (
        <div className="table-scroll">
          <table className="inventory-table" ref={table}>
            <thead>
              <tr>
                {batchMode && <th />}
                <th>{it.inventory.product}</th>
                <th>{it.inventory.category}</th>
                <th>{it.inventory.usage}</th>
                <th className="numeric">{it.inventory.costPrice}</th>
                <th className="numeric">{it.inventory.salePrice}</th>
                <th>{it.inventory.currentStock}</th>
                <th>{it.inventory.minimumStock}</th>
                <th>{it.inventory.status}</th>
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
                    onClick={() => !batchMode && setSelectedId(product.id)}
                  >
                    {batchMode && (
                      <td>
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
                    <td>
                      {selected ? (
                        <div className="inventory-name-edit">
                          <button
                            type="button"
                            aria-label={it.inventory.favorite}
                            className="favorite-toggle"
                            onClick={() =>
                              save(product, { favorite: !product.favorite })
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
                              setDrafts((current) => ({
                                ...current,
                                [product.id]: {
                                  ...product,
                                  name: event.target.value,
                                },
                              }))
                            }
                            onBlur={() => save(product, {})}
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
                      {product.history.length > 0 && (
                        <details
                          className="inventory-history"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <summary>{it.history}</summary>
                          <ol>
                            {product.history.slice(0, 20).map((entry) => (
                              <li key={entry.id}>
                                <span>{entry.label}</span>
                                <small>{entry.at}</small>
                              </li>
                            ))}
                          </ol>
                        </details>
                      )}
                    </td>
                    <td>
                      {selected ? (
                        <SearchableCombobox
                          value={product.category}
                          onChange={(category) => save(product, { category })}
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
                    <td>
                      {selected ? (
                        <SimpleSelect
                          value={product.usage}
                          onChange={(value) =>
                            save(product, {
                              usage: value as ProductView["usage"],
                            })
                          }
                          placeholder={it.selectOption}
                          ariaLabel={it.inventory.usage}
                          options={[
                            { value: "RETAIL", label: it.inventory.retail },
                            { value: "REPAIR", label: it.inventory.repair },
                            { value: "BOTH", label: it.inventory.both },
                          ]}
                        />
                      ) : (
                        usageLabel(product.usage)
                      )}
                    </td>
                    <td className="numeric">
                      {selected ? (
                        <input
                          className="price-input"
                          inputMode="decimal"
                          defaultValue={decimal(product.costPrice)}
                          onBlur={(event) =>
                            save(product, {
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
                    <td className="numeric">
                      {product.usage === "REPAIR" ? (
                        "—"
                      ) : selected ? (
                        <input
                          className="price-input"
                          inputMode="decimal"
                          defaultValue={decimal(product.salePrice)}
                          onBlur={(event) =>
                            save(product, {
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
                    <td>
                      {selected ? (
                        <StockEditor
                          value={product.stockQuantity}
                          label={it.inventory.currentStock}
                          onSave={(value) =>
                            save(product, { stockQuantity: value })
                          }
                        />
                      ) : (
                        product.stockQuantity
                      )}
                    </td>
                    <td>
                      {selected ? (
                        <StockEditor
                          value={product.minStock}
                          label={it.inventory.minimumStock}
                          onSave={(value) => save(product, { minStock: value })}
                        />
                      ) : (
                        product.minStock
                      )}
                    </td>
                    <td>
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
