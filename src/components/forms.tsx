"use client";
import {
  useContext,
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
import { Plus, Trash2, Check } from "lucide-react";
import { Button } from "./ui/button";
import { FormCloseContext } from "./ui/form-close-context";
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
            <select
              value={values.deviceId}
              onChange={(e) => {
                const d = customer.devices.find((d) => d.id === e.target.value);
                setValue("deviceId", e.target.value);
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
            >
              <option value="">{it.newDevice}</option>
              {customer.devices.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.brand} {d.model} {d.imei}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="form-grid three">
          <Field label={it.deviceType}>
            <select
              {...register("category", {
                onChange: (event) => {
                  setValue("category", event.target.value as Category);
                  clearDevice();
                  setValue("faults", []);
                  setLocalFaults([]);
                },
              })}
              disabled={!!values.deviceId}
            >
              {Object.entries(categories).map(([key, names]) => (
                <option key={key} value={key}>
                  {names[locale === "zh" ? 1 : 0]}
                </option>
              ))}
            </select>
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
              <select {...register("method")}>
                {creatablePaymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {it.methods[method]}
                  </option>
                ))}
              </select>
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
}: {
  action: (data: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submit: string;
  onSuccess?: () => void;
}) {
  const it = useMessages();
  const closeDialog = useContext(FormCloseContext);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setSuccess(false);
    try {
      const result = await action(new FormData(event.currentTarget));
      if (!result.ok) setError(result.error ?? "Errore");
      else {
        setSuccess(true);
        onSuccess?.();
        router.refresh();
      }
    } catch {
      setError("Connessione non disponibile. Riprova.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={handle} className="action-form" aria-busy={pending}>
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
          <Button disabled={pending}>{pending ? it.saving : submit}</Button>
        </div>
      ) : (
        <Button disabled={pending}>{pending ? it.saving : submit}</Button>
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
  return (
    <ActionForm
      submit={it.addPayment}
      onSuccess={() => setRequestId(crypto.randomUUID())}
      action={(data) =>
        paymentAction(id, {
          requestId,
          amount: str(data, "amount"),
          method: str(data, "method"),
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
          <select name="method">
            {creatablePaymentMethods.map((method) => (
              <option value={method} key={method}>
                {it.methods[method]}
              </option>
            ))}
          </select>
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
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value as OrderStatus)}
        >
          {choices.map((s) => (
            <option key={s} value={s}>
              {it.status[s]}
            </option>
          ))}
        </select>
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
      action={(data) => updateOrderAction(id, Object.fromEntries(data))}
    >
      <Field label={it.fault}>
        <textarea
          name="fault"
          required
          defaultValue={values.fault}
          maxLength={2000}
        />
      </Field>
      <input type="hidden" name="accessories" value={values.accessories} />
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
          months: months === "custom" ? str(data, "customMonths") : months,
          scope: str(data, "scope"),
          notes: str(data, "notes"),
        })
      }
    >
      <Field label={it.warranty.duration}>
        <select
          value={months}
          onChange={(event) => setMonths(event.target.value)}
        >
          <option value="0">{it.warranty.none}</option>
          <option value="1">{it.warranty.oneMonth}</option>
          <option value="3">{it.warranty.threeMonths}</option>
          <option value="6">{it.warranty.sixMonths}</option>
          <option value="12">{it.warranty.twelveMonths}</option>
          <option value="custom">{it.warranty.custom}</option>
        </select>
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

export function AfterSalesForm({ id }: { id: string }) {
  const it = useMessages();
  return (
    <ActionForm
      submit={it.afterSales.openRework}
      action={(data) => afterSalesAction(id, Object.fromEntries(data))}
    >
      <Field label={it.afterSales.reason}>
        <input name="reason" required maxLength={120} />
      </Field>
      <Field label={it.afterSales.notes}>
        <textarea name="notes" maxLength={2000} />
      </Field>
      <Field label={it.afterSales.fee}>
        <input name="fee" inputMode="decimal" defaultValue="0" required />
      </Field>
      <Field label={it.afterSales.dueDate}>
        <input type="date" name="dueDate" min={romeDay()} />
      </Field>
    </ActionForm>
  );
}

export function RefundForm({ id, received }: { id: string; received: number }) {
  const it = useMessages();
  const [requestId] = useState(() => crypto.randomUUID());
  return (
    <ActionForm
      submit={it.afterSales.confirmRefund}
      action={(data) =>
        refundAction(id, {
          requestId,
          method: str(data, "method"),
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
        <select name="method">
          {creatablePaymentMethods.map((method) => (
            <option value={method} key={method}>
              {it.methods[method]}
            </option>
          ))}
        </select>
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
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as Category);
              setBrand("");
              setModel("");
            }}
          >
            {Object.entries(categories).map(([key, names]) => (
              <option key={key} value={key}>
                {names[locale === "zh" ? 1 : 0]}
              </option>
            ))}
          </select>
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
          <select
            value={requiredProductId}
            onChange={(event) => setRequiredProductId(event.target.value)}
          >
            <option value="">{it.noRequiredPart}</option>
            {repairProducts.map((product) => (
              <option value={product.id} key={product.id}>
                {product.name} · {product.stockQuantity}
              </option>
            ))}
          </select>
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
        <select
          name="category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as Category);
            setBrand("");
            setModel("");
          }}
        >
          {Object.entries(categories).map(([key, names]) => (
            <option key={key} value={key}>
              {names[locale === "zh" ? 1 : 0]}
            </option>
          ))}
        </select>
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
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
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
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy()) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
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
