"use client";
import {
  useContext,
  useCallback,
  useState,
  useEffect,
  useRef,
  useId,
  useTransition,
  Children,
  isValidElement,
  cloneElement,
  type ReactElement,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { RecordIcon } from "./ui/record-icon";
import { EditableSelect } from "./editable-select";
import {
  deviceProjects,
  uniqueOptions,
  groupPriceRules,
  pricePath,
} from "@/lib/options";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Trash2,
  Check,
  ShieldCheck,
  X,
  ChevronRight,
  Package,
  Pencil,
  Wrench,
} from "lucide-react";
import { Button } from "./ui/button";
import { FormAutoSaveContext, FormCloseContext } from "./ui/form-close-context";
import { useMessages, useLanguage } from "./language";
import { translateError } from "@/lib/i18n";
import {
  categories,
  brands,
  models,
  faultPresets,
  type Category,
  normalizeBrand,
  normalizeModel,
} from "@/lib/catalog";
import { isDiagnosticFault, settlement } from "@/lib/domain";
import { useBusinessDay } from "./business-date";
import {
  cents,
  decimal,
  matchRule,
  money,
  creatablePaymentMethods,
} from "@/lib/domain";
import { orderInput } from "@/lib/validation";
import {
  SearchableCombobox,
  SimpleSelect,
  DatePicker,
} from "./business-select";
import { FaultSelector } from "./fault-selector";
import type { FaultCatalogItem } from "./fault-catalog-manager";
import {
  createOrderAction,
  lookupCustomerAction,
  paymentAction,
  updateOrderAction,
  quoteAction,
  ruleAction,
  updatePriceRuleFieldAction,
  customerAction,
  hideFaultAction,
  deleteCustomerAction,
  deviceAction,
  deleteDeviceAction,
  deleteRulesAction,
  warrantyAction,
  afterSalesAction,
  updateReworkPartAction,
  refundAction,
  createProductAction,
  deleteInventoryCategoryAction,
} from "@/app/actions";

export type RuleView = {
  id: string;
  category: string;
  brand: string;
  series: string;
  model: string;
  project: string;
  suggested: string;
  cost?: string | null;
  minutes: number;
  notes: string;
  enabled: boolean;
  requiredProductId?: string | null;
  requiredQuantity?: number;
  requiredProductRemoved?: boolean;
};

function InlineRuleField({
  rule,
  field,
  disabled,
  onError,
  onSaved,
}: {
  rule: RuleView;
  field: "project" | "suggested";
  disabled: boolean;
  onError: (message: string) => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(rule[field]);
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);
  async function save() {
    if (saving.current) return;
    const next = value.trim();
    if (next === rule[field]) return setEditing(false);
    saving.current = true;
    setPending(true);
    onError("");
    const result = await updatePriceRuleFieldAction(rule.id, field, next);
    setPending(false);
    saving.current = false;
    if (!result.ok) return onError(result.error);
    setEditing(false);
    onSaved();
    router.refresh();
  }
  if (editing)
    return (
      <input
        ref={input}
        className={`inline-rule-input inline-rule-${field}`}
        value={value}
        inputMode={field === "suggested" ? "decimal" : undefined}
        maxLength={field === "project" ? 120 : undefined}
        disabled={pending}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
          if (event.key === "Escape") {
            setValue(rule[field]);
            setEditing(false);
          }
        }}
      />
    );
  return (
    <button
      type="button"
      className={`inline-rule-value inline-rule-${field}`}
      disabled={disabled}
      onClick={() => setEditing(true)}
    >
      {field === "suggested" ? money(cents(rule.suggested)) : rule.project}
    </button>
  );
}
export type ItemView = {
  project: string;
  final: string;
  adjustmentReason: string;
  discount?: string;
  saveRule?: boolean;
  discountVisible?: boolean;
  requiredProductId?: string;
  requiredQuantity?: number;
  requiredProductRemoved?: boolean;
};
const blankItem = (): ItemView => ({
  project: "",
  final: "",
  adjustmentReason: "",
  discount: "0",
  saveRule: false,
});
function numeric(value: string) {
  try {
    return cents(value);
  } catch {
    return 0;
  }
}
function validAmount(value: string) {
  try {
    return cents(value) >= 0;
  } catch {
    return false;
  }
}
function validPositiveAmount(value: string) {
  try {
    return cents(value) > 0;
  } catch {
    return false;
  }
}
function normalizedProject(value: string) {
  return value.trim().toLocaleLowerCase("it");
}
export function quoteItemsValid(
  items: ItemView[],
  rules: RuleView[],
  device: { category: string; brand: string; series: string; model: string },
) {
  return (
    items.length > 0 &&
    items.every(
      (item) =>
        item.project.trim() &&
        validPositiveAmount(item.final) &&
        (!!matchRule(rules, device, item.project) || item.saveRule),
    )
  );
}
function Message({ error, success }: { error?: string; success?: boolean }) {
  const it = useMessages();
  const { locale } = useLanguage();
  return error ? (
    <p className="message error" role="alert">
      {translateError(error, locale)}
    </p>
  ) : success ? (
    <p className="message success" role="status">
      <Check size={16} />
      {it.saved}
    </p>
  ) : null;
}
export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <label className={className}>
      <span id={id}>{label}</span>
      {Children.map(children, (child) =>
        isValidElement(child) &&
        typeof child.type === "string" &&
        ["input", "select", "textarea"].includes(child.type)
          ? cloneElement(
              child as ReactElement<{ "aria-labelledby"?: string }>,
              { "aria-labelledby": id },
            )
          : child,
      )}
    </label>
  );
}

export type CategoryView = {
  id: string;
  name: string;
  repairOnly: boolean;
};

export type CreatedProduct = {
  id: string;
  name: string;
  category: string;
  stock: number;
  reserved?: number;
  available?: number;
};

const presetInventoryCategories = [
  "Accessori",
  "Ricambi",
  "Cavi",
  "Caricabatterie",
  "Usato",
];

