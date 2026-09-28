"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createOrderAction,
  customerAction,
  lookupCustomerAction,
} from "@/app/actions";
import {
  brands,
  categories,
  modelKey,
  models,
  normalizeBrand,
  normalizeModel,
  type Category,
} from "@/lib/catalog";
import {
  cents,
  creatablePaymentMethods,
  matchRule,
  money,
  romeDay,
  settlement,
} from "@/lib/domain";
import { uniqueOptions } from "@/lib/options";
import {
  DatePicker,
  SearchableCombobox,
  SimpleSelect,
} from "./business-select";
import {
  Field,
  FormDialog,
  ItemsEditor,
  quoteItemsValid,
  type CategoryView,
  type RuleView,
} from "./forms";
import { type FaultCatalogItem } from "./fault-catalog-manager";
import { FaultSelector } from "./fault-selector";
import { useLanguage, useMessages } from "./language";
import { Button } from "./ui/button";

type CustomerOption = {
  id: string;
  name: string;
  phone: string;
  phones: { phone: string }[];
};
type CustomerDetail = Awaited<
  ReturnType<typeof import("@/app/actions").lookupCustomerAction>
>;
type Item = {
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

function safeCents(value: string) {
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

function StepCard({
  number,
  title,
  state,
  summary,
  summaryError = false,
  selected,
  expanded,
  onToggle,
  children,
}: {
  number: string;
  title: string;
  state: "not-started" | "in-progress" | "completed";
  summary?: string;
  summaryError?: boolean;
  selected: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const it = useMessages();
  const label =
    state === "completed"
      ? it.stepComplete
      : state === "in-progress"
        ? it.stepCurrent
        : it.stepEmpty;
  return (
    <section
      className={`panel order-step-card is-${state} ${selected ? "is-selected" : ""}`}
    >
      <button
        type="button"
        className="order-step-heading"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="section-number">{number}</span>
        <span className="order-step-title">
          <strong>
            {title}{" "}
            {state === "completed" && <Check size={16} aria-hidden="true" />}
          </strong>
          {summary && (
            <small className={summaryError ? "is-error" : ""}>{summary}</small>
          )}
        </span>
        <span className="order-step-state">{label}</span>
        <ChevronDown className="order-step-chevron" size={17} />
      </button>
      <div
        className={`order-step-collapse ${expanded ? "is-expanded" : ""}`}
        aria-hidden={!expanded}
        inert={!expanded || undefined}
      >
        <div className="order-step-body">{children}</div>
      </div>
    </section>
  );
}

export function NewOrderWizard({
  rules,
  faultOptions,
  devices,
  customers,
  products,
  productCategories,
}: {
  rules: RuleView[];
  faultOptions: FaultCatalogItem[];
  devices: { category: string; brand: string; model: string }[];
  customers: CustomerOption[];
  products: {
    id: string;
    name: string;
    category: string;
    stock: number;
    reserved: number;
    available: number;
  }[];
  productCategories: CategoryView[];
}) {
  const it = useMessages();
  const { locale } = useLanguage();
  const router = useRouter();
  const [requestId] = useState(() => crypto.randomUUID());
  const [selectedStep, setSelectedStep] = useState<number | null>(0);
  const [expandedStep, setExpandedStep] = useState<number | null>(0);
  const [customerId, setCustomerId] = useState("");
  const [customer, setCustomer] = useState<CustomerDetail>(null);
  const [choosingCustomer, setChoosingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerPending, setNewCustomerPending] = useState(false);
  const newCustomerNameInput = useRef<HTMLInputElement>(null);
  const newCustomerPhoneInput = useRef<HTMLInputElement>(null);
  const newCustomerFocus = useRef<"name" | "phone">("phone");
  const [duplicateCustomer, setDuplicateCustomer] =
    useState<CustomerDetail>(null);
  const [deviceId, setDeviceId] = useState("");
  const [autoMatchedDevice, setAutoMatchedDevice] = useState(false);
  const [category, setCategory] = useState<Category>("PHONE");
  const [brand, setBrand] = useState("");
  const [series, setSeries] = useState("");
  const [model, setModel] = useState("");
  const [imei, setImei] = useState("");
  const [appearance, setAppearance] = useState("");
  const [accessories, setAccessories] = useState("");
  const [selectedFaults, setSelectedFaults] = useState<string[]>([]);
  const [customFaults, setCustomFaults] = useState<string[]>([]);
  const [faultNote, setFaultNote] = useState("");
  const [faults, setFaults] = useState(faultOptions);
  const [inspectionMode, setInspectionMode] = useState(false);
  const [inspectionFee, setInspectionFee] = useState("30");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<Item[]>([
    { project: "", final: "", adjustmentReason: "", discount: "0" },
  ]);
  const [orderDiscount, setOrderDiscount] = useState("0");
  const [includeVat, setIncludeVat] = useState(false);
  const [deposit, setDeposit] = useState("0");
  const [method, setMethod] =
    useState<(typeof creatablePaymentMethods)[number]>("CASH");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const completed = useRef([false, false, false]);

  const catalog = faults
    .filter((fault) => fault.category === category && !fault.hidden)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const knownDevices = devices.filter((device) => device.category === category);
  const brandOptions = uniqueOptions(
    [
      ...brands[category],
      ...knownDevices.map((device) => device.brand),
      ...rules
        .filter((rule) => rule.category === category)
        .map((rule) => rule.brand),
    ].filter(Boolean),
  );
  const modelOptions = uniqueOptions(
    [
      ...(models[category]?.[brand] ?? []),
      ...knownDevices
        .filter(
          (device) =>
            device.brand.toLocaleLowerCase("it") ===
            brand.toLocaleLowerCase("it"),
        )
        .map((device) => device.model),
      ...rules
        .filter(
          (rule) =>
            rule.category === category &&
            rule.brand.toLocaleLowerCase("it") ===
              brand.toLocaleLowerCase("it"),
        )
        .map((rule) => rule.model),
    ].filter(Boolean),
  );
  const validCustomer = !!customerId && !!customer;
  const validDevice = !!category && !!brand.trim() && !!model.trim();
  const validFault =
    inspectionMode || selectedFaults.length > 0 || customFaults.length > 0;
  const validStep2 = validDevice && validFault && !!dueDate;
  const validQuote = inspectionMode
    ? safeCents(inspectionFee) > 0
    : quoteItemsValid(items, rules, { category, brand, series, model });
  const hasCompleteQuoteItem = items.some(
    (item) =>
      item.project.trim() &&
      validAmount(item.final) &&
      (item.saveRule ||
        !!matchRule(rules, { category, brand, series, model }, item.project)),
  );
  const requiredComplete = [validCustomer, validStep2, validQuote].filter(
    Boolean,
  ).length;
  const ready = requiredComplete === 3;
  const quote = useMemo(
    () =>
      settlement(
        inspectionMode
          ? []
          : items.map((item) => ({
              final: item.final || "0",
              discount: item.discount || "0",
            })),
        {
          orderDiscount: orderDiscount || "0",
          includeVat,
          inspectionFee: inspectionMode ? inspectionFee || "0" : "0",
        },
      ),
    [includeVat, inspectionFee, inspectionMode, items, orderDiscount],
  );

  function toggleStep(index: number) {
    if (selectedStep === index && expandedStep === index) {
      setExpandedStep(null);
      setSelectedStep(null);
      return;
    }
    setSelectedStep(index);
    setExpandedStep(index);
  }
  function clearDevice() {
    setDeviceId("");
    setAutoMatchedDevice(false);
    setBrand("");
    setSeries("");
    setModel("");
    setImei("");
  }
  function clearCustomerSelection() {
    setCustomerId("");
    setCustomer(null);
    setCustomerQuery("");
    setChoosingCustomer(true);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setDuplicateCustomer(null);
    clearDevice();
    setSelectedStep(0);
    setExpandedStep(0);
  }
  function matchCustomerDevice(
    nextCategory: Category,
    nextBrand: string,
    nextModel: string,
  ) {
    if (deviceId && !autoMatchedDevice) return;
    const matches =
      customer?.devices.filter(
        (device) =>
          device.category === nextCategory &&
          normalizeBrand(device.brand).toLocaleLowerCase("it") ===
            normalizeBrand(nextBrand).toLocaleLowerCase("it") &&
          modelKey(device.model) === modelKey(nextModel),
      ) ?? [];
    if (matches.length !== 1) {
      setDeviceId("");
      setAutoMatchedDevice(false);
      return;
    }
    const [match] = matches;
    setDeviceId(match.id);
    setAutoMatchedDevice(true);
    setCategory(match.category as Category);
    setBrand(match.brand);
    setSeries(match.series);
    setModel(match.model);
    setImei(match.imei ?? "");
    setAppearance(match.appearance);
    setAccessories(match.accessories);
  }
  function leaveInspection() {
    if (inspectionMode) setInspectionMode(false);
  }
  async function selectCustomer(id: string) {
    const selected = customers.find((candidate) => candidate.id === id);
    if (!selected) {
      return clearCustomerSelection();
    }
    const detail = await lookupCustomerAction(selected.phone);
    if (!detail) return;
    setCustomerId(id);
    setCustomer(detail);
    setChoosingCustomer(false);
    setCustomerQuery("");
    clearDevice();
  }

  function openCustomerDialog(query: string) {
    const value = query.trim();
    const looksLikePhone = /^[+\d\s().-]{6,}$/.test(value);
    setCustomerQuery(value);
    setNewCustomerName(looksLikePhone ? "" : value);
    setNewCustomerPhone(looksLikePhone ? value : "");
    newCustomerFocus.current = looksLikePhone ? "name" : "phone";
    setDuplicateCustomer(null);
    setNewCustomer(true);
  }
  async function saveNewCustomer() {
    if (newCustomerPending) return;
    setNewCustomerPending(true);
    setError("");
    try {
      const existing = await lookupCustomerAction(newCustomerPhone);
      if (existing) {
        setDuplicateCustomer(existing);
        return;
      }
      const result = await customerAction(null, {
        name: newCustomerName,
        phone: newCustomerPhone,
        additionalPhones: [],
      });
      if (!result.ok) return setError(result.error);
      if (!result.id) return setError(it.connectionError);
      const created = await lookupCustomerAction(newCustomerPhone);
      if (!created) return setError(it.connectionError);
      setCustomerId(created.id);
      setCustomer(created);
      setChoosingCustomer(false);
      setCustomerQuery("");
      setNewCustomer(false);
      clearDevice();
      router.refresh();
    } finally {
      setNewCustomerPending(false);
    }
  }
  async function submit() {
    if (pending) return;
    setTouched(true);
    if (!ready || !customer) return;
    setPending(true);
    setError("");
    try {
      const result = await createOrderAction({
        requestId,
        customerName: customer.name,
        phone: customer.phone,
        additionalPhones: customer.phones
          .map((entry) => entry.phone)
          .filter((phone) => phone !== customer.phone),
        privacyConsent: false,
        deviceId,
        category,
        brand,
        series,
        model,
        imei,
        appearance,
        accessories,
        faults: [],
        standardFaultIds: inspectionMode ? [] : selectedFaults,
        customFaults: inspectionMode ? [] : customFaults,
        inspectionMode,
        fault: "",
        faultNote,
        notes: "",
        dueDate,
        items: inspectionMode ? [] : items,
        diagnosticFee: inspectionFee,
        orderDiscount,
        includeVat,
        deposit,
        method,
        paymentKind: "DEPOSIT",
      });
      if (!result.ok) return setError(result.error);
      router.push(`/orders/${result.id}`);
    } catch {
      setError(it.connectionError);
    } finally {
      setPending(false);
    }
  }

  const stepStates = [
    validCustomer ? "completed" : "in-progress",
    validStep2 ? "completed" : validCustomer ? "in-progress" : "not-started",
    validQuote ? "completed" : validStep2 ? "in-progress" : "not-started",
    safeCents(deposit) > 0 ? "completed" : "not-started",
  ] as const;
  useEffect(() => {
    if (!newCustomer) return;
    const frame = requestAnimationFrame(() => {
      const input =
        newCustomerFocus.current === "name"
          ? newCustomerNameInput.current
          : newCustomerPhoneInput.current;
      input?.focus();
      input?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [newCustomer]);
  useEffect(() => {
    const values = [validCustomer, validStep2, validQuote];
    const completedIndex = values.findIndex(
      (value, index) =>
        value && !completed.current[index] && selectedStep === index,
    );
    completed.current = values;
    if (completedIndex < 0 || completedIndex >= 2) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) {
      setSelectedStep(completedIndex + 1);
      setExpandedStep(completedIndex + 1);
      return;
    }
    const closeTimer = window.setTimeout(() => {
      setExpandedStep(null);
      setSelectedStep(null);
      window.setTimeout(() => {
        setSelectedStep(completedIndex + 1);
        setExpandedStep(completedIndex + 1);
      }, 70);
    }, 100);
    return () => {
      window.clearTimeout(closeTimer);
    };
  }, [selectedStep, validCustomer, validQuote, validStep2]);
  const faultSummary = inspectionMode
    ? it.inspectionPending
    : [
        ...selectedFaults
          .map((id) => catalog.find((fault) => fault.id === id)?.name)
          .filter(Boolean),
        ...customFaults,
      ].join(", ");
  const step2Missing = !brand.trim()
    ? it.selectBrandError
    : !model.trim()
      ? it.selectModelError
      : !validFault
        ? it.selectFaultError
        : !dueDate
          ? it.selectDueDateError
          : "";

  return (
    <>
      <div className="new-order-layout">
        <form
          className="order-form order-wizard"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <StepCard
            number="01"
            title={it.customerSection}
            state={stepStates[0]}
            selected={selectedStep === 0}
            expanded={expandedStep === 0}
            onToggle={() => toggleStep(0)}
            summary={
              customer?.name ??
              (expandedStep !== 0 ? it.selectCustomerError : undefined)
            }
            summaryError={!validCustomer && expandedStep !== 0}
          >
            {!customer || choosingCustomer ? (
              <Field label={`${it.searchCustomer} *`}>
                <SearchableCombobox
                  value={customerId || customerQuery}
                  onChange={(id) => void selectCustomer(id)}
                  onQueryChange={setCustomerQuery}
                  ariaLabel={it.searchCustomer}
                  placeholder={it.customerSearchPlaceholder}
                  searchPlaceholder={it.customerSearchPlaceholder}
                  emptyText={it.noCustomerMatches}
                  autoFocusQuery={choosingCustomer ? customer?.name : undefined}
                  customLabel={it.addCustomer}
                  onCustom={openCustomerDialog}
                  clearable
                  groups={[
                    {
                      options: customers.map((entry) => ({
                        value: entry.id,
                        label: entry.name,
                        secondary: entry.phone,
                        keywords: entry.phones
                          .map((phone) => phone.phone)
                          .join(" "),
                      })),
                    },
                  ]}
                />
              </Field>
            ) : (
              <div className="selected-customer-summary">
                <UserRound size={19} />
                <div>
                  <strong>{customer.name}</strong>
                  <small>{customer.phone}</small>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    clearCustomerSelection();
                  }}
                >
                  <X size={15} /> {it.reselect}
                </Button>
              </div>
            )}
            {touched && !validCustomer && (
              <p className="field-error">{it.selectCustomerError}</p>
            )}
          </StepCard>

          <StepCard
            number="02"
            title={it.deviceSection}
            state={stepStates[1]}
            selected={selectedStep === 1}
            expanded={expandedStep === 1}
            onToggle={() => toggleStep(1)}
            summary={
              expandedStep !== 1 && !validStep2
                ? step2Missing
                : validDevice
                  ? `${categories[category][locale === "zh" ? 1 : 0]} · ${brand} · ${model}${faultSummary ? ` · ${faultSummary}` : ""}`
                  : undefined
            }
            summaryError={expandedStep !== 1 && !validStep2}
          >
            {customer?.devices?.length ? (
              <Field label={it.chooseDevice}>
                <SimpleSelect
                  value={deviceId}
                  onChange={(id) => {
                    const device = customer.devices.find(
                      (entry) => entry.id === id,
                    );
                    setDeviceId(id);
                    setAutoMatchedDevice(false);
                    if (device) {
                      setCategory(device.category as Category);
                      setBrand(device.brand);
                      setSeries(device.series);
                      setModel(device.model);
                      setImei(device.imei ?? "");
                      setAppearance(device.appearance);
                      setAccessories(device.accessories);
                    } else clearDevice();
                  }}
                  ariaLabel={it.chooseDevice}
                  placeholder={it.newDevice}
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
            ) : null}
            <div className="form-grid three">
              <Field label={it.deviceType}>
                <SimpleSelect
                  value={category}
                  onChange={(value) => {
                    setCategory(value as Category);
                    clearDevice();
                    setSelectedFaults([]);
                  }}
                  disabled={!!deviceId && !autoMatchedDevice}
                  ariaLabel={it.deviceType}
                  placeholder={it.selectOption}
                  options={Object.entries(categories).map(
                    ([value, labels]) => ({
                      value,
                      label: labels[locale === "zh" ? 1 : 0],
                    }),
                  )}
                />
              </Field>
              <Field label={`${it.brand} *`}>
                <SearchableCombobox
                  value={brand}
                  onChange={(value) => {
                    const nextBrand = normalizeBrand(value);
                    setBrand(nextBrand);
                    setModel("");
                    setSeries("");
                    matchCustomerDevice(category, nextBrand, "");
                  }}
                  disabled={!!deviceId && !autoMatchedDevice}
                  ariaLabel={it.brand}
                  placeholder={it.manualEntry}
                  searchPlaceholder={it.search}
                  emptyText={it.noMatches}
                  customLabel={it.customBrand}
                  onCustom={(value) => {
                    const nextBrand = normalizeBrand(value);
                    setBrand(nextBrand);
                    setModel("");
                    setSeries("");
                    matchCustomerDevice(category, nextBrand, "");
                  }}
                  clearable
                  groups={[
                    {
                      options: brandOptions.map((value) => ({
                        value,
                        label: value,
                      })),
                    },
                  ]}
                />
              </Field>
              <Field label={`${it.model} *`}>
                <SearchableCombobox
                  value={model}
                  onChange={(value) => {
                    const nextModel = normalizeModel(value, modelOptions);
                    setModel(nextModel);
                    matchCustomerDevice(category, brand, nextModel);
                  }}
                  disabled={(!!deviceId && !autoMatchedDevice) || !brand}
                  ariaLabel={it.model}
                  placeholder={it.manualEntry}
                  searchPlaceholder={it.search}
                  emptyText={it.noMatches}
                  customLabel={it.customModel}
                  onCustom={(value) => {
                    const nextModel = normalizeModel(value, modelOptions);
                    setModel(nextModel);
                    matchCustomerDevice(category, brand, nextModel);
                  }}
                  onCommit={(value) => {
                    const nextModel = normalizeModel(value, modelOptions);
                    setModel(nextModel);
                    matchCustomerDevice(category, brand, nextModel);
                  }}
                  clearable
                  groups={[
                    {
                      options: modelOptions.map((value) => ({
                        value,
                        label: value,
                      })),
                    },
                  ]}
                />
              </Field>
            </div>
            {touched && !validDevice && (
              <p className="field-error">
                {!brand ? it.selectBrandError : it.selectModelError}
              </p>
            )}
            {!validDevice && (
              <p className="device-dependency-hint">{it.completeDeviceFirst}</p>
            )}
            {validDevice && (
              <div className="wizard-progressive-reveal">
                <div
                  className={`inspection-choice ${inspectionMode ? "is-active" : ""}`}
                >
                  <Search size={20} />
                  <div>
                    <strong>{it.inspectionPending}</strong>
                    <p>{it.inspectionHelp}</p>
                  </div>
                  <Button
                    type="button"
                    variant={inspectionMode ? "outline" : "default"}
                    disabled={!validDevice}
                    onClick={() => {
                      setInspectionMode((value) => !value);
                    }}
                  >
                    {inspectionMode ? it.inspectionActive : it.setInspection}
                  </Button>
                </div>
                <FaultSelector
                  category={category}
                  items={faults}
                  selected={selectedFaults}
                  disabled={!validDevice || inspectionMode}
                  onItemsChange={setFaults}
                  onChange={(ids) => {
                    setSelectedFaults(ids);
                    if (ids.length) leaveInspection();
                  }}
                />
              </div>
            )}
            {customFaults.map((description, index) => (
              <div className="custom-fault-row" key={`${description}-${index}`}>
                <span>{description}</span>
                <button
                  type="button"
                  aria-label={`${it.remove} ${description}`}
                  onClick={() =>
                    setCustomFaults((current) =>
                      current.filter((_, i) => i !== index),
                    )
                  }
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            {validDevice && validFault && !inspectionMode && (
              <div className="wizard-progressive-reveal">
                <Field label={it.faultNotes}>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={faultNote}
                    onChange={(event) => setFaultNote(event.target.value)}
                  />
                </Field>
              </div>
            )}
            {touched && !validFault && (
              <p className="field-error">{it.selectFaultError}</p>
            )}
            {validDevice && validFault && (
              <div className="wizard-progressive-reveal compact-date-field">
                <Field label={it.dueDate}>
                  <DatePicker
                    name="dueDate"
                    min={romeDay()}
                    value={dueDate}
                    disabled={!validDevice || !validFault}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </Field>
              </div>
            )}
          </StepCard>

          <StepCard
            number="03"
            title={it.quoteSection}
            state={stepStates[2]}
            selected={selectedStep === 2}
            expanded={expandedStep === 2}
            onToggle={() => toggleStep(2)}
            summary={
              validQuote
                ? `${inspectionMode ? it.inspectionFeeLabel : `${items.length} ${it.repairItems}`} · ${money(quote.due)}`
                : validStep2 && expandedStep !== 2
                  ? inspectionMode
                    ? it.inspectionFeeError
                    : it.repairItemError
                  : undefined
            }
            summaryError={expandedStep !== 2 && validStep2 && !validQuote}
          >
            {inspectionMode ? (
              <>
                <div className="inspection-banner">
                  <Search size={19} />
                  <div>
                    <strong>{it.inspectionModeTitle}</strong>
                    <p>{it.inspectionQuoteHelp}</p>
                  </div>
                </div>
                <Field label={`${it.diagnosticFee} *`}>
                  <input
                    inputMode="decimal"
                    value={inspectionFee}
                    onChange={(event) => setInspectionFee(event.target.value)}
                  />
                </Field>
              </>
            ) : (
              <ItemsEditor
                items={items}
                onChange={setItems}
                rules={rules}
                device={{ category, brand, series, model }}
                discounts
                products={products}
                productCategories={productCategories}
                progressive
              />
            )}
            {touched && !validQuote && (
              <p className="field-error">
                {inspectionMode ? it.inspectionFeeError : it.repairItemError}
              </p>
            )}
            {!inspectionMode && hasCompleteQuoteItem && (
              <div className="wizard-progressive-reveal">
                <Field label={it.orderDiscount}>
                  <input
                    inputMode="decimal"
                    value={orderDiscount}
                    onChange={(event) => setOrderDiscount(event.target.value)}
                  />
                </Field>
              </div>
            )}
            {(inspectionMode || hasCompleteQuoteItem) && (
              <div className="price-breakdown wizard-progressive-reveal">
                <h3>{it.priceDetails}</h3>
                {inspectionMode && (
                  <div>
                    <span>{it.inspectionFeeNet}</span>
                    <strong>{money(quote.inspectionTotal)}</strong>
                  </div>
                )}{" "}
                {!inspectionMode && (
                  <>
                    <div>
                      <span>{it.repairSubtotal}</span>
                      <strong>{money(quote.repairGross)}</strong>
                    </div>
                    <div>
                      <span>{it.discountTotal}</span>
                      <strong>{money(quote.discount)}</strong>
                    </div>
                    <div>
                      <span>{it.netTotal}</span>
                      <strong>{money(quote.net)}</strong>
                    </div>
                  </>
                )}
                <div>
                  <span>{it.vatAmount}</span>
                  <strong>{money(quote.vat)}</strong>
                </div>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={includeVat}
                    onChange={(event) => setIncludeVat(event.target.checked)}
                  />
                  {it.includeVat}
                </label>
                <div className="price-due">
                  <span>{it.total}</span>
                  <strong>{money(quote.due)}</strong>
                </div>
              </div>
            )}
          </StepCard>

          <StepCard
            number="04"
            title={it.paymentSection}
            state={stepStates[3]}
            selected={selectedStep === 3}
            expanded={expandedStep === 3}
            onToggle={() => toggleStep(3)}
            summary={
              safeCents(deposit) > 0 ? money(safeCents(deposit)) : undefined
            }
          >
            <div className="form-grid">
              <Field label={it.initialPayment}>
                <input
                  inputMode="decimal"
                  value={deposit}
                  onChange={(event) => setDeposit(event.target.value)}
                />
              </Field>
              <Field label={it.paymentMethod}>
                <SimpleSelect
                  value={method}
                  onChange={(value) => setMethod(value as typeof method)}
                  ariaLabel={it.paymentMethod}
                  placeholder={it.selectOption}
                  options={creatablePaymentMethods.map((value) => ({
                    value,
                    label: it.methods[value],
                  }))}
                />
              </Field>
            </div>
          </StepCard>
          {error && (
            <p className="message error" role="alert">
              {error}
            </p>
          )}
          <div className="sticky-order-actions">
            <div>
              {ready ? (
                <>
                  <strong>
                    <Check size={16} /> {it.requiredStepsComplete}
                  </strong>
                  <small>{it.canCreateOrder}</small>
                </>
              ) : (
                <>
                  <strong>
                    ○ {it.finishStep}:{" "}
                    {![validCustomer, validStep2, validQuote].find(Boolean)
                      ? it.customerSection
                      : !validStep2
                        ? it.deviceSection
                        : it.quoteSection}
                  </strong>
                </>
              )}
            </div>
            <span>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/orders")}
              >
                {it.cancel}
              </Button>
              <Button
                type="button"
                disabled={!ready || pending}
                onClick={() => void submit()}
              >
                {pending ? it.saving : it.create}
              </Button>
            </span>
          </div>
        </form>
        <aside className="order-progress panel">
          <h2>{it.formProgress}</h2>
          <strong>{requiredComplete}/3</strong>
          {[
            it.customerSection,
            it.deviceSection,
            it.quoteSection,
            it.paymentSection,
          ].map((label, index) => (
            <div
              key={label}
              className={stepStates[index] === "completed" ? "is-complete" : ""}
            >
              <span>
                {stepStates[index] === "completed" ? "✓" : "○"} {label}
              </span>
              <small>
                {stepStates[index] === "completed"
                  ? it.stepComplete
                  : stepStates[index] === "in-progress"
                    ? it.stepCurrent
                    : it.stepEmpty}
              </small>
            </div>
          ))}
          <footer>
            <strong>
              {ready ? <Check size={15} /> : "○"}{" "}
              {ready ? it.requiredStepsComplete : `${requiredComplete}/3`}
            </strong>
            <span>{ready ? it.canCreateOrder : it.completeRequiredSteps}</span>
          </footer>
        </aside>
      </div>
      {newCustomer && (
        <FormDialog
          title={it.addCustomer}
          onClose={() => setNewCustomer(false)}
        >
          <form
            className="dialog-form"
            data-form-dialog-body
            onSubmit={(event) => {
              event.preventDefault();
              void saveNewCustomer();
            }}
          >
            <Field label={`${it.name} *`}>
              <input
                ref={newCustomerNameInput}
                required
                maxLength={120}
                value={newCustomerName}
                onChange={(event) => setNewCustomerName(event.target.value)}
              />
            </Field>
            <Field label={`${it.phone} *`}>
              <input
                ref={newCustomerPhoneInput}
                required
                type="tel"
                maxLength={30}
                value={newCustomerPhone}
                onChange={(event) => {
                  setNewCustomerPhone(event.target.value);
                  setDuplicateCustomer(null);
                }}
              />
            </Field>
            {duplicateCustomer && (
              <div className="message warning duplicate-customer">
                <strong>{it.customerFound}</strong>
                <span>{duplicateCustomer.name}</span>
                <small>{duplicateCustomer.phone}</small>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCustomerId(duplicateCustomer.id);
                    setCustomer(duplicateCustomer);
                    setChoosingCustomer(false);
                    setCustomerQuery("");
                    setNewCustomer(false);
                  }}
                >
                  {it.useExistingCustomer}
                </Button>
              </div>
            )}
            {error && <p className="message error">{error}</p>}
            <div className="dialog-actions">
              <Button
                type="button"
                variant="outline"
                disabled={newCustomerPending}
                onClick={() => setNewCustomer(false)}
              >
                {it.cancel}
              </Button>
              <Button disabled={newCustomerPending}>
                {newCustomerPending ? it.saving : it.saveCustomer}
              </Button>
            </div>
          </form>
        </FormDialog>
      )}
    </>
  );
}
