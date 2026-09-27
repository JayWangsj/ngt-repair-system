"use client";
import {
  useContext,
  useCallback,
  useState,
  useEffect,
  useRef,
  useId,
  Children,
  isValidElement,
  cloneElement,
  type ReactElement,
  type FormEvent,
  type ReactNode,
} from "react";
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
  Wrench,
  Settings,
  X,
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
import { isDiagnosticFault, romeDay, settlement } from "@/lib/domain";
import {
  cents,
  decimal,
  matchRule,
  money,
  creatablePaymentMethods,
  transitions,
  type OrderStatus,
} from "@/lib/domain";
import { orderInput } from "@/lib/validation";
import {
  SearchableCombobox,
  SimpleSelect,
  type SelectGroup,
} from "./business-select";
import {
  createOrderAction,
  lookupCustomerAction,
  paymentAction,
  statusAction,
  confirmAction,
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
  refundAction,
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
type ItemView = {
  project: string;
  final: string;
  adjustmentReason: string;
  discount?: string;
  saveRule?: boolean;
  discountVisible?: boolean;
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
  discounts = false,
}: {
  discounts?: boolean;
  items: ItemView[];
  onChange: (items: ItemView[]) => void;
  rules: RuleView[];
  device: { category: string; brand: string; series: string; model: string };
  owner?: boolean;
}) {
  const it = useMessages();
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
    onChange(
      items.map((item) => ({
        ...item,
        project: "",
        final: "",
        discount: "0",
      })),
    );
  }, [deviceKey, device, items, rules, onChange]);
  const update = (index: number, patch: Partial<ItemView>) =>
    onChange(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  return (
    <div className="items-editor">
      {items.map((item, index) => {
        const match = matchRule(rules, device, item.project);
        return (
          <div className="quote-item" key={index}>
            <div className="form-grid">
              <EditableSelect
                label={`${it.project} ${index + 1}`}
                value={item.project}
                options={deviceProjects(rules, device)}
                required
                onChange={(project) => {
                  const found = matchRule(rules, device, project);
                  update(index, {
                    project,
                    final: found?.rule.suggested ?? "",
                    discount: "0",
                    saveRule: false,
                  });
                }}
              />
              <Field label={`${it.final} ${index + 1}`}>
                <input
                  inputMode="decimal"
                  required
                  value={item.final}
                  onChange={(e) => update(index, { final: e.target.value })}
                />
              </Field>
            </div>
            <p className="quote-hint">
              {match ? (
                <>
                  {it.suggested}:{" "}
                  <strong>{money(cents(match.rule.suggested))}</strong> ·{" "}
                  {it.levels[match.level as keyof typeof it.levels]}
                </>
              ) : (
                it.noMatch
              )}
            </p>
            {discounts &&
              (item.discountVisible || numeric(item.discount ?? "0") > 0) && (
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
              {items.length > 1 && (
                <RecordIcon
                  kind="delete"
                  label={it.remove + " " + it.project + " " + (index + 1)}
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                />
              )}
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...items, blankItem()])}
      >
        <Plus size={16} />
        {it.addItem}
      </Button>
      <div className="quote-total">
        <span>{it.originalTotal}</span>
        <strong>
          {money(items.reduce((sum, item) => sum + numeric(item.final), 0))}
        </strong>
      </div>
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
        confirmed: false,
        confirmationNote: "",
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
          <input {...register("dueDate")} type="date" min={romeDay()} />
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
}: {
  items: { final: string; discount?: string }[];
  orderDiscount: string;
  includeVat: boolean;
}) {
  const it = useMessages();
  let q;
  try {
    q = settlement(items, { orderDiscount, includeVat });
  } catch {
    return <p className="help">{it.validationError}</p>;
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
export function StatusForm({
  customerName,
  id,
  status,
  remaining,
  allowCompletion,
}: {
  id: string;
  customerName: string;
  status: OrderStatus;
  remaining: number;
  owner?: boolean;
  allowCompletion?: boolean;
}) {
  const it = useMessages();
  const choices = transitions[status].filter(
    (choice) => allowCompletion !== false || choice !== "COMPLETED",
  );
  const [selected, setSelected] = useState(choices[0] ?? "");
  if (!choices.length) return null;
  return (
    <ActionForm
      submit={selected === "COMPLETED" ? it.delivery : it.updateStatus}
      action={(data) =>
        statusAction(id, {
          status: selected,
          note: str(data, "note"),
          pickedUpBy: str(data, "pickedUpBy"),
          override: data.get("override") === "on",
        })
      }
    >
      <Field label={it.nextStatus}>
        <SimpleSelect
          value={selected}
          onChange={(value) => setSelected(value as OrderStatus)}
          placeholder={it.selectOption}
          ariaLabel={it.nextStatus}
          options={choices.map((status) => ({
            value: status,
            label: it.status[status],
          }))}
        />
      </Field>
      {selected === "COMPLETED" && (
        <>
          <Field label={it.pickedUpBy}>
            <input
              name="pickedUpBy"
              defaultValue={customerName}
              required
              maxLength={120}
            />
          </Field>
          {remaining > 0 && (
            <>
              <p className="message warning">
                {it.deliveryWarning} {money(remaining)}
              </p>
              {true && (
                <label className="checkbox">
                  <input name="override" type="checkbox" required />
                  {it.override}
                </label>
              )}
            </>
          )}
        </>
      )}
      <Field label={it.notes}>
        <input name="note" maxLength={2000} />
      </Field>
    </ActionForm>
  );
}
export function ConfirmForm({ id }: { id: string }) {
  const it = useMessages();
  return (
    <ActionForm
      submit={it.confirm}
      action={(data) => confirmAction(id, str(data, "note"))}
    >
      <Field label={it.confirmationNote}>
        <input name="note" required maxLength={2000} />
      </Field>
    </ActionForm>
  );
}
export function EditOrderForm({
  id,
  values,
}: {
  id: string;
  values: {
    fault: string;
    notes: string;
    accessories: string;
    dueDate: string | null;
  };
}) {
  const it = useMessages();
  return (
    <ActionForm
      submit={it.save}
      action={(data) =>
        updateOrderAction(id, {
          ...Object.fromEntries(data),
          accessories: values.accessories,
        })
      }
    >
      <Field label={it.fault}>
        <textarea
          name="fault"
          required
          defaultValue={values.fault}
          maxLength={2000}
        />
      </Field>
      <Field label={it.dueDate}>
        <input
          type="date"
          name="dueDate"
          min={romeDay()}
          defaultValue={values.dueDate ?? ""}
        />
      </Field>
      <Field label={it.notes}>
        <textarea name="notes" defaultValue={values.notes} maxLength={2000} />
      </Field>
    </ActionForm>
  );
}

export function WarrantyForm({
  id,
  values,
}: {
  id: string;
  values: { months: number; scope: string; notes: string };
}) {
  const it = useMessages();
  const presets = [0, 1, 3, 6, 12];
  const [months, setMonths] = useState(
    presets.includes(values.months) ? String(values.months) : "custom",
  );
  return (
    <ActionForm
      submit={it.save}
      action={(data) =>
        warrantyAction(id, {
          months:
            str(data, "months") === "custom"
              ? str(data, "customMonths")
              : str(data, "months"),
          scope: str(data, "scope"),
          notes: str(data, "notes"),
        })
      }
    >
      <Field label={it.warranty.duration}>
        <SimpleSelect
          name="months"
          value={months}
          onChange={setMonths}
          placeholder={it.selectOption}
          ariaLabel={it.warranty.duration}
          options={[
            { value: "0", label: it.warranty.none },
            { value: "1", label: it.warranty.oneMonth },
            { value: "3", label: it.warranty.threeMonths },
            { value: "6", label: it.warranty.sixMonths },
            { value: "12", label: it.warranty.twelveMonths },
            { value: "custom", label: it.warranty.custom },
          ]}
        />
      </Field>
      {months === "custom" && (
        <Field label={it.warranty.customMonths}>
          <input
            name="customMonths"
            type="number"
            min="1"
            max="120"
            defaultValue={values.months || 1}
            required
          />
        </Field>
      )}
      <Field label={it.warranty.scope}>
        <textarea name="scope" defaultValue={values.scope} maxLength={2000} />
      </Field>
      <Field label={it.warranty.notes}>
        <textarea name="notes" defaultValue={values.notes} maxLength={2000} />
      </Field>
    </ActionForm>
  );
}

export type AfterSalesProject = {
  value: string;
  id: string;
  name: string;
  source: "original" | "catalog" | "custom";
  price: string;
  description?: string;
};
export type AfterSalesWarranty = {
  start: string;
  end: string;
  progress: number;
  remainingPercent: number;
  remainingDays: number;
  state: "ACTIVE" | "EXPIRING" | "EXPIRED";
} | null;

function WarrantyProgressPanel({ warranty }: { warranty: AfterSalesWarranty }) {
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
          <strong>{it.afterSales.noWarranty}</strong>
          <p>{it.afterSales.noWarrantyHint}</p>
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
        <strong>{title}</strong>
        <p>
          {it.afterSales.warrantyUntil} {warranty.end.replaceAll("-", "/")}
          {warranty.state !== "EXPIRED" &&
            ` · ${it.afterSales.remainingDays.replace("{count}", String(warranty.remainingDays))}`}
        </p>
        <div className="warranty-progress-labels">
          <span>
            {progress}% {it.afterSales.used}
          </span>
          <span>
            {100 - progress}% {it.afterSales.remaining}
          </span>
        </div>
        <div className="warranty-progress-track" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="warranty-progress-dates">
          <span>{warranty.start.replaceAll("-", "/")}</span>
          <span>{warranty.end.replaceAll("-", "/")}</span>
        </div>
      </div>
    </section>
  );
}

export function AfterSalesForm({
  id,
  warranty,
  originalProjects,
  catalogProjects,
  onSuccess,
}: {
  id: string;
  warranty: AfterSalesWarranty;
  originalProjects: AfterSalesProject[];
  catalogProjects: AfterSalesProject[];
  onSuccess?: () => void;
}) {
  const it = useMessages();
  const [selected, setSelected] = useState(
    originalProjects.length === 1 ? originalProjects[0].value : "",
  );
  const [customName, setCustomName] = useState("");
  const [custom, setCustom] = useState(false);
  const initialProject =
    originalProjects.length === 1 ? originalProjects[0] : null;
  const [treatment, setTreatment] = useState<"WARRANTY" | "PAID">(
    warranty && warranty.state !== "EXPIRED" && initialProject
      ? "WARRANTY"
      : "PAID",
  );
  const [fee, setFee] = useState("0");
  const [notes, setNotes] = useState("");
  const treatmentChanged = useRef(false);
  const customProject: AfterSalesProject | null = custom
    ? {
        value: "custom",
        id: "",
        name: customName || it.afterSales.customProject,
        source: "custom",
        price: "",
      }
    : null;
  const projects = [
    ...originalProjects,
    ...catalogProjects,
    ...(customProject ? [customProject] : []),
  ];
  const project = projects.find((item) => item.value === selected) ?? null;
  const recommend = (next: AfterSalesProject | null) =>
    warranty && warranty.state !== "EXPIRED" && next?.source === "original"
      ? "WARRANTY"
      : "PAID";
  const groups: SelectGroup[] = [
    {
      label: it.afterSales.originalProjects,
      options: originalProjects.map((item) => ({
        value: item.value,
        label: item.name,
        secondary: it.afterSales.originalProject,
        trailing: item.price,
        icon: <Wrench size={15} aria-hidden="true" />,
        keywords: item.description,
      })),
    },
    {
      label: it.afterSales.otherProjects,
      options: catalogProjects.map((item) => ({
        value: item.value,
        label: item.name,
        secondary: item.description || it.afterSales.catalogProject,
        trailing: item.price,
        icon: <Settings size={15} aria-hidden="true" />,
        keywords: item.description,
      })),
    },
    ...(customProject
      ? [
          {
            label: it.afterSales.customProject,
            options: [
              {
                value: customProject.value,
                label: customProject.name,
                secondary: it.afterSales.customProject,
              },
            ],
          },
        ]
      : []),
  ];
  function select(value: string) {
    setSelected(value);
    const next = projects.find((item) => item.value === value) ?? null;
    if (!treatmentChanged.current) {
      const recommended = recommend(next);
      setTreatment(recommended);
      if (recommended === "WARRANTY") setFee("0");
    }
  }
  return (
    <ActionForm
      submit={it.afterSales.openRework}
      onSuccess={onSuccess}
      disabled={!project || (project.source === "custom" && !customName.trim())}
      action={(data) =>
        afterSalesAction(id, {
          reason: project?.name ?? "",
          projectId: project?.id ?? "",
          projectSource: project?.source ?? "custom",
          treatment,
          notes: str(data, "notes"),
          fee: treatment === "WARRANTY" ? "0" : fee,
          dueDate: str(data, "dueDate"),
        })
      }
    >
      <WarrantyProgressPanel warranty={warranty} />
      <Field label={`${it.afterSales.project} *`}>
        <SearchableCombobox
          value={selected}
          onChange={select}
          groups={groups}
          placeholder={it.afterSales.projectPlaceholder}
          ariaLabel={it.afterSales.project}
          searchPlaceholder={it.afterSales.projectSearch}
          emptyText={it.afterSales.noProjectMatches}
          customLabel={
            customName
              ? it.afterSales.customProject
              : it.afterSales.addCustomProject
          }
          onCustom={(query) => {
            setCustom(true);
            setCustomName(query);
            setSelected("custom");
            if (!treatmentChanged.current) setTreatment("PAID");
          }}
        />
      </Field>
      {custom && (
        <Field label={`${it.afterSales.projectName} *`}>
          <input
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            maxLength={120}
            required
            autoFocus
          />
        </Field>
      )}
      {project &&
        project.source !== "original" &&
        warranty &&
        warranty.state !== "EXPIRED" && (
          <p className="after-sales-hint">{it.afterSales.nonOriginalHint}</p>
        )}
      <fieldset className="after-sales-treatment">
        <legend>{it.afterSales.treatment}</legend>
        {(["WARRANTY", "PAID"] as const).map((choice) => (
          <label
            className={`after-sales-radio ${treatment === choice ? "is-selected" : ""}`}
            key={choice}
          >
            <input
              type="radio"
              name="treatment"
              value={choice}
              checked={treatment === choice}
              onChange={() => {
                treatmentChanged.current = true;
                setTreatment(choice);
                if (choice === "WARRANTY") setFee("0");
              }}
            />
            <span>
              <strong>
                {choice === "WARRANTY"
                  ? it.afterSales.warrantyTreatment
                  : it.afterSales.paidTreatment}
              </strong>
              <small>
                {choice === "WARRANTY"
                  ? it.afterSales.warrantyTreatmentHint
                  : it.afterSales.paidTreatmentHint}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
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
        <Field label={it.afterSales.fee}>
          <input
            name="fee"
            inputMode="decimal"
            value={fee}
            min="0"
            readOnly={treatment === "WARRANTY"}
            onChange={(event) => setFee(event.target.value)}
            required
          />
        </Field>
        <Field label={it.afterSales.dueDate}>
          <input type="date" name="dueDate" min={romeDay()} />
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
  rules,
  device,
}: {
  id: string;
  initial: ItemView[];
  initialDiscount?: string;
  initialVat?: boolean;
  rules: RuleView[];
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
        value={brand}
        onChange={setBrand}
        options={brands[category] ?? []}
        normalize={normalizeBrand}
        required
      />
      <EditableSelect
        label={it.model}
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
  return (
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
    </dialog>
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