export function ProductForm({
  categories,
  onClose,
  mode,
  initialName = "",
  initialUsage,
  onCreated,
  quickRepair = false,
}: {
  categories: CategoryView[];
  onClose: () => void;
  mode: "inventory" | "retail";
  initialName?: string;
  initialUsage?: "RETAIL" | "REPAIR" | "BOTH";
  onCreated?: (product: CreatedProduct) => void;
  quickRepair?: boolean;
}) {
  const it = useMessages();
  const { locale } = useLanguage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [category, setCategory] = useState(quickRepair ? "Ricambi" : "");
  const [usage, setUsage] = useState<"RETAIL" | "REPAIR" | "BOTH">(
    quickRepair ? "REPAIR" : (initialUsage ?? "RETAIL"),
  );
  const [hiddenCategories, setHiddenCategories] = useState<string[]>([]);
  const costInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!quickRepair || !initialName) return;
    const frame = requestAnimationFrame(() => costInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [initialName, quickRepair]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const initialStock = Number(form.get("initialStock") ?? 0);
    startTransition(async () => {
      const result = await createProductAction({
        requestId: crypto.randomUUID(),
        name,
        category,
        usage: mode === "retail" ? "RETAIL" : usage,
        costPrice: String(form.get("costPrice") ?? ""),
        salePrice:
          mode === "inventory" && usage === "REPAIR"
            ? "0"
            : String(form.get("salePrice") ?? ""),
        initialStock: String(initialStock),
        minStock: String(form.get("minStock") ?? "0"),
        favorite: form.get("favorite") === "on",
        enabled: true,
      });
      if (!result.ok) return setError(result.error);
      if (result.id)
        onCreated?.({
          id: result.id,
          name,
          category,
          stock: initialStock,
        });
      onClose();
      if (!onCreated) router.refresh();
    });
  }
  const options = [
    ...new Set([
      ...presetInventoryCategories,
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
          <input
            name="name"
            required
            maxLength={120}
            autoFocus={!quickRepair}
            defaultValue={initialName}
          />
        </Field>
        {!quickRepair && (
          <EditableSelect
            label={it.inventory.category}
            value={category}
            onChange={setCategory}
            options={options}
            required
            deletableValues={categories
              .filter((item) => item.name.toLocaleLowerCase("it") !== "ricambi")
              .map((item) => item.name)}
            onDelete={async (name) => {
              const selected = categories.find((item) => item.name === name);
              if (!selected) return;
              const result = await deleteInventoryCategoryAction(selected.id);
              if (!result.ok) return setError(result.error);
              setHiddenCategories((current) => [...current, selected.id]);
              if (category === name) setCategory("");
            }}
          />
        )}
        {mode === "inventory" && !quickRepair && (
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
            ref={costInput}
            name="costPrice"
            inputMode="decimal"
            defaultValue="0"
            required
            autoFocus={quickRepair && Boolean(initialName)}
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
      {error && (
        <p className="message error">{translateError(error, locale)}</p>
      )}
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

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="panel form-section">
      <h2>
        <span className="section-number">{number}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ItemsEditor({
  items,
  onChange,
  rules,
  device,
  products = [],
  productCategories = [],
  discounts = false,
  progressive = false,
}: {
  discounts?: boolean;
  items: ItemView[];
  onChange: (items: ItemView[]) => void;
  rules: RuleView[];
  products?: {
    id: string;
    name: string;
    category: string;
    stock: number;
    reserved?: number;
    available?: number;
  }[];
  productCategories?: CategoryView[];
  device: { category: string; brand: string; series: string; model: string };
  owner?: boolean;
  progressive?: boolean;
}) {
  const it = useMessages();
  const [createdProducts, setCreatedProducts] = useState<CreatedProduct[]>([]);
  const availableProducts = [
    ...products,
    ...createdProducts.filter(
      (created) => !products.some((product) => product.id === created.id),
    ),
  ];
  const [creatingPart, setCreatingPart] = useState<{
    index: number;
    query: string;
  } | null>(null);
  const [projectQueries, setProjectQueries] = useState<Record<number, string>>(
    {},
  );
  const [editingParts, setEditingParts] = useState<Record<number, boolean>>({});
  const [editingProjects, setEditingProjects] = useState<
    Record<number, boolean>
  >({});
  const [editingPrices, setEditingPrices] = useState<Record<number, boolean>>(
    {},
  );
  const [temporaryProjects, setTemporaryProjects] = useState<
    Record<number, ItemView[]>
  >({});
  const priceInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const deviceKey = [
    device.category,
    device.brand,
    device.series,
    device.model,
  ].join("|");
  const previousDevice = useRef(deviceKey);
  useEffect(() => {
    if (previousDevice.current === deviceKey) return;
    previousDevice.current = deviceKey;
    setProjectQueries({});
    setEditingParts({});
    setEditingPrices({});
    setTemporaryProjects({});
    const projects = deviceProjects(rules, device);
    onChange(
      items.map((item) => {
        const project = projects.find(
          (candidate) =>
            candidate.toLocaleLowerCase("it") ===
            item.project.trim().toLocaleLowerCase("it"),
        );
        const found = project ? matchRule(rules, device, project) : null;
        return project && found
          ? {
              ...item,
              project,
              final: found.rule.suggested,
              requiredProductId: found.rule.requiredProductId ?? "",
              requiredQuantity: found.rule.requiredQuantity ?? 1,
              requiredProductRemoved: false,
            }
          : {
              ...item,
              project: "",
              final: "",
              discount: "0",
              requiredProductId: "",
              requiredQuantity: 1,
              requiredProductRemoved: false,
            };
      }),
    );
  }, [deviceKey, device, items, rules, onChange]);
  const update = (index: number, patch: Partial<ItemView>) => {
    const next = items.map((item, i) =>
      i === index ? { ...item, ...patch } : item,
    );
    const changed = next[index];
    if (
      changed?.project.trim() &&
      changed.saveRule &&
      !matchRule(rules, device, changed.project)
    )
      setTemporaryProjects((current) => {
        const drafts = current[index] ?? [];
        const position = drafts.findIndex(
          (draft) =>
            normalizedProject(draft.project) ===
            normalizedProject(changed.project),
        );
        return {
          ...current,
          [index]:
            position < 0
              ? [...drafts, changed]
              : drafts.map((draft, i) => (i === position ? changed : draft)),
        };
      });
    onChange(next);
  };
  const resetItem = (index: number, project = "") =>
    update(index, {
      project,
      final: "",
      adjustmentReason: "",
      discount: "0",
      discountVisible: false,
      saveRule: false,
      requiredProductId: "",
      requiredQuantity: 1,
      requiredProductRemoved: false,
    });
  return (
    <div className="items-editor">
      {items.map((item, index) => {
        const projects = deviceProjects(rules, device);
        const match = matchRule(rules, device, item.project);
        const projectQuery = projectQueries[index] ?? "";
        const drafts = temporaryProjects[index] ?? [];
        const normalizedQuery = normalizedProject(projectQuery);
        const searchProjects = [
          ...projects,
          ...drafts.map((draft) => draft.project),
        ];
        const noProjectMatches =
          !!normalizedQuery &&
          !searchProjects.some((project) =>
            normalizedProject(project).includes(normalizedQuery),
          );
        const itemPriceValid = validPositiveAmount(item.final);
        const itemSelected =
          !!item.project.trim() && (!!match || !!item.saveRule);
        const itemComplete = itemSelected && itemPriceValid;
        const selectedProduct = availableProducts.find(
          (product) => product.id === item.requiredProductId,
        );
        const partShortage =
          !!selectedProduct &&
          Number(item.requiredQuantity ?? 1) >
            (selectedProduct.available ?? selectedProduct.stock);
        const createTemporaryProject = (project: string) => {
          const value = project.trim();
          if (!noProjectMatches || !value || !validPositiveAmount(item.final))
            return;
          const duplicate = searchProjects.find(
            (candidate) =>
              normalizedProject(candidate) === normalizedProject(value),
          );
          if (duplicate) return;
          setProjectQueries((current) => ({ ...current, [index]: "" }));
          setEditingProjects((current) => ({
            ...current,
            [index]: false,
          }));
          update(index, {
            project: value,
            adjustmentReason: "",
            discount: "0",
            discountVisible: false,
            saveRule: true,
            requiredProductId: "",
            requiredQuantity: 1,
            requiredProductRemoved: false,
          });
        };
        return (
          <div className="quote-item" key={index}>
            {itemSelected && !editingProjects[index] ? (
              <div className="selection-summary selected-project-summary">
                <span className="selection-summary-icon is-project">
                  <Wrench size={18} aria-hidden="true" />
                </span>
                <div className="selection-summary-copy">
                  <strong>{item.project}</strong>
                  <small>
                    {match
                      ? `${it.priceListProject} · ${device.brand} ${device.model}`
                      : it.afterSales.temporaryProject}
                  </small>
                </div>
                <div className="selection-summary-value">
                  <small>{it.currentQuote}</small>
                  {editingPrices[index] ? (
                    <div className="quote-summary-price-field">
                      <input
                        autoFocus
                        className="quote-summary-price"
                        aria-label={`${it.final} ${index + 1}`}
                        inputMode="decimal"
                        value={item.final}
                        aria-invalid={!itemPriceValid}
                        onChange={(event) =>
                          update(index, { final: event.target.value })
                        }
                        onBlur={() => {
                          if (itemPriceValid)
                            setEditingPrices((current) => ({
                              ...current,
                              [index]: false,
                            }));
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          event.stopPropagation();
                          if (itemPriceValid) event.currentTarget.blur();
                        }}
                      />
                      {!itemPriceValid && (
                        <small className="field-error">
                          {it.positiveAmountError}
                        </small>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="summary-price-button"
                      aria-label={`${it.edit} ${it.currentQuote}`}
                      onClick={() =>
                        setEditingPrices((current) => ({
                          ...current,
                          [index]: true,
                        }))
                      }
                    >
                      <strong>{money(cents(item.final))}</strong>
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="summary-action"
                  onClick={() =>
                    setEditingProjects((current) => ({
                      ...current,
                      [index]: true,
                    }))
                  }
                >
                  <span>{it.change}</span>
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <SearchableCombobox
                className="repair-project-combobox"
                value={item.project}
                ariaLabel={`${it.project} ${index + 1}`}
                placeholder={it.afterSales.projectPlaceholder}
                searchPlaceholder={it.afterSales.projectSearch}
                emptyText={
                  projects.length
                    ? it.afterSales.noProjectMatches
                    : it.afterSales.noDeviceProjects
                }
                emptyCreateText={
                  validPositiveAmount(item.final)
                    ? it.noMatchesCreateHint.replace(
                        "{action}",
                        it.afterSales.addCustomProject,
                      )
                    : it.noMatchesPriceHint.replace(
                        "{action}",
                        it.afterSales.addCustomProject,
                      )
                }
                customLabel={it.afterSales.addCustomProject}
                customDisabled={!validPositiveAmount(item.final)}
                creationControls="no-match"
                preserveQueryOnClose
                clearable
                autoFocusQuery={
                  editingProjects[index] ? item.project : undefined
                }
                onClose={() =>
                  setEditingProjects((current) => ({
                    ...current,
                    [index]: false,
                  }))
                }
                middleControl={
                  <div className="quote-price-field">
                    <input
                      ref={(element) => {
                        priceInputs.current[index] = element;
                      }}
                      className="quote-price-input"
                      aria-label={`${it.final} ${index + 1}`}
                      placeholder={it.final}
                      inputMode="decimal"
                      required
                      disabled={!noProjectMatches}
                      value={item.final}
                      aria-invalid={
                        noProjectMatches && !validPositiveAmount(item.final)
                      }
                      onChange={(event) =>
                        update(index, { final: event.target.value })
                      }
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        event.stopPropagation();
                        createTemporaryProject(projectQuery);
                      }}
                    />
                    {noProjectMatches && !validPositiveAmount(item.final) && (
                      <small className="field-error">
                        {it.positiveAmountError}
                      </small>
                    )}
                  </div>
                }
                groups={[
                  {
                    options: projects.map((project) => {
                      const found = matchRule(rules, device, project);
                      return {
                        value: project,
                        label: project,
                        trailing: found
                          ? money(cents(found.rule.suggested))
                          : undefined,
                        secondary: found?.rule.notes || undefined,
                      };
                    }),
                  },
                  {
                    options: drafts.map((draft) => ({
                      value: draft.project,
                      label: draft.project,
                      secondary: it.afterSales.temporaryProject,
                    })),
                  },
                ]}
                onQueryChange={(query) => {
                  setProjectQueries((current) => ({
                    ...current,
                    [index]: query,
                  }));
                }}
                onCustom={createTemporaryProject}
                onNoMatchEnter={(project) => {
                  setProjectQueries((current) => ({
                    ...current,
                    [index]: project,
                  }));
                  requestAnimationFrame(() =>
                    priceInputs.current[index]?.focus(),
                  );
                }}
                onChange={(project) => {
                  const found = matchRule(rules, device, project);
                  const draft = drafts.find(
                    (candidate) =>
                      normalizedProject(candidate.project) ===
                      normalizedProject(project),
                  );
                  setProjectQueries((current) => ({ ...current, [index]: "" }));
                  setEditingParts((current) => ({
                    ...current,
                    [index]: false,
                  }));
                  if (!project) resetItem(index);
                  else if (draft) update(index, draft);
                  else
                    update(index, {
                      project,
                      final: found?.rule.suggested ?? "",
                      adjustmentReason: "",
                      discount: "0",
                      discountVisible: false,
                      saveRule: false,
                      requiredProductId: found?.rule.requiredProductId ?? "",
                      requiredQuantity: found?.rule.requiredQuantity ?? 1,
                      requiredProductRemoved: false,
                    });
                  if (project)
                    setEditingProjects((current) => ({
                      ...current,
                      [index]: false,
                    }));
                  requestAnimationFrame(() => {
                    priceInputs.current[index]?.focus();
                    priceInputs.current[index]?.select();
                  });
                }}
              />
            )}
            {(!progressive || itemComplete) && (
              <div className="quote-progressive-reveal">
                <div className="quote-required-part">
                  <strong className="quote-required-part-label">
                    {it.requiredPart} ({it.optional})
                  </strong>
                  {selectedProduct && !editingParts[index] ? (
                    <div className="selection-summary selected-part-summary">
                      <span className="selection-summary-icon is-part">
                        <Package size={18} aria-hidden="true" />
                      </span>
                      <div className="selection-summary-copy">
                        <strong>{selectedProduct.name}</strong>
                        <small>
                          {selectedProduct.category} · {it.actualStock}{" "}
                          {selectedProduct.stock} · {it.reservedStock}{" "}
                          {selectedProduct.reserved ?? 0} · {it.availableStock}{" "}
                          {selectedProduct.available ?? selectedProduct.stock} ·{" "}
                          <span
                            className={`part-stock ${(selectedProduct.available ?? selectedProduct.stock) > 0 ? "is-available" : "is-empty"}`}
                          >
                            ●{" "}
                            {(selectedProduct.available ??
                              selectedProduct.stock) > 0
                              ? it.partInStock
                              : it.partOutOfStock}
                          </span>
                        </small>
                      </div>
                      <button
                        type="button"
                        className="summary-action"
                        onClick={() =>
                          setEditingParts((current) => ({
                            ...current,
                            [index]: true,
                          }))
                        }
                      >
                        <span>{it.change}</span>
                        <ChevronRight size={15} aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <SearchableCombobox
                      value={item.requiredProductId ?? ""}
                      onChange={(requiredProductId) => {
                        update(index, {
                          requiredProductId,
                          requiredQuantity: 1,
                          requiredProductRemoved: !requiredProductId,
                        });
                        setEditingParts((current) => ({
                          ...current,
                          [index]: false,
                        }));
                      }}
                      ariaLabel={`${it.requiredPart} ${index + 1}`}
                      placeholder={it.searchInventoryPart}
                      searchPlaceholder={it.searchInventoryPart}
                      emptyText={it.noMatches}
                      autoFocusQuery={
                        editingParts[index] ? selectedProduct?.name : undefined
                      }
                      groups={[
                        ...(editingParts[index] && selectedProduct
                          ? [
                              {
                                options: [
                                  { value: "", label: it.noRequiredPart },
                                ],
                              },
                            ]
                          : []),
                        {
                          options: availableProducts.map((product) => ({
                            value: product.id,
                            label: product.name,
                            secondary: product.category,
                            keywords: product.category,
                            trailing: (
                              <span
                                className={`part-stock ${(product.available ?? product.stock) > 0 ? "is-available" : "is-empty"}`}
                              >
                                {it.actualStock} {product.stock} ·{" "}
                                {it.reservedStock} {product.reserved ?? 0} ·{" "}
                                {it.availableStock}{" "}
                                {product.available ?? product.stock} · ●{" "}
                                {(product.available ?? product.stock) > 0
                                  ? it.partInStock
                                  : it.partOutOfStock}
                              </span>
                            ),
                          })),
                        },
                      ]}
                      onClose={() =>
                        setEditingParts((current) => ({
                          ...current,
                          [index]: false,
                        }))
                      }
                      customLabel={it.newPart}
                      onCustom={(query) => setCreatingPart({ index, query })}
                      clearable
                    />
                  )}
                </div>
                {partShortage && (
                  <p className="message warning">{it.requiredPartOutOfStock}</p>
                )}
                {discounts &&
                  (item.discountVisible ||
                    numeric(item.discount ?? "0") > 0) && (
                    <Field label={`${it.itemDiscount} ${index + 1}`}>
                      <input
                        inputMode="decimal"
                        required
                        value={item.discount ?? "0"}
                        onChange={(e) =>
                          update(index, { discount: e.target.value })
                        }
                      />
                    </Field>
                  )}
                <div className="item-actions">
                  {discounts && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        update(index, {
                          discountVisible: !(
                            item.discountVisible ||
                            numeric(item.discount ?? "0") > 0
                          ),
                          discount: "0",
                        })
                      }
                    >
                      {item.discountVisible || numeric(item.discount ?? "0") > 0
                        ? it.cancelDiscount
                        : it.addItemDiscount}
                    </Button>
                  )}
                </div>
              </div>
            )}
            {items.length > 1 && (
              <RecordIcon
                kind="delete"
                label={it.remove + " " + it.project + " " + (index + 1)}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              />
            )}
          </div>
        );
      })}
      {(!progressive ||
        items.every(
          (item) => item.project.trim() && validAmount(item.final),
        )) && (
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...items, blankItem()])}
        >
          <Plus size={16} />
          {it.addItem}
        </Button>
      )}
      {(!progressive ||
        items.some(
          (item) => item.project.trim() && validAmount(item.final),
        )) && (
        <div className="quote-total quote-progressive-reveal">
          <span>{it.originalTotal}</span>
          <strong>
            {money(items.reduce((sum, item) => sum + numeric(item.final), 0))}
          </strong>
        </div>
      )}
      {creatingPart && (
        <FormDialog
          title={it.newRepairPart}
          onClose={() => setCreatingPart(null)}
        >
          <ProductForm
            categories={productCategories}
            mode="inventory"
            initialName={creatingPart.query}
            initialUsage="REPAIR"
            quickRepair
            onClose={() => setCreatingPart(null)}
            onCreated={(product) => {
              setCreatedProducts((current) => [...current, product]);
              update(creatingPart.index, {
                requiredProductId: product.id,
                requiredQuantity: 1,
                requiredProductRemoved: false,
              });
            }}
          />
        </FormDialog>
      )}
    </div>
  );
}

export function NewOrderForm({
  rules,
  faultOptions,
  devices,
  customers,
}: {
  rules: RuleView[];
  owner?: boolean;
  faultOptions: { category: string; name: string; hidden: boolean }[];
  devices: { category: string; brand: string; model: string }[];
  customers: {
    id: string;
    name: string;
    phone: string;
    phones: { phone: string }[];
  }[];
}) {
  const it = useMessages();
  const today = useBusinessDay();
  const { locale } = useLanguage();
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [customer, setCustomer] =
    useState<Awaited<ReturnType<typeof lookupCustomerAction>>>(null);
  const [customerConfirmed, setCustomerConfirmed] = useState(false);
  const [hiddenFaults, setHiddenFaults] = useState<string[]>([]);
  const [managingFaults, setManagingFaults] = useState(false);
  const [customFault, setCustomFault] = useState("");
  const [localFaults, setLocalFaults] = useState<string[]>([]);
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [paymentNow, setPaymentNow] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<z.input<typeof orderInput>, unknown, z.output<typeof orderInput>>(
    {
      resolver: zodResolver(orderInput),
      defaultValues: {
        requestId,
        customerName: "",
        phone: "",
        additionalPhones: [],
        privacyConsent: false,
        deviceId: "",
        category: "PHONE",
        brand: "",
        series: "",
        model: "",
        imei: "",
        appearance: "",
        accessories: "",
        fault: "",
        faults: [],
        notes: "",
        dueDate: "",
        items: [blankItem()],
        diagnosticFee: "10",
        deposit: "0",
        method: "CASH",
        paymentKind: "DEPOSIT",
        orderDiscount: "0",
        includeVat: false,
      },
    },
  );
  const values = useWatch({ control }) as z.input<typeof orderInput>;
  const category = values.category ?? "PHONE";
  const diagnostic = isDiagnosticFault([
    ...(values.faults ?? []),
    values.fault ?? "",
  ]);
  useEffect(() => {
    if ((values.phone ?? "").trim().length < 6) {
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const found = await lookupCustomerAction(values.phone);
        if (active) {
          setCustomer(found);
          if (found) {
            setValue("customerName", found.name);
            setValue("phone", found.phone);
            setValue(
              "additionalPhones",
              found.phones.map((p) => p.phone).filter((p) => p !== found.phone),
            );
          }
        }
      } catch {
        if (active) setError("Connessione non disponibile. Riprova.");
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [values.phone, setValue]);
  const knownDevices = devices.filter((d) => d.category === category);
  const brandOptions = [
    ...new Set([
      ...brands[category],
      ...knownDevices.map((d) => d.brand),
      ...rules.filter((r) => r.category === category).map((r) => r.brand),
    ]),
  ];
  const modelOptions = [
    ...new Set([
      ...(models[category]?.[values.brand] ?? []),
      ...knownDevices
        .filter((d) => d.brand.toLowerCase() === values.brand.toLowerCase())
        .map((d) => d.model),
      ...rules
        .filter(
          (r) =>
            r.category === category &&
            r.brand.toLowerCase() === values.brand.toLowerCase() &&
            r.model,
        )
        .map((r) => r.model),
    ]),
  ];
  const presets = faultPresets(category);
  const faults = [
    ...new Map(
      [
        ...presets.map(([name, zh]) => ({
          name,
          label: locale === "zh" ? zh : name,
        })),
        ...faultOptions
          .filter((f) => f.category === category)
          .map((f) => ({
            name: f.name,
            label:
              presets.find(([n]) => n.toLowerCase() === f.name.toLowerCase())?.[
                locale === "zh" ? 1 : 0
              ] ?? f.name,
          })),
        ...localFaults.map((name) => ({ name, label: name })),
      ].map((f) => [f.name.toLowerCase(), f]),
    ).values(),
  ];
  const visibleFaults = faults.filter(
    (f) =>
      !faultOptions.some(
        (o) =>
          o.category === category &&
          o.hidden &&
          o.name.toLowerCase() === f.name.toLowerCase(),
      ) && !hiddenFaults.includes(category + ":" + f.name.toLowerCase()),
  );
  const customerUnchanged =
    !!customer &&
    values.customerName === customer.name &&
    values.phone === customer.phone &&
    JSON.stringify([...(values.additionalPhones ?? [])].sort()) ===
      JSON.stringify(
        customer.phones
          .map((p) => p.phone)
          .filter((p) => p !== customer.phone)
          .sort(),
      );
  async function confirmCustomer() {
    setError("");
    try {
      const found = await lookupCustomerAction(values.phone);
      if (!found && !window.confirm(it.addCustomerPrompt)) return false;
      const result = await customerAction(found?.id ?? null, {
        name: values.customerName,
        phone: found?.phone ?? values.phone,
        additionalPhones: values.additionalPhones ?? [],
      });
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      const saved = await lookupCustomerAction(values.phone);
      setCustomer(saved);
      setCustomerConfirmed(true);
      return true;
    } catch {
      setError("Connessione non disponibile. Riprova.");
      return false;
    }
  }
  const clearDevice = () => {
    setValue("deviceId", "");
    setValue("brand", "");
    setValue("series", "");
    setValue("model", "");
    setValue("imei", "");
  };
  return (
    <form
      className="order-form"
      onSubmit={handleSubmit(async (data) => {
        setPending(true);
        setError("");
        try {
          if (!customerConfirmed && !(await confirmCustomer())) return;
          const result = await createOrderAction(data);
          if (result.ok) router.push(`/orders/${result.id}`);
          else setError(result.error);
        } catch {
          setError("Connessione non disponibile. Riprova.");
        } finally {
          setPending(false);
        }
      })}
    >
      <Section number="01" title={it.customerSection}>
        <div className="form-grid">
          <EditableSelect
            label={it.phone}
            value={values.phone}
            required
            maxLength={30}
            options={customers.flatMap((c) =>
              uniqueOptions([c.phone, ...c.phones.map((p) => p.phone)]).map(
                (phone) => ({ value: phone, label: phone + " · " + c.name }),
              ),
            )}
            onChange={(phone) => {
              if (phone === values.phone) return;
              setValue("phone", phone);
              setCustomer(null);
              setCustomerConfirmed(false);
              setValue("customerName", "");
              setValue("additionalPhones", []);
              clearDevice();
            }}
          />
          <EditableSelect
            label={it.name}
            value={values.customerName}
            required
            options={customers.map((c) => ({
              value: c.id,
              label: c.name + " · " + c.phone,
            }))}
            onChange={(value) => {
              const found = customers.find((c) => c.id === value);
              setCustomerConfirmed(false);
              if (found) {
                clearDevice();
                setValue("customerName", found.name, { shouldDirty: true });
                setValue("phone", found.phone);
                setValue(
                  "additionalPhones",
                  found.phones
                    .map((phone) => phone.phone)
                    .filter((phone) => phone !== found.phone),
                );
                void lookupCustomerAction(found.phone).then((customer) =>
                  setCustomer(customer),
                );
              } else {
                setValue("customerName", value, { shouldDirty: true });
              }
            }}
          />
        </div>
        {(values.additionalPhones ?? []).map((phone, index) => (
          <div className="phone-row" key={index}>
            <Field label={it.phone + " " + (index + 2)}>
              <input
                type="tel"
                value={phone}
                required
                maxLength={30}
                onChange={(e) => {
                  setValue(
                    "additionalPhones",
                    (values.additionalPhones ?? []).map((p, i) =>
                      i === index ? e.target.value : p,
                    ),
                  );
                  setCustomerConfirmed(false);
                }}
              />
            </Field>
            <RecordIcon
              kind="delete"
              label={it.remove + " " + it.phone + " " + (index + 2)}
              onClick={() => {
                setValue(
                  "additionalPhones",
                  (values.additionalPhones ?? []).filter((_, i) => i !== index),
                );
                setCustomerConfirmed(false);
              }}
            />
          </div>
        ))}
        <div className="catalog-toolbar">
          <Button
            type="button"
            variant="outline"
            disabled={(values.additionalPhones ?? []).length >= 2}
            onClick={() => {
              setValue("additionalPhones", [
                ...(values.additionalPhones ?? []),
                "",
              ]);
              setCustomerConfirmed(false);
            }}
          >
            {it.addPhone}
          </Button>
          <Button
            type="button"
            disabled={pending || customerUnchanged}
            onClick={async () => {
              setPending(true);
              try {
                await confirmCustomer();
              } finally {
                setPending(false);
              }
            }}
          >
            {it.confirmCustomer}
          </Button>
          {customerConfirmed && (
            <span role="status">{it.customerConfirmed}</span>
          )}
        </div>
        {customer && <p className="quote-hint">{it.customerFound}</p>}
      </Section>
      <Section number="02" title={it.deviceSection}>
        {customer && customer.devices.length > 0 && (
          <Field label={it.chooseDevice}>
            <SimpleSelect
              value={values.deviceId}
              onChange={(deviceId) => {
                const d = customer.devices.find((d) => d.id === deviceId);
                setValue("deviceId", deviceId);
                const nextCategory = (d?.category ?? "PHONE") as Category;
                setValue("category", nextCategory);
                for (const key of [
                  "brand",
                  "series",
                  "model",
                  "imei",
                  "appearance",
                ] as const)
                  setValue(key, d?.[key] ?? "");
                setValue("faults", []);
                setLocalFaults([]);
              }}
              placeholder={it.newDevice}
              ariaLabel={it.chooseDevice}
              options={[
                { value: "", label: it.newDevice },
                ...customer.devices.map((device) => ({
                  value: device.id,
                  label: `${device.brand} ${device.model}`,
                  secondary: device.imei ?? undefined,
                })),
              ]}
            />
          </Field>
        )}
        <div className="form-grid three">
          <Field label={it.deviceType}>
            <input type="hidden" {...register("category")} />
            <SimpleSelect
              value={category}
              onChange={(next) => {
                setValue("category", next as Category);
                clearDevice();
                setValue("faults", []);
                setLocalFaults([]);
              }}
              disabled={!!values.deviceId}
              placeholder={it.selectOption}
              ariaLabel={it.deviceType}
              options={Object.entries(categories).map(([key, names]) => ({
                value: key,
                label: names[locale === "zh" ? 1 : 0],
              }))}
            />
          </Field>
          <EditableSelect
            label={it.brand}
            createLabel={it.customBrand}
            value={values.brand}
            required
            readOnly={!!values.deviceId}
            options={uniqueOptions(brandOptions)}
            normalize={normalizeBrand}
            onChange={(brand) => {
              setValue("brand", brand);
              setValue("model", "");
              setValue("series", "");
            }}
          />
          <EditableSelect
            label={it.model}
            createLabel={it.customModel}
            value={values.model}
            required
            readOnly={!!values.deviceId}
            options={uniqueOptions(modelOptions)}
            normalize={normalizeModel}
            onChange={(model) => setValue("model", model)}
          />
        </div>
        <div className="fault-options-heading">
          <strong>{it.fault}</strong>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setManagingFaults(!managingFaults)}
          >
            {managingFaults ? it.finishFaultManagement : it.manageFaults}
          </Button>
        </div>
        <fieldset className="fault-options" aria-label={it.fault}>
          {visibleFaults.map((f) => (
            <div className="fault-row" key={f.name}>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={(values.faults ?? []).includes(f.name)}
                  onChange={(e) =>
                    setValue(
                      "faults",
                      e.target.checked
                        ? [...(values.faults ?? []), f.name]
                        : (values.faults ?? []).filter((n) => n !== f.name),
                    )
                  }
                />
                {f.label}
              </label>
              {managingFaults && (
                <button
                  type="button"
                  aria-label={it.deleteFault + " " + f.label}
                  onClick={async () => {
                    try {
                      const result = await hideFaultAction(category, f.name);
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      const key = category + ":" + f.name.toLowerCase();
                      setHiddenFaults([...hiddenFaults, key]);
                      setValue(
                        "faults",
                        (values.faults ?? []).filter((n) => n !== f.name),
                      );
                    } catch {
                      setError("Connessione non disponibile. Riprova.");
                    }
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </fieldset>
        <div className="input-action">
          <Field label={it.faultOther}>
            <input
              value={customFault}
              maxLength={120}
              onChange={(e) => setCustomFault(e.target.value)}
            />
          </Field>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const typed = customFault.trim();
              if (!typed) return;
              const name =
                faults.find((f) => f.name.toLowerCase() === typed.toLowerCase())
                  ?.name ?? typed;
              setLocalFaults([...localFaults, name]);
              setValue("faults", [
                ...new Set([...(values.faults ?? []), name]),
              ]);
              setCustomFault("");
            }}
          >
            {it.addFault}
          </Button>
        </div>
        <Field label={it.faultNotes}>
          <textarea {...register("fault")} maxLength={2000} rows={2} />
        </Field>
        <Field label={it.dueDate}>
          <input {...register("dueDate")} type="date" min={today} />
        </Field>
      </Section>
      <Section number="03" title={it.quoteSection}>
        {diagnostic ? (
          <Field label={it.diagnosticFee}>
            <input
              {...register("diagnosticFee")}
              required
              inputMode="decimal"
            />
          </Field>
        ) : (
          <ItemsEditor
            items={values.items.map((i) => ({
              ...i,
              adjustmentReason: i.adjustmentReason ?? "",
              requiredQuantity: Number(i.requiredQuantity ?? 1),
            }))}
            onChange={(items) => setValue("items", items)}
            rules={rules}
            device={{
              category,
              brand: values.brand,
              series: values.series ?? "",
              model: values.model,
            }}
            discounts
          />
        )}
        <div className="quote-adjustments">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDiscountEnabled(!discountEnabled);
              setValue("orderDiscount", "0");
            }}
          >
            {discountEnabled ? it.cancelDiscount : it.addOrderDiscount}
          </Button>
          {discountEnabled && (
            <Field label={it.orderDiscount}>
              <input
                {...register("orderDiscount")}
                required
                inputMode="decimal"
              />
            </Field>
          )}
          <label className="checkbox">
            <input type="checkbox" {...register("includeVat")} />
            {it.includeVat}
          </label>
        </div>
        <QuoteSummary
          items={
            diagnostic
              ? [{ final: values.diagnosticFee ?? "10", discount: "0" }]
              : values.items
          }
          orderDiscount={values.orderDiscount ?? "0"}
          includeVat={values.includeVat ?? false}
        />
      </Section>
      <Section number="04" title={it.paymentSection}>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={paymentNow}
            onChange={(e) => {
              setPaymentNow(e.target.checked);
              if (!e.target.checked) setValue("deposit", "0");
            }}
          />
          {it.paymentNow}
        </label>
        {paymentNow && (
          <div className="form-grid three">
            <Field label={it.initialPayment}>
              <input {...register("deposit")} required inputMode="decimal" />
            </Field>

            <Field label={it.paymentMethod}>
              <input type="hidden" {...register("method")} />
              <SimpleSelect
                value={values.method}
                onChange={(method) =>
                  setValue(
                    "method",
                    method as (typeof creatablePaymentMethods)[number],
                  )
                }
                placeholder={it.selectOption}
                ariaLabel={it.paymentMethod}
                options={creatablePaymentMethods.map((method) => ({
                  value: method,
                  label: it.methods[method],
                }))}
              />
            </Field>
          </div>
        )}
      </Section>
      {Object.keys(errors).length > 0 && (
        <p className="message error" role="alert">
          {it.validationError}
        </p>
      )}
      <Message error={error} />
      <div className="form-footer">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {it.cancel}
        </Button>
        <Button disabled={pending}>{pending ? it.saving : it.create}</Button>
      </div>
    </form>
  );
}

export function QuoteSummary({
  items,
  orderDiscount,
  includeVat,
  inspectionFee = "0",
}: {
  items: { final: string; discount?: string }[];
  orderDiscount: string;
  includeVat: boolean;
  inspectionFee?: string;
}) {
  const it = useMessages();
  let q;
  try {
    q = settlement(items, { orderDiscount, includeVat, inspectionFee });
  } catch {
    return <p className="field-error">{it.invalidAmount}</p>;
  }
  return (
    <dl className="quote-summary">
      {[
        [it.originalTotal, q.gross],
        [it.discountTotal, q.discount],
        [it.netTotal, q.net],
        [it.vatAmount, q.vat],
        [it.withVat, q.withVat],
        [it.total, q.due],
      ].map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{money(Number(value))}</dd>
        </div>
      ))}
    </dl>
  );
}

type ActionResult = { ok: boolean; error?: string };
function ActionForm({
  action,
  children,
  submit,
  onSuccess,
  disabled = false,
}: {
  action: (data: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submit: string;
  onSuccess?: () => void;
  disabled?: boolean;
}) {
  const it = useMessages();
  const closeDialog = useContext(FormCloseContext);
  const registerAutoSave = useContext(FormAutoSaveContext);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const initial = useRef("");
  const initialized = useRef(false);
  const activeSave = useRef<Promise<boolean> | null>(null);
  const router = useRouter();
  const snapshot = useCallback((element: HTMLFormElement) => {
    return JSON.stringify(
      Array.from(element.elements).flatMap((control) => {
        if (!(
          control instanceof HTMLInputElement ||
          control instanceof HTMLSelectElement ||
          control instanceof HTMLTextAreaElement
        ))
          return [];
        return [
          [
            control.name,
            control.type,
            "checked" in control ? control.checked : null,
            control.value,
          ],
        ];
      }),
    );
  }, []);
  const save = useCallback(
    (element: HTMLFormElement) => {
      if (activeSave.current) return activeSave.current;
      const current = snapshot(element);
      if (registerAutoSave && current === initial.current)
        return Promise.resolve(true);
      const request = (async () => {
        setPending(true);
        setError("");
        setSuccess(false);
        try {
          const result = await action(new FormData(element));
          if (!result.ok) {
            setError(result.error ?? "Errore");
            return false;
          }
          initial.current = current;
          setSuccess(true);
          onSuccess?.();
          router.refresh();
          return true;
        } catch {
          setError("Connessione non disponibile. Riprova.");
          return false;
        } finally {
          setPending(false);
          activeSave.current = null;
        }
      })();
      activeSave.current = request;
      return request;
    },
    [action, onSuccess, registerAutoSave, router, snapshot],
  );
  useEffect(() => {
    if (!form.current || initialized.current) return;
    initialized.current = true;
    initial.current = snapshot(form.current);
  }, [snapshot]);
  useEffect(() => {
    if (!registerAutoSave) return;
    registerAutoSave(() =>
      form.current ? save(form.current) : Promise.resolve(true),
    );
    return () => registerAutoSave(null);
  }, [registerAutoSave, save]);
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await save(event.currentTarget)) {
      if (registerAutoSave) closeDialog?.();
    }
  }
  return (
    <form
      ref={form}
      onSubmit={handle}
      className="action-form"
      aria-busy={pending}
    >
      {children}
      <Message error={error} success={success} />
      {closeDialog ? (
        <div className="dialog-actions">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={closeDialog}
          >
            {it.cancel}
          </Button>
          <Button disabled={pending || disabled}>
            {pending ? it.saving : submit}
          </Button>
        </div>
      ) : (
        <Button disabled={pending || disabled}>
          {pending ? it.saving : submit}
        </Button>
      )}
    </form>
  );
}
const str = (data: FormData, key: string) => String(data.get(key) ?? "");
export function PaymentForm({
  id,
  remaining,
}: {
  id: string;
  remaining: number;
}) {
  const it = useMessages();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [method, setMethod] = useState("CASH");
  return (
    <ActionForm
      submit={it.addPayment}
      onSuccess={() => setRequestId(crypto.randomUUID())}
      action={(data) =>
        paymentAction(id, {
          requestId,
          amount: str(data, "amount"),
          method,
          kind: "BALANCE",
        })
      }
    >
      <div className="form-grid">
        <Field label={it.amount}>
          <input
            name="amount"
            inputMode="decimal"
            defaultValue={decimal(Math.max(0, remaining))}
            required
          />
        </Field>
        <Field label={it.paymentMethod}>
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
        </Field>
      </div>
    </ActionForm>
  );
}
export function EditOrderForm({
  id,
  values,
  customers,
  faultOptions,
}: {
  id: string;
  customers: {
    id: string;
    name: string;
    phone: string;
    phones: { phone: string }[];
  }[];
  faultOptions: FaultCatalogItem[];
  values: {
    customerId: string;
    category: string;
    fault: string;
    faultNote: string;
    standardFaultIds: string[];
    notes: string;
    accessories: string;
    dueDate: string | null;
  };
}) {
  const it = useMessages();
  const today = useBusinessDay();
  const [customerId, setCustomerId] = useState(values.customerId);
  const [localCustomers, setLocalCustomers] = useState(customers);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerError, setCustomerError] = useState("");
  const [customerPending, setCustomerPending] = useState(false);
  const [standardFaultIds, setStandardFaultIds] = useState(
    values.standardFaultIds,
  );
  const [faults, setFaults] = useState(faultOptions);
  function openCustomer(query: string) {
    const value = query.trim();
    const phone = /^[+\d\s().-]{6,}$/.test(value);
    setCustomerName(phone ? "" : value);
    setCustomerPhone(phone ? value : "");
    setCustomerError("");
    setAddingCustomer(true);
  }
  return (
    <>
      <ActionForm
        submit={it.save}
        action={(data) =>
          updateOrderAction(id, {
            ...Object.fromEntries(data),
            customerId,
            standardFaultIds,
            accessories: values.accessories,
          })
        }
      >
        <Field label={it.customer}>
          <SearchableCombobox
            value={customerId}
            onChange={setCustomerId}
            ariaLabel={it.searchCustomer}
            placeholder={it.customerSearchPlaceholder}
            searchPlaceholder={it.customerSearchPlaceholder}
            emptyText={it.noCustomerMatches}
            customLabel={it.addCustomer}
            onCustom={openCustomer}
            groups={[
              {
                options: localCustomers.map((customer) => ({
                  value: customer.id,
                  label: customer.name,
                  secondary: customer.phone,
                  keywords: customer.phones
                    .map((phone) => phone.phone)
                    .join(" "),
                })),
              },
            ]}
          />
        </Field>
        <FaultSelector
          category={values.category}
          items={faults}
          selected={standardFaultIds}
          onChange={setStandardFaultIds}
          onItemsChange={setFaults}
        />
        <input type="hidden" name="fault" value={values.fault} />
        <Field label={it.faultNotes}>
          <textarea
            name="faultNote"
            defaultValue={values.faultNote}
            maxLength={2000}
          />
        </Field>
        <Field label={it.dueDate}>
          <input
            type="date"
            name="dueDate"
            min={today}
            defaultValue={values.dueDate ?? ""}
          />
        </Field>
        <Field label={it.notes}>
          <textarea name="notes" defaultValue={values.notes} maxLength={2000} />
        </Field>
      </ActionForm>
      {addingCustomer && (
        <FormDialog
          title={it.addCustomer}
          onClose={() => setAddingCustomer(false)}
        >
          <form
            className="dialog-form"
            data-form-dialog-body
            onSubmit={(event) => {
              event.preventDefault();
              if (customerPending) return;
              setCustomerPending(true);
              setCustomerError("");
              void customerAction(null, {
                name: customerName,
                phone: customerPhone,
                additionalPhones: [],
              })
                .then(async (result) => {
                  if (!result.ok) return setCustomerError(result.error);
                  const created = await lookupCustomerAction(customerPhone);
                  if (!created) return setCustomerError(it.connectionError);
                  setLocalCustomers((current) => [...current, created]);
                  setCustomerId(created.id);
                  setAddingCustomer(false);
                })
                .finally(() => setCustomerPending(false));
            }}
          >
            <Field label={`${it.name} *`}>
              <input
                required
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
            </Field>
            <Field label={`${it.phone} *`}>
              <input
                required
                type="tel"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
              />
            </Field>
            {customerError && <p className="message error">{customerError}</p>}
            <div className="dialog-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddingCustomer(false)}
              >
                {it.cancel}
              </Button>
              <Button disabled={customerPending}>
                {customerPending ? it.saving : it.saveCustomer}
              </Button>
            </div>
          </form>
        </FormDialog>
      )}
    </>
  );
}

export function WarrantyForm({
  id,
  items,
}: {
  id: string;
  items: { id: string; project: string; days: number; notes: string }[];
}) {
  const it = useMessages();
  const [values, setValues] = useState(items);
  return (
    <ActionForm
      submit={it.save}
      action={(data) =>
        warrantyAction(id, {
          items: items.map((item) => ({
            id: item.id,
            days: Number(data.get(`warranty-days-${item.id}`)),
            notes: String(data.get(`warranty-notes-${item.id}`) ?? ""),
          })),
        })
      }
    >
      <div className="project-warranty-editor">
        {values.map((item, index) => (
          <section key={item.id}>
            <strong>{item.project}</strong>
            <Field label={it.warranty.duration}>
              <SimpleSelect
                name={`warranty-days-${item.id}`}
                value={String(item.days)}
                onChange={(days) =>
                  setValues((current) =>
                    current.map((entry, i) =>
                      i === index ? { ...entry, days: Number(days) } : entry,
                    ),
                  )
                }
                placeholder={it.selectOption}
                ariaLabel={`${it.warranty.duration} ${item.project}`}
                options={[0, 7, 30, 60, 90, 180, 365].map((days) => ({
                  value: String(days),
                  label: days
                    ? `${days} ${it.warranty.days}`
                    : it.warranty.none,
                }))}
              />
            </Field>
            <Field label={it.warranty.notes}>
              <textarea
                name={`warranty-notes-${item.id}`}
                value={item.notes}
                maxLength={2000}
                onChange={(event) =>
                  setValues((current) =>
                    current.map((entry, i) =>
                      i === index
                        ? { ...entry, notes: event.target.value }
                        : entry,
                    ),
                  )
                }
              />
            </Field>
          </section>
        ))}
      </div>
    </ActionForm>
  );
}

export type AfterSalesProject = {
  id: string;
  name: string;
  price: string;
  warranty: AfterSalesWarranty;
  warrantyDays: number;
  reworked: boolean;
  requiredProductId?: string;
  requiredQuantity?: number;
};
export type AfterSalesWarranty = {
  start: string;
  end: string;
  progress: number;
  remainingPercent: number;
  remainingDays: number;
  elapsedDays: number;
  totalDays: number;
  state: "ACTIVE" | "EXPIRING" | "EXPIRED";
} | null;

export function WarrantyProgressPanel({
  warranty,
  days,
}: {
  warranty: AfterSalesWarranty;
  days?: number;
}) {
  const it = useMessages();
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!warranty) return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 100;
    const timer = window.setTimeout(
      () => setProgress(warranty.progress),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [warranty]);
  if (!warranty)
    return (
      <section className="warranty-progress-panel is-none">
        <ShieldCheck size={19} aria-hidden="true" />
        <div>
          <strong>
            {days ? `${days} ${it.warranty.days}` : it.afterSales.noWarranty}
          </strong>
          <p>
            {days
              ? it.warranty.startsAfterDelivery
              : it.afterSales.noWarrantyHint}
          </p>
        </div>
      </section>
    );
  const tone =
    warranty.state === "EXPIRED"
      ? "expired"
      : warranty.remainingPercent <= 20
        ? "ending"
        : warranty.remainingPercent <= 50
          ? "warning"
          : "healthy";
  const title =
    warranty.state === "EXPIRED"
      ? it.afterSales.warrantyExpired
      : warranty.state === "EXPIRING"
        ? it.afterSales.warrantyExpiring
        : it.afterSales.warrantyActive;
  return (
    <section className={`warranty-progress-panel is-${tone}`}>
      <ShieldCheck size={19} aria-hidden="true" />
      <div className="warranty-progress-content">
        <strong>{days ? `${days} ${it.warranty.days}` : title}</strong>
        <p>
          {title}
          {warranty.state !== "EXPIRED" &&
            ` · ${it.afterSales.remainingDays.replace("{count}", String(warranty.remainingDays))}`}
        </p>
        <div className="warranty-progress-labels">
          <span>
            {warranty.elapsedDays} / {warranty.totalDays} {it.warranty.days}{" "}
            {it.afterSales.used}
          </span>
          <span>
            {100 - progress}% {it.afterSales.remaining}
          </span>
        </div>
        <div className="warranty-progress-track" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="warranty-progress-dates">
          <span>{it.afterSales.warrantyUntil}</span>
          <span>{warranty.end.replaceAll("-", "/")}</span>
        </div>
      </div>
    </section>
  );
}

export function ReworkPartEditor({
  orderId,
  itemId,
  value,
  products,
}: {
  orderId: string;
  itemId: string;
  value: string;
  products: CreatedProduct[];
}) {
  const it = useMessages();
  const router = useRouter();
  const [selected, setSelected] = useState(value);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="rework-part-editor">
      <SearchableCombobox
        value={selected}
        disabled={pending}
        onChange={(productId) => {
          setSelected(productId);
          startTransition(async () => {
            const result = await updateReworkPartAction(orderId, itemId, {
              productId,
              quantity: 1,
            });
            if (!result.ok) {
              setSelected(value);
              setError(result.error);
              return;
            }
            setError("");
            router.refresh();
          });
        }}
        ariaLabel={it.requiredPart}
        placeholder={it.noRequiredPart}
        searchPlaceholder={it.searchInventoryPart}
        emptyText={it.noMatches}
        clearable
        groups={[
          {
            options: products.map((product) => ({
              value: product.id,
              label: product.name,
              secondary: product.category,
              trailing: `${it.actualStock} ${product.stock} · ${it.reservedStock} ${product.reserved ?? 0} · ${it.availableStock} ${product.available ?? product.stock}`,
            })),
          },
        ]}
      />
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export function AfterSalesForm({
  id,
  originalProjects,
  products,
  onSuccess,
}: {
  id: string;
  originalProjects: AfterSalesProject[];
  products: CreatedProduct[];
  onSuccess?: () => void;
}) {
  const it = useMessages();
  const today = useBusinessDay();
  const available = originalProjects.filter((project) => !project.reworked);
  const [selected, setSelected] = useState<string[]>(
    available.length === 1 ? [available[0].id] : [],
  );
  const [itemValues, setItemValues] = useState<
    Record<
      string,
      {
        treatment: "WARRANTY" | "PAID";
        fee: string;
        requiredProductId: string;
      }
    >
  >(() =>
    Object.fromEntries(
      available.map((project) => [
        project.id,
        {
          treatment:
            project.warranty && project.warranty.state !== "EXPIRED"
              ? "WARRANTY"
              : "PAID",
          fee: "0",
          requiredProductId: project.requiredProductId ?? "",
        },
      ]),
    ),
  );
  const [notes, setNotes] = useState("");
  return (
    <ActionForm
      submit={it.afterSales.openRework}
      onSuccess={onSuccess}
      disabled={
        !selected.length ||
        selected.some((id) => !validAmount(itemValues[id]?.fee ?? ""))
      }
      action={(data) =>
        afterSalesAction(id, {
          items: selected.map((originalItemId) => ({
            originalItemId,
            treatment: itemValues[originalItemId].treatment,
            fee:
              itemValues[originalItemId].treatment === "WARRANTY"
                ? "0"
                : itemValues[originalItemId].fee,
            requiredProductId: itemValues[originalItemId].requiredProductId,
            requiredQuantity:
              originalProjects.find((project) => project.id === originalItemId)
                ?.requiredQuantity ?? 1,
          })),
          notes: str(data, "notes"),
          dueDate: str(data, "dueDate"),
        })
      }
    >
      <div className="rework-project-list">
        {originalProjects.map((project) => {
          const checked = selected.includes(project.id);
          const value = itemValues[project.id];
          return (
            <section
              className={project.reworked ? "is-disabled" : ""}
              key={project.id}
            >
              <label className="checkbox">
                <input
                  type="checkbox"
                  disabled={project.reworked}
                  checked={checked}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, project.id]
                        : current.filter((id) => id !== project.id),
                    )
                  }
                />
                <strong>{project.name}</strong>
                <span>{project.price}</span>
              </label>
              {project.reworked && <p>{it.afterSales.alreadyReworked}</p>}
              {!project.reworked && (
                <WarrantyProgressPanel
                  warranty={project.warranty}
                  days={project.warrantyDays}
                />
              )}
              {checked && value && (
                <>
                  <fieldset className="after-sales-treatment">
                    <legend>{it.afterSales.treatment}</legend>
                    {(["WARRANTY", "PAID"] as const).map((choice) => (
                      <label
                        className={`after-sales-radio ${value.treatment === choice ? "is-selected" : ""}`}
                        key={choice}
                      >
                        <input
                          type="radio"
                          checked={value.treatment === choice}
                          onChange={() =>
                            setItemValues((current) => ({
                              ...current,
                              [project.id]: {
                                ...value,
                                treatment: choice,
                                fee: choice === "WARRANTY" ? "0" : value.fee,
                              },
                            }))
                          }
                        />
                        <span>
                          <strong>
                            {choice === "WARRANTY"
                              ? it.afterSales.warrantyTreatment
                              : it.afterSales.paidTreatment}
                          </strong>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  {value.treatment === "PAID" && (
                    <Field label={it.afterSales.fee}>
                      <input
                        inputMode="decimal"
                        value={value.fee}
                        aria-invalid={!validAmount(value.fee)}
                        onChange={(event) =>
                          setItemValues((current) => ({
                            ...current,
                            [project.id]: { ...value, fee: event.target.value },
                          }))
                        }
                      />
                    </Field>
                  )}
                  <Field label={it.requiredPart}>
                    <SearchableCombobox
                      value={value.requiredProductId}
                      onChange={(requiredProductId) =>
                        setItemValues((current) => ({
                          ...current,
                          [project.id]: { ...value, requiredProductId },
                        }))
                      }
                      ariaLabel={`${it.requiredPart} ${project.name}`}
                      placeholder={it.noRequiredPart}
                      searchPlaceholder={it.searchInventoryPart}
                      emptyText={it.noMatches}
                      clearable
                      groups={[
                        {
                          options: products.map((product) => ({
                            value: product.id,
                            label: product.name,
                            secondary: product.category,
                            trailing: `${it.actualStock} ${product.stock} · ${it.availableStock} ${product.available ?? product.stock}`,
                          })),
                        },
                      ]}
                    />
                  </Field>
                </>
              )}
            </section>
          );
        })}
      </div>
      <Field label={it.afterSales.notes} className="after-sales-notes">
        <textarea
          name="notes"
          rows={3}
          maxLength={200}
          value={notes}
          placeholder={it.afterSales.notesPlaceholder}
          onChange={(event) => setNotes(event.target.value)}
        />
        <small>{notes.length}/200</small>
      </Field>
      <div className="after-sales-grid">
        <Field label={it.afterSales.dueDate}>
          <DatePicker name="dueDate" min={today} />
        </Field>
      </div>
    </ActionForm>
  );
}

export function RefundForm({ id, received }: { id: string; received: number }) {
  const it = useMessages();
  const [requestId] = useState(() => crypto.randomUUID());
  const [method, setMethod] = useState("CASH");
  return (
    <ActionForm
      submit={it.afterSales.confirmRefund}
      action={(data) =>
        refundAction(id, {
          requestId,
          method,
          reason: str(data, "reason"),
        })
      }
    >
      <p className="message warning">{it.afterSales.refundWarning}</p>
      <Field label={it.afterSales.currentReceived}>
        <input readOnly value={money(received)} />
      </Field>
      <Field label={it.afterSales.refundAmount}>
        <input readOnly value={money(received)} />
      </Field>
      <Field label={it.afterSales.refundMethod}>
        <SimpleSelect
          name="method"
          value={method}
          onChange={setMethod}
          placeholder={it.selectOption}
          ariaLabel={it.afterSales.refundMethod}
          options={creatablePaymentMethods.map((option) => ({
            value: option,
            label: it.methods[option],
          }))}
        />
      </Field>
      <Field label={it.afterSales.refundReason}>
        <textarea name="reason" required maxLength={2000} />
      </Field>
    </ActionForm>
  );
}
export function EditQuoteForm({
  id,
  initial,
  initialDiscount = "0",
  initialVat = false,
  inspectionFee = "0",
  rules,
  device,
  products = [],
  productCategories = [],
}: {
  id: string;
  initial: ItemView[];
  initialDiscount?: string;
  initialVat?: boolean;
  inspectionFee?: string;
  rules: RuleView[];
  products?: {
    id: string;
    name: string;
    category: string;
    stock: number;
    reserved?: number;
    available?: number;
  }[];
  productCategories?: CategoryView[];
  device: { category: string; brand: string; series: string; model: string };
  owner: boolean;
}) {
  const it = useMessages();
  const [items, setItems] = useState(initial);
  const [orderDiscount, setOrderDiscount] = useState(initialDiscount);
  const [includeVat, setIncludeVat] = useState(initialVat);
  const [discounts, setDiscounts] = useState(numeric(initialDiscount) > 0);
  return (
    <ActionForm
      submit={it.save}
      action={() => quoteAction(id, { items, orderDiscount, includeVat })}
    >
      <p className="message warning">{it.quoteNotice}</p>
      <ItemsEditor
        items={items}
        onChange={setItems}
        rules={rules}
        device={device}
        discounts
        products={products}
        productCategories={productCategories}
      />
      <div className="quote-adjustments">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDiscounts(!discounts);
            setOrderDiscount("0");
          }}
        >
          {discounts ? it.cancelDiscount : it.addOrderDiscount}
        </Button>
        {discounts && (
          <Field label={it.orderDiscount}>
            <input
              inputMode="decimal"
              required
              value={orderDiscount}
              onChange={(e) => setOrderDiscount(e.target.value)}
            />
          </Field>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={includeVat}
            onChange={(e) => setIncludeVat(e.target.checked)}
          />
          {it.includeVat}
        </label>
      </div>
      <QuoteSummary
        items={items}
        orderDiscount={orderDiscount}
        includeVat={includeVat}
        inspectionFee={inspectionFee}
      />
    </ActionForm>
  );
}
export function RuleForm({
  rule,
  rules = [],
  repairProducts = [],
  initial,
  onSuccess,
}: {
  rule?: RuleView;
  rules?: RuleView[];
  repairProducts?: { id: string; name: string; stockQuantity: number }[];
  initial?: Partial<RuleView>;
  onSuccess?: (device: {
    category: string;
    brand: string;
    model: string;
  }) => void;
}) {
  const it = useMessages();
  const { locale } = useLanguage();
  const [category, setCategory] = useState<Category>(
    ((rule?.category ?? initial?.category) as Category) ?? "PHONE",
  );
  const [brand, setBrand] = useState(rule?.brand ?? initial?.brand ?? "");
  const [model, setModel] = useState(rule?.model ?? initial?.model ?? "");
  const [project, setProject] = useState(rule?.project ?? "");
  const [requiredProductId, setRequiredProductId] = useState(
    rule?.requiredProductId ?? "",
  );
  return (
    <ActionForm
      submit={it.save}
      onSuccess={() =>
        onSuccess?.({
          category,
          brand: normalizeBrand(brand),
          model: normalizeModel(model),
        })
      }
      action={(data) =>
        ruleAction(rule?.id ?? null, {
          ...Object.fromEntries(data),
          category,
          brand,
          model,
          project,
          requiredProductId,
          series: model ? "" : (rule?.series ?? ""),
          minutes: rule?.minutes ?? 60,
          enabled: true,
        })
      }
    >
      <div className="form-grid three">
        <Field label={it.deviceType}>
          <SimpleSelect
            value={category}
            onChange={(value) => {
              setCategory(value as Category);
              setBrand("");
              setModel("");
            }}
            placeholder={it.selectOption}
            ariaLabel={it.deviceType}
            options={Object.entries(categories).map(([key, names]) => ({
              value: key,
              label: names[locale === "zh" ? 1 : 0],
            }))}
          />
        </Field>
        <EditableSelect
          label={it.brand}
          createLabel={it.customBrand}
          value={brand}
          onChange={(v) => {
            setBrand(v);
            setModel("");
          }}
          options={uniqueOptions([
            ...brands[category],
            ...rules.filter((r) => r.category === category).map((r) => r.brand),
          ])}
          normalize={normalizeBrand}
        />
        <EditableSelect
          label={it.model}
          createLabel={it.customModel}
          value={model}
          onChange={setModel}
          options={uniqueOptions(
            rules
              .filter(
                (r) =>
                  r.category === category &&
                  r.brand.toLowerCase() === brand.toLowerCase(),
              )
              .map((r) => r.model),
          )}
          normalize={normalizeModel}
        />
      </div>
      <EditableSelect
        label={it.project}
        createLabel={it.afterSales.addCustomProject}
        value={project}
        onChange={setProject}
        options={uniqueOptions(
          rules
            .filter(
              (r) =>
                r.category === category &&
                r.brand.toLowerCase() === brand.toLowerCase() &&
                r.model.toLowerCase() === model.toLowerCase(),
            )
            .map((r) => r.project),
        )}
        required
      />
      <div className="form-grid">
        <Field label={it.suggested + " (€)"}>
          <input
            name="suggested"
            required
            inputMode="decimal"
            defaultValue={rule?.suggested}
          />
        </Field>
        <Field label={it.cost}>
          <input
            name="cost"
            inputMode="decimal"
            defaultValue={rule?.cost ?? ""}
          />
        </Field>
      </div>
      <div className="form-grid">
        <Field label={it.requiredPart}>
          <SearchableCombobox
            value={requiredProductId}
            onChange={setRequiredProductId}
            groups={[
              {
                options: [
                  { value: "", label: it.noRequiredPart },
                  ...repairProducts.map((product) => ({
                    value: product.id,
                    label: product.name,
                    secondary: `${it.inventory.currentStock}: ${product.stockQuantity}`,
                  })),
                ],
              },
            ]}
            placeholder={it.noRequiredPart}
            ariaLabel={it.requiredPart}
            searchPlaceholder={it.search}
            emptyText={it.noMatches}
          />
        </Field>
        {requiredProductId && (
          <Field label={it.orderProducts.quantity}>
            <input
              name="requiredQuantity"
              type="number"
              min="1"
              max="999"
              defaultValue={rule?.requiredQuantity ?? 1}
            />
          </Field>
        )}
      </div>
      <Field label={it.notes}>
        <input name="notes" defaultValue={rule?.notes} maxLength={2000} />
      </Field>
    </ActionForm>
  );
}

export function CustomerForm({
  customer,
  onSuccess,
}: {
  onSuccess?: () => void;
  customer?: {
    id: string;
    name: string;
    phone: string;
    phones: { phone: string }[];
  };
}) {
  const it = useMessages();
  const router = useRouter();
  const [phones, setPhones] = useState(
    customer?.phones.map((p) => p.phone).filter((p) => p !== customer.phone) ??
      [],
  );
  return (
    <ActionForm
      submit={it.save}
      onSuccess={onSuccess}
      action={async (data) => {
        const result = await customerAction(customer?.id ?? null, {
          name: str(data, "name"),
          phone: str(data, "phone"),
          additionalPhones: phones,
        });
        if (result.ok && !customer && !onSuccess)
          router.push("/customers/" + result.id);
        return result;
      }}
    >
      <Field label={it.name}>
        <input
          name="name"
          defaultValue={customer?.name}
          required
          maxLength={120}
        />
      </Field>
      <Field label={it.phone}>
        <input
          name="phone"
          defaultValue={customer?.phone}
          required
          maxLength={30}
        />
      </Field>
      {phones.map((phone, index) => (
        <div className="phone-row" key={index}>
          <Field label={it.phone + " " + (index + 2)}>
            <input
              value={phone}
              required
              maxLength={30}
              onChange={(e) =>
                setPhones(
                  phones.map((p, i) => (i === index ? e.target.value : p)),
                )
              }
            />
          </Field>
          <RecordIcon
            kind="delete"
            label={it.remove + " " + it.phone + " " + (index + 2)}
            onClick={() => setPhones(phones.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={phones.length >= 2}
        onClick={() => setPhones([...phones, ""])}
      >
        {it.addPhone}
      </Button>
    </ActionForm>
  );
}
export function DeleteRecord({
  id,
  kind,
}: {
  id: string;
  kind: "customer" | "device";
}) {
  const it = useMessages();
  const router = useRouter();
  return (
    <ActionForm
      submit={kind === "customer" ? it.deleteCustomer : it.deleteDevice}
      action={async () => {
        if (!window.confirm(it.deleteConfirm)) return { ok: false, error: "" };
        const result = await (kind === "customer"
          ? deleteCustomerAction(id)
          : deleteDeviceAction(id));
        if (result.ok && kind === "customer") router.push("/customers");
        return result;
      }}
    >
      <></>
    </ActionForm>
  );
}
export function DeviceForm({
  device,
  onSuccess,
}: {
  onSuccess?: () => void;
  device: {
    id: string;
    category: string;
    brand: string;
    model: string;
    imei: string | null;
  };
}) {
  const it = useMessages();
  const { locale } = useLanguage();
  const [category, setCategory] = useState<Category>(
    device.category as Category,
  );
  const [brand, setBrand] = useState(device.brand);
  const [model, setModel] = useState(device.model);
  return (
    <ActionForm
      submit={it.save}
      onSuccess={onSuccess}
      action={(data) =>
        deviceAction(device.id, { ...Object.fromEntries(data), brand, model })
      }
    >
      <Field label={it.deviceType}>
        <SimpleSelect
          name="category"
          value={category}
          onChange={(value) => {
            setCategory(value as Category);
            setBrand("");
            setModel("");
          }}
          placeholder={it.selectOption}
          ariaLabel={it.deviceType}
          options={Object.entries(categories).map(([key, names]) => ({
            value: key,
            label: names[locale === "zh" ? 1 : 0],
          }))}
        />
      </Field>
      <EditableSelect
        label={it.brand}
        createLabel={it.customBrand}
        value={brand}
        onChange={setBrand}
        options={brands[category] ?? []}
        normalize={normalizeBrand}
        required
      />
      <EditableSelect
        label={it.model}
        createLabel={it.customModel}
        value={model}
        onChange={setModel}
        options={models[category]?.[brand] ?? []}
        normalize={normalizeModel}
        required
      />
      <Field label={it.imei}>
        <input name="imei" defaultValue={device.imei ?? ""} maxLength={30} />
      </Field>
    </ActionForm>
  );
}
export function PriceList({
  rules,
  repairProducts,
}: {
  rules: RuleView[];
  repairProducts: { id: string; name: string; stockQuantity: number }[];
}) {
  const it = useMessages();
  const { locale } = useLanguage();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [batchMode, setBatchMode] = useState(false);
  const [creating, setCreating] = useState<Partial<RuleView> | null>(null);
  const [editing, setEditing] = useState<RuleView | null>(null);
  const [saved, setSaved] = useState(false);
  const reveal = useRef("");
  const groups = groupPriceRules(rules, query);
  const visibleIds = groups.flatMap((b) =>
    b.categories.flatMap((c) =>
      c.models.flatMap((m) => m.rules.map((r) => r.id)),
    ),
  );
  const selectedIds = selected.filter((id) => visibleIds.includes(id));
  useEffect(() => {
    if (!reveal.current) return;
    const target = document.getElementById(reveal.current);
    if (target) {
      target.scrollIntoView({ block: "nearest" });
      reveal.current = "";
    }
  }, [rules, creating]);
  function toggle(key: string) {
    setExpanded((current) =>
      current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key],
    );
  }
  const heading = (key: string, label: string, initial?: Partial<RuleView>) => (
    <div className="catalog-toolbar price-tree-heading">
      <button
        type="button"
        className="price-toggle"
        aria-expanded={Boolean(query.trim()) || expanded.includes(key)}
        aria-controls={"group-" + key}
        onClick={() => toggle(key)}
      >
        <span aria-hidden="true">
          {query.trim() || expanded.includes(key) ? "▾" : "▸"}
        </span>{" "}
        {label}
      </button>
      {initial && (
        <Button
          variant="ghost"
          className="price-add-project"
          onClick={() => {
            setSaved(false);
            setCreating(initial);
          }}
        >
          <Plus size={16} />
          {it.addProject}
        </Button>
      )}
    </div>
  );

  async function remove(ids: string[]) {
    if (!window.confirm(it.deleteConfirm)) return;
    setPending(true);
    setError("");
    try {
      const result = await deleteRulesAction(ids);
      if (!result.ok) setError(result.error);
      else {
        setSelected([]);
        router.refresh();
      }
    } catch {
      setError("Connessione non disponibile. Riprova.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">{it.workspace}</div>
          <h1>{it.nav.prices}</h1>
          <p>{it.priceDescription}</p>
        </div>
        <Button
          onClick={() => {
            setSaved(false);
            setCreating({});
          }}
        >
          <Plus size={18} />
          {it.newRule}
        </Button>
      </header>
      <div className="filters price-filters">
        <label className="grow">
          <span className="sr-only">{it.search}</span>
          <input
            type="search"
            placeholder={it.priceSearch}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected([]);
            }}
          />
        </label>
      </div>
      {creating && (
        <FormDialog title={it.newRule} onClose={() => setCreating(null)}>
          <RuleForm
            initial={creating}
            rules={rules}
            repairProducts={repairProducts}
            onSuccess={(device) => {
              setCreating(null);
              setSaved(true);
              setQuery("");
              setSelected([]);
              const paths = [
                pricePath(device.brand),
                pricePath(device.brand, device.category),
                pricePath(device.brand, device.category, device.model),
              ];
              setExpanded((current) => [...new Set([...current, ...paths])]);
              reveal.current = "group-" + paths[2];
            }}
          />
        </FormDialog>
      )}
      {editing && (
        <FormDialog title={it.editQuote} onClose={() => setEditing(null)}>
          <RuleForm
            rule={editing}
            rules={rules}
            repairProducts={repairProducts}
            onSuccess={() => {
              setEditing(null);
              setSaved(true);
              router.refresh();
            }}
          />
        </FormDialog>
      )}
      <Message success={saved} />
      <div className="catalog-toolbar price-batch-toolbar">
        <Button
          variant="outline"
          disabled={pending}
          aria-pressed={batchMode}
          onClick={() => {
            setBatchMode(!batchMode);
            setSelected([]);
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
                  visibleIds.length > 0 &&
                  selectedIds.length === visibleIds.length
                }
                onChange={(event) =>
                  setSelected(event.target.checked ? visibleIds : [])
                }
              />
              {it.selectAll}
            </label>
            <Button
              disabled={pending || !selectedIds.length}
              variant="outline"
              onClick={() => remove(selectedIds)}
            >
              <Trash2 size={18} aria-hidden="true" />
              {it.deleteSelected} ({selectedIds.length})
            </Button>
          </>
        )}
      </div>
      <Message error={error} />
      <div className="price-groups">
        {groups.length === 0 && <p className="empty">{it.noPriceResults}</p>}
        {groups.map((brand) => (
          <section className="price-group" key={brand.key}>
            {heading(brand.key, brand.brand || it.generic)}
            <div
              id={"group-" + brand.key}
              hidden={!query.trim() && !expanded.includes(brand.key)}
            >
              {brand.categories.map((category) => (
                <section className="price-tree-level" key={category.key}>
                  {heading(
                    category.key,
                    categories[category.category as Category]?.[
                      locale === "zh" ? 1 : 0
                    ] ?? category.category,
                  )}
                  <div
                    id={"group-" + category.key}
                    hidden={!query.trim() && !expanded.includes(category.key)}
                  >
                    {category.models.map((group) => (
                      <section className="price-tree-level" key={group.key}>
                        {heading(group.key, group.model || it.generic, {
                          brand: brand.brand,
                          category: category.category,
                          model: group.model,
                        })}
                        <div
                          id={"group-" + group.key}
                          hidden={
                            !query.trim() && !expanded.includes(group.key)
                          }
                        >
                          <div className="rule-list">
                            {group.rules.map((rule) => (
                              <article className="price-rule-row" key={rule.id}>
                                {batchMode && (
                                  <input
                                    type="checkbox"
                                    aria-label={
                                      it.selectOption +
                                      " " +
                                      rule.project +
                                      " " +
                                      rule.brand +
                                      " " +
                                      rule.model
                                    }
                                    checked={selected.includes(rule.id)}
                                    onChange={(event) =>
                                      setSelected(
                                        event.target.checked
                                          ? [...selected, rule.id]
                                          : selected.filter(
                                              (id) => id !== rule.id,
                                            ),
                                      )
                                    }
                                  />
                                )}
                                <InlineRuleField
                                  rule={rule}
                                  field="project"
                                  disabled={pending}
                                  onError={setError}
                                  onSaved={() => setSaved(true)}
                                />
                                <InlineRuleField
                                  rule={rule}
                                  field="suggested"
                                  disabled={pending}
                                  onError={setError}
                                  onSaved={() => setSaved(true)}
                                />
                                <span className="price-row-delete record-actions">
                                  <RecordIcon
                                    kind="edit"
                                    label={it.editQuote}
                                    disabled={pending}
                                    onClick={() => setEditing(rule)}
                                  />
                                  <RecordIcon
                                    kind="delete"
                                    label={it.deleteRule}
                                    disabled={pending}
                                    onClick={() => remove([rule.id])}
                                  />
                                </span>
                              </article>
                            ))}
                          </div>
                        </div>
                      </section>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

export function FormDialog({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const it = useMessages();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const busy = () =>
    Boolean(dialog.current?.querySelector('[aria-busy="true"]'));
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <dialog
      ref={dialog}
      className="form-dialog"
      data-prevent-card-autosave
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy()) onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <h2 id={titleId}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          type="button"
          className="dialog-close icon-button"
          aria-label={it.close}
          title={it.close}
          onClick={() => {
            if (!busy()) onClose();
          }}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <FormCloseContext.Provider value={onClose}>
        {children}
      </FormCloseContext.Provider>
    </dialog>,
    document.body,
  );
}
export function NewCustomerDialog() {
  const it = useMessages();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <div>
      <Button
        onClick={() => {
          setSaved(false);
          setOpen(true);
        }}
      >
        <Plus size={18} />
        {it.addCustomer}
      </Button>
      <Message success={saved} />
      {open && (
        <FormDialog title={it.addCustomer} onClose={() => setOpen(false)}>
          <CustomerForm
            onSuccess={() => {
              setOpen(false);
              setSaved(true);
            }}
          />
        </FormDialog>
      )}
    </div>
  );
}
