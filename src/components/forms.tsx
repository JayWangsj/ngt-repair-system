"use client";
import {
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
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Check } from "lucide-react";
import { Button } from "./ui/button";
import { useMessages, useLanguage } from "./language";
import { translateError } from "@/lib/i18n";
import {
  categories,
  brands,
  models,
  faultPresets,
  type Category,
} from "@/lib/catalog";
import { settlement } from "@/lib/domain";
import {
  cents,
  decimal,
  matchRule,
  money,
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
} from "@/app/actions";

export type RuleView = {
  id: string;
  brand: string;
  series: string;
  model: string;
  project: string;
  suggested: string;
  cost?: string | null;
  minutes: number;
  notes: string;
  enabled: boolean;
};
type ItemView = {
  project: string;
  final: string;
  adjustmentReason: string;
  discount?: string;
  saveRule?: boolean;
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
  device: { brand: string; series: string; model: string };
  owner?: boolean;
}) {
  const it = useMessages();
  const deviceKey = [device.brand, device.series, device.model].join("|");
  const previousDevice = useRef(deviceKey);
  useEffect(() => {
    if (previousDevice.current === deviceKey) return;
    previousDevice.current = deviceKey;
    onChange(
      items.map((item) => ({
        ...item,
        final: matchRule(rules, device, item.project)?.rule.suggested ?? "",
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
      <datalist id="repair-projects">
        {[...new Set(rules.map((r) => r.project))].map((p) => (
          <option value={p} key={p} />
        ))}
      </datalist>
      {items.map((item, index) => {
        const match = matchRule(rules, device, item.project);
        return (
          <div className="quote-item" key={index}>
            <div className="form-grid">
              <Field label={`${it.project} ${index + 1}`}>
                <input
                  value={item.project}
                  list="repair-projects"
                  required
                  maxLength={120}
                  onChange={(e) => {
                    const project = e.target.value;
                    const found = matchRule(rules, device, project);
                    update(index, {
                      project,
                      final: found?.rule.suggested ?? item.final,
                      saveRule: false,
                    });
                  }}
                />
              </Field>
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
            {discounts && (
              <Field label={`${it.itemDiscount} ${index + 1}`}>
                <input
                  inputMode="decimal"
                  required
                  value={item.discount ?? "0"}
                  onChange={(e) => update(index, { discount: e.target.value })}
                />
              </Field>
            )}
            <div className="item-actions">
              {items.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                >
                  <Trash2 size={14} />
                  {it.remove}
                </Button>
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
  faultOptions: { category: string; name: string }[];
  devices: { category: string; brand: string; model: string }[];
  customers: { name: string; phone: string }[];
}) {
  const it = useMessages();
  const { locale } = useLanguage();
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [customer, setCustomer] =
    useState<Awaited<ReturnType<typeof lookupCustomerAction>>>(null);
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
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const found = await lookupCustomerAction(values.phone);
        if (active) {
          setCustomer(found);
          if (found) {
            setValue("customerName", found.name);
            setValue("privacyConsent", !!found.consentAt);
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
    ...new Set([...brands[category], ...knownDevices.map((d) => d.brand)]),
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
            r.brand.toLowerCase() === values.brand.toLowerCase() && r.model,
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
          <Field label={it.phone}>
            <input
              {...register("phone", {
                onChange: () => {
                  setCustomer(null);
                  setValue("customerName", "");
                  clearDevice();
                },
              })}
              list="customer-options"
              type="tel"
              required
              autoComplete="tel"
            />
            <datalist id="customer-options">
              {customers.map((c) => (
                <option key={c.phone} value={c.phone}>
                  {c.name}
                </option>
              ))}
            </datalist>
          </Field>
          <Field label={it.name}>
            <input {...register("customerName")} required maxLength={120} />
          </Field>
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
                setValue("category", (d?.category ?? "PHONE") as Category);
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
                onChange: () => {
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
          <Field label={it.brand}>
            <input
              {...register("brand", {
                onChange: () => {
                  setValue("model", "");
                  setValue("series", "");
                },
              })}
              list="brand-options"
              readOnly={!!values.deviceId}
              required
              maxLength={120}
            />
            <datalist id="brand-options">
              {brandOptions.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field label={it.model}>
            <input
              {...register("model")}
              list="model-options"
              readOnly={!!values.deviceId}
              required
              maxLength={120}
            />
            <datalist id="model-options">
              {modelOptions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
        </div>
        <fieldset className="fault-options">
          <legend>{it.fault}</legend>
          {faults.map((f) => (
            <label className="checkbox" key={f.name}>
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
        <details>
          <summary>{it.extraDetails}</summary>
          <div className="form-grid">
            <Field label={it.imei}>
              <input
                {...register("imei")}
                readOnly={!!values.deviceId}
                maxLength={30}
              />
            </Field>
            <Field label={it.series}>
              <input
                {...register("series")}
                readOnly={!!values.deviceId}
                maxLength={120}
              />
            </Field>
            <Field label={it.dueDate}>
              <input {...register("dueDate")} type="date" />
            </Field>
            <Field label={it.appearance}>
              <input {...register("appearance")} maxLength={2000} />
            </Field>
          </div>
          <Field label={it.notes}>
            <textarea {...register("notes")} maxLength={2000} />
          </Field>
          <label className="checkbox">
            <input type="checkbox" {...register("privacyConsent")} />
            {it.privacy}
          </label>
        </details>
      </Section>
      <Section number="03" title={it.quoteSection}>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={discountEnabled}
            onChange={(e) => {
              setDiscountEnabled(e.target.checked);
              if (!e.target.checked) {
                setValue("orderDiscount", "0");
                setValue(
                  "items",
                  values.items.map((i) => ({ ...i, discount: "0" })),
                );
              }
            }}
          />
          {it.discountEnabled}
        </label>
        <ItemsEditor
          items={values.items.map((i) => ({
            ...i,
            adjustmentReason: i.adjustmentReason ?? "",
          }))}
          onChange={(items) => setValue("items", items)}
          rules={rules}
          device={{
            brand: values.brand,
            series: values.series ?? "",
            model: values.model,
          }}
          discounts={discountEnabled}
        />
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
        <QuoteSummary
          items={values.items}
          orderDiscount={values.orderDiscount ?? "0"}
          includeVat={values.includeVat ?? false}
        />
        <label className="checkbox">
          <input type="checkbox" {...register("confirmed")} />
          {it.confirmed}
        </label>
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
            <Field label={it.kind}>
              <select {...register("paymentKind")}>
                <option value="DEPOSIT">{it.kinds.DEPOSIT}</option>
                <option value="BALANCE">{it.kinds.BALANCE}</option>
              </select>
            </Field>
            <Field label={it.paymentMethod}>
              <select {...register("method")}>
                {Object.entries(it.methods).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
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
    <form onSubmit={handle} className="action-form">
      {children}
      <Message error={error} success={success} />
      <Button disabled={pending}>{pending ? it.saving : submit}</Button>
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
          kind: str(data, "kind"),
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
            {Object.entries(it.methods).map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={it.kind}>
        <select name="kind" defaultValue="BALANCE">
          {Object.entries(it.kinds)
            .filter(([v]) => v !== "DEPOSIT")
            .map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
        </select>
      </Field>
    </ActionForm>
  );
}
export function StatusForm({
  id,
  status,
  remaining,
}: {
  id: string;
  status: OrderStatus;
  remaining: number;
  owner?: boolean;
}) {
  const it = useMessages();
  const choices = transitions[status];
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
            <input name="pickedUpBy" required maxLength={120} />
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
    appearance: string;
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
      <div className="form-grid">
        <Field label={it.appearance}>
          <input
            name="appearance"
            defaultValue={values.appearance}
            maxLength={2000}
          />
        </Field>
        <input type="hidden" name="accessories" value={values.accessories} />
      </div>
      <Field label={it.dueDate}>
        <input type="date" name="dueDate" defaultValue={values.dueDate ?? ""} />
      </Field>
      <Field label={it.notes}>
        <textarea name="notes" defaultValue={values.notes} maxLength={2000} />
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
  device: { brand: string; series: string; model: string };
  owner: boolean;
}) {
  const it = useMessages();
  const [items, setItems] = useState(initial);
  const [orderDiscount, setOrderDiscount] = useState(initialDiscount);
  const [includeVat, setIncludeVat] = useState(initialVat);
  const [discounts, setDiscounts] = useState(
    numeric(initialDiscount) > 0 ||
      initial.some((i) => numeric(i.discount ?? "0") > 0),
  );
  return (
    <ActionForm
      submit={it.save}
      action={() => quoteAction(id, { items, orderDiscount, includeVat })}
    >
      <p className="message warning">{it.quoteNotice}</p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={discounts}
          onChange={(e) => {
            setDiscounts(e.target.checked);
            if (!e.target.checked) {
              setOrderDiscount("0");
              setItems(items.map((i) => ({ ...i, discount: "0" })));
            }
          }}
        />
        {it.discountEnabled}
      </label>
      <ItemsEditor
        items={items}
        onChange={setItems}
        rules={rules}
        device={device}
        discounts={discounts}
      />
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
      <QuoteSummary
        items={items}
        orderDiscount={orderDiscount}
        includeVat={includeVat}
      />
    </ActionForm>
  );
}
export function RuleForm({ rule }: { rule?: RuleView }) {
  const it = useMessages();
  return (
    <ActionForm
      submit={it.save}
      action={(data) =>
        ruleAction(rule?.id ?? null, {
          ...Object.fromEntries(data),
          enabled: data.get("enabled") === "on",
        })
      }
    >
      <p className="help">{it.ruleHelp}</p>
      <div className="form-grid three">
        <Field label={it.brand}>
          <input name="brand" defaultValue={rule?.brand} maxLength={120} />
        </Field>
        <Field label={it.series}>
          <input name="series" defaultValue={rule?.series} maxLength={120} />
        </Field>
        <Field label={it.model}>
          <input name="model" defaultValue={rule?.model} maxLength={120} />
        </Field>
      </div>
      <Field label={it.project}>
        <input
          name="project"
          required
          defaultValue={rule?.project}
          maxLength={120}
        />
      </Field>
      <div className="form-grid three">
        <Field label={`${it.suggested} (€)`}>
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
        <Field label={it.minutes}>
          <input
            name="minutes"
            type="number"
            min="0"
            max="10000"
            required
            defaultValue={rule?.minutes ?? 60}
          />
        </Field>
      </div>
      <Field label={it.notes}>
        <input name="notes" defaultValue={rule?.notes} maxLength={2000} />
      </Field>
      <label className="checkbox">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={rule?.enabled ?? true}
        />
        {it.enabled}
      </label>
    </ActionForm>
  );
}
