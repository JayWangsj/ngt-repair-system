"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createOrderAction,
  lookupCustomerAction,
  saveFaultAction,
} from "@/app/actions";
import {
  brands,
  categories,
  models,
  normalizeBrand,
  normalizeModel,
  type Category,
} from "@/lib/catalog";
import {
  cents,
  creatablePaymentMethods,
  money,
  romeDay,
  settlement,
} from "@/lib/domain";
import { uniqueOptions } from "@/lib/options";
import { SearchableCombobox, SimpleSelect } from "./business-select";
import {
  CustomerForm,
  Field,
  FormDialog,
  ItemsEditor,
  type RuleView,
} from "./forms";
import {
  FaultCatalogManager,
  findSimilarFault,
  type FaultCatalogItem,
} from "./fault-catalog-manager";
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
};

function safeCents(value: string) {
  try {
    return cents(value);
  } catch {
    return 0;
  }
}

function StepCard({
  number,
  title,
  state,
  summary,
  open,
  onToggle,
  children,
}: {
  number: string;
  title: string;
  state: "empty" | "current" | "complete";
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const it = useMessages();
  const label =
    state === "complete"
      ? it.stepComplete
      : state === "current"
        ? it.stepCurrent
        : it.stepEmpty;
  return (
    <section className={`panel order-step-card is-${state}`}>
      <button
        type="button"
        className="order-step-heading"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="section-number">{number}</span>
        <span className="order-step-title">
          <strong>
            {title}{" "}
            {state === "complete" && <Check size={16} aria-hidden="true" />}
          </strong>
          {summary && <small>{summary}</small>}
        </span>
        <span className="order-step-state">{label}</span>
        {open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
      </button>
      {open && <div className="order-step-body">{children}</div>}
    </section>
  );
}

export function NewOrderWizard({
  rules,
  faultOptions,
  devices,
  customers,
}: {
  rules: RuleView[];
  faultOptions: FaultCatalogItem[];
  devices: { category: string; brand: string; model: string }[];
  customers: CustomerOption[];
}) {
  const it = useMessages();
  const { locale } = useLanguage();
  const router = useRouter();
  const [requestId] = useState(() => crypto.randomUUID());
  const [openSteps, setOpenSteps] = useState([true, true, true, false]);
  const [customerId, setCustomerId] = useState("");
  const [customer, setCustomer] = useState<CustomerDetail>(null);
  const [newCustomer, setNewCustomer] = useState(false);
  const [deviceId, setDeviceId] = useState("");
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
  const [otherFaultOpen, setOtherFaultOpen] = useState(false);
  const [otherDescription, setOtherDescription] = useState("");
  const [saveCommon, setSaveCommon] = useState(false);
  const [commonName, setCommonName] = useState("");
  const [allowSimilar, setAllowSimilar] = useState(false);
  const [inspectionMode, setInspectionMode] = useState(false);
  const [inspectionFee, setInspectionFee] = useState("30");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<Item[]>([
    { project: "", final: "", adjustmentReason: "", discount: "0" },
  ]);
  const [orderDiscount, setOrderDiscount] = useState("0");
  const [includeVat, setIncludeVat] = useState(false);
  const [paymentNow, setPaymentNow] = useState(false);
  const [deposit, setDeposit] = useState("0");
  const [method, setMethod] =
    useState<(typeof creatablePaymentMethods)[number]>("CASH");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

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
  const validDevice = !!brand.trim() && !!model.trim();
  const validFault =
    inspectionMode || selectedFaults.length > 0 || customFaults.length > 0;
  const validStep2 = validDevice && validFault;
  const validQuote = inspectionMode
    ? safeCents(inspectionFee) > 0
    : items.length > 0 &&
      items.every((item) => item.project.trim() && safeCents(item.final) >= 0);
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
    setOpenSteps((current) =>
      current.map((value, i) => (i === index ? !value : value)),
    );
  }
  function clearDevice() {
    setDeviceId("");
    setBrand("");
    setSeries("");
    setModel("");
    setImei("");
  }
  function leaveInspection() {
    if (inspectionMode) setInspectionMode(false);
  }
  async function selectCustomer(id: string) {
    setCustomerId(id);
    const selected = customers.find((candidate) => candidate.id === id);
    if (!selected) {
      setCustomer(null);
      clearDevice();
      return;
    }
    const detail = await lookupCustomerAction(selected.phone);
    setCustomer(detail);
    clearDevice();
  }
  async function addOtherFault() {
    const description = otherDescription.trim();
    if (!description) return;
    if (saveCommon) {
      const name = commonName.trim();
      if (!name) return;
      const match = findSimilarFault(name, catalog);
      if (match?.kind === "exact") {
        setSelectedFaults((current) => [
          ...new Set([...current, match.item.id]),
        ]);
      } else {
        if (match?.kind === "similar" && !allowSimilar) return;
        const result = await saveFaultAction(null, {
          category,
          name,
          note: "",
          hidden: false,
        });
        if (!result.ok) return setError(result.error);
        router.refresh();
      }
    }
    setCustomFaults((current) => [...current, description]);
    leaveInspection();
    setOtherFaultOpen(false);
    setOtherDescription("");
    setCommonName("");
    setSaveCommon(false);
    setAllowSimilar(false);
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
        confirmed: false,
        confirmationNote: "",
        items: inspectionMode ? [] : items,
        diagnosticFee: inspectionFee,
        orderDiscount,
        includeVat,
        deposit: paymentNow ? deposit : "0",
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
    validCustomer ? "complete" : "current",
    validStep2 ? "complete" : validCustomer ? "current" : "empty",
    validQuote ? "complete" : validStep2 ? "current" : "empty",
    paymentNow && safeCents(deposit) > 0 ? "complete" : "empty",
  ] as const;
  const faultSummary = inspectionMode
    ? it.inspectionPending
    : [
        ...selectedFaults
          .map((id) => catalog.find((fault) => fault.id === id)?.name)
          .filter(Boolean),
        ...customFaults,
      ].join(", ");

  return (
    <>
      <Link
        href="/orders"
        className="button button-outline back-link new-order-back"
      >
        ← {it.backToOrders}
      </Link>
      <div className="new-order-layout">
        <form
          className="order-form order-wizard"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <StepCard
            number="01"
            title={it.customerSection}
            state={stepStates[0]}
            open={openSteps[0]}
            onToggle={() => toggleStep(0)}
            summary={customer?.name}
          >
            {!customer ? (
              <Field label={`${it.searchCustomer} *`}>
                <SearchableCombobox
                  value={customerId}
                  onChange={(id) => void selectCustomer(id)}
                  ariaLabel={it.searchCustomer}
                  placeholder={it.customerSearchPlaceholder}
                  searchPlaceholder={it.customerSearchPlaceholder}
                  emptyText={it.noCustomerMatches}
                  customLabel={it.addCustomer}
                  onCustom={() => setNewCustomer(true)}
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
                  <span>{it.existingCustomer}</span>
                  <small>{customer.phone}</small>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setCustomer(null);
                    setCustomerId("");
                    clearDevice();
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
            open={openSteps[1]}
            onToggle={() => toggleStep(1)}
            summary={
              validDevice
                ? `${categories[category][locale === "zh" ? 1 : 0]} · ${brand} · ${model}${faultSummary ? ` · ${faultSummary}` : ""}`
                : undefined
            }
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
                  disabled={!!deviceId}
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
                    setBrand(normalizeBrand(value));
                    setModel("");
                    setSeries("");
                  }}
                  disabled={!!deviceId}
                  ariaLabel={it.brand}
                  placeholder={it.manualEntry}
                  searchPlaceholder={it.search}
                  emptyText={it.noMatches}
                  customLabel={it.manualEntry}
                  onCustom={(value) => setBrand(normalizeBrand(value))}
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
                  onChange={(value) => setModel(normalizeModel(value))}
                  disabled={!!deviceId || !brand}
                  ariaLabel={it.model}
                  placeholder={it.manualEntry}
                  searchPlaceholder={it.search}
                  emptyText={it.noMatches}
                  customLabel={it.manualEntry}
                  onCustom={(value) => setModel(normalizeModel(value))}
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
            <div className="fault-options-heading">
              <strong>{it.reportedFaults}</strong>
              <FaultCatalogManager
                items={faults}
                initialCategory={category}
                onChanged={setFaults}
              />
            </div>
            <div className="fault-chip-grid">
              {catalog.map((fault) => {
                const checked = selectedFaults.includes(fault.id);
                return (
                  <label
                    className={`fault-choice ${checked ? "is-selected" : ""}`}
                    key={fault.id}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        setSelectedFaults((current) =>
                          event.target.checked
                            ? [...current, fault.id]
                            : current.filter((id) => id !== fault.id),
                        );
                        if (event.target.checked) leaveInspection();
                      }}
                    />
                    <span>
                      {checked && <Check size={14} />}
                      {fault.name}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="fault-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOtherFaultOpen(true)}
              >
                <span>+</span> {it.otherFault}
              </Button>
            </div>
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
            <Field label={it.faultNotes}>
              <textarea
                rows={3}
                maxLength={2000}
                value={faultNote}
                onChange={(event) => setFaultNote(event.target.value)}
              />
            </Field>
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
                onClick={() => {
                  if (inspectionMode) return;
                  if (
                    customFaults.length &&
                    !window.confirm(it.inspectionClearConfirm)
                  )
                    return;
                  setSelectedFaults([]);
                  setCustomFaults([]);
                  setInspectionMode(true);
                }}
              >
                {inspectionMode ? it.inspectionActive : it.setInspection}
              </Button>
            </div>
            {touched && !validFault && (
              <p className="field-error">{it.selectFaultError}</p>
            )}
            <Field label={it.dueDate}>
              <input
                name="dueDate"
                type="date"
                min={romeDay()}
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </Field>
          </StepCard>

          <StepCard
            number="03"
            title={it.quoteSection}
            state={stepStates[2]}
            open={openSteps[2]}
            onToggle={() => toggleStep(2)}
            summary={
              validQuote
                ? `${inspectionMode ? it.inspectionFeeLabel : `${items.length} ${it.repairItems}`} · ${money(quote.due)}`
                : undefined
            }
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
              />
            )}
            {touched && !validQuote && (
              <p className="field-error">
                {inspectionMode ? it.inspectionFeeError : it.repairItemError}
              </p>
            )}
            {!inspectionMode && (
              <Field label={it.orderDiscount}>
                <input
                  inputMode="decimal"
                  value={orderDiscount}
                  onChange={(event) => setOrderDiscount(event.target.value)}
                />
              </Field>
            )}
            <div className="price-breakdown">
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
          </StepCard>

          <StepCard
            number="04"
            title={it.paymentSection}
            state={stepStates[3]}
            open={openSteps[3]}
            onToggle={() => toggleStep(3)}
            summary={
              paymentNow && safeCents(deposit) > 0
                ? money(safeCents(deposit))
                : undefined
            }
          >
            <label className="checkbox">
              <input
                type="checkbox"
                checked={paymentNow}
                onChange={(event) => {
                  setPaymentNow(event.target.checked);
                  if (!event.target.checked) setDeposit("0");
                }}
              />
              {it.paymentNow}
            </label>
            {paymentNow && (
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
            )}
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
              <Button disabled={!ready || pending}>
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
              className={stepStates[index] === "complete" ? "is-complete" : ""}
            >
              <span>
                {stepStates[index] === "complete" ? "✓" : "○"} {label}
              </span>
              <small>
                {stepStates[index] === "complete"
                  ? it.stepComplete
                  : it.stepEmpty}
              </small>
            </div>
          ))}
          <footer>
            <strong>
              <Check size={15} /> {it.requiredStepsComplete}
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
          <CustomerForm
            onSuccess={() => {
              setNewCustomer(false);
              router.refresh();
            }}
          />
        </FormDialog>
      )}
      {otherFaultOpen && (
        <FormDialog
          title={it.otherFault}
          onClose={() => setOtherFaultOpen(false)}
        >
          <form
            className="dialog-form"
            data-form-dialog-body
            onSubmit={(event) => {
              event.preventDefault();
              void addOtherFault();
            }}
          >
            <Field label={`${it.faultDescription} *`}>
              <textarea
                required
                rows={4}
                maxLength={200}
                value={otherDescription}
                onChange={(event) => setOtherDescription(event.target.value)}
              />
            </Field>
            <p className="help">{it.faultDescriptionHelp}</p>
            <small className="character-count">
              {otherDescription.length}/200
            </small>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={saveCommon}
                onChange={(event) => setSaveCommon(event.target.checked)}
              />
              {it.saveAsCommonFault}
            </label>
            {saveCommon && (
              <>
                <Field label={`${it.commonFaultName} *`}>
                  <input
                    required
                    maxLength={120}
                    value={commonName}
                    onChange={(event) => {
                      setCommonName(event.target.value);
                      setAllowSimilar(false);
                    }}
                  />
                </Field>
                <p className="help">{it.commonFaultHelp}</p>
                {(() => {
                  const match = findSimilarFault(commonName, catalog);
                  if (!match) return null;
                  if (match.kind === "exact")
                    return (
                      <div className="message warning">
                        {it.faultAlreadyExists}
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setSelectedFaults((current) => [
                              ...new Set([...current, match.item.id]),
                            ]);
                            setSaveCommon(false);
                            setCommonName("");
                          }}
                        >
                          {it.useExistingFault}
                        </Button>
                      </div>
                    );
                  return (
                    <div className="message warning">
                      {it.similarFault}: {match.item.name}
                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setSelectedFaults((current) => [
                              ...new Set([...current, match.item.id]),
                            ]);
                            setSaveCommon(false);
                            setCommonName("");
                          }}
                        >
                          {it.useExistingFault}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setAllowSimilar(true)}
                        >
                          {it.continueAdding}
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
            <div className="dialog-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOtherFaultOpen(false)}
              >
                {it.cancel}
              </Button>
              <Button
                disabled={
                  !otherDescription.trim() ||
                  (saveCommon &&
                    (!commonName.trim() ||
                      (findSimilarFault(commonName, catalog)?.kind ===
                        "similar" &&
                        !allowSimilar)))
                }
              >
                {it.addFault}
              </Button>
            </div>
          </form>
        </FormDialog>
      )}
    </>
  );
}
