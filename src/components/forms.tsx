"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Check, Search } from "lucide-react";
import { Button } from "./ui/button";
import { it } from "@/messages/it";
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
  userAction,
  userEnabledAction,
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
  saveRule?: boolean;
};
const blankItem = (): ItemView => ({
  project: "",
  final: "",
  adjustmentReason: "",
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
  return error ? (
    <p className="message error" role="alert">
      {error}
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
  return (
    <label className={className}>
      <span>{label}</span>
      {children}
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
  owner,
}: {
  items: ItemView[];
  onChange: (items: ItemView[]) => void;
  rules: RuleView[];
  device: { brand: string; series: string; model: string };
  owner: boolean;
}) {
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
            {(!match ||
              numeric(item.final) !== cents(match.rule.suggested)) && (
              <Field label={`${it.reason} ${index + 1}`}>
                <input
                  value={item.adjustmentReason}
                  required
                  maxLength={2000}
                  onChange={(e) =>
                    update(index, { adjustmentReason: e.target.value })
                  }
                />
              </Field>
            )}
            <div className="item-actions">
              {!match && owner && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={!!item.saveRule}
                    onChange={(e) =>
                      update(index, { saveRule: e.target.checked })
                    }
                  />
                  {it.saveRule}
                </label>
              )}
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
        <span>{it.total}</span>
        <strong>
          {money(items.reduce((sum, item) => sum + numeric(item.final), 0))}
        </strong>
      </div>
    </div>
  );
}

export function NewOrderForm({
  rules,
  owner,
}: {
  rules: RuleView[];
  owner: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [customer, setCustomer] =
    useState<Awaited<ReturnType<typeof lookupCustomerAction>>>(null);
  const [searched, setSearched] = useState(false);
  const [lookupPending, setLookupPending] = useState(false);
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
        brand: "",
        series: "",
        model: "",
        imei: "",
        appearance: "",
        accessories: "",
        fault: "",
        notes: "",
        dueDate: "",
        confirmed: false,
        confirmationNote: "",
        items: [blankItem()],
        deposit: "0",
        method: "CASH",
      },
    },
  );
  const values = useWatch({ control }) as z.input<typeof orderInput>;
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
            <div className="input-action">
              <input
                aria-label={it.phone}
                {...register("phone", {
                  onChange: () => {
                    setCustomer(null);
                    setSearched(false);
                    setValue("deviceId", "");
                  },
                })}
                type="tel"
                autoComplete="tel"
                required
              />
              <Button
                type="button"
                variant="outline"
                disabled={lookupPending}
                onClick={async () => {
                  setLookupPending(true);
                  try {
                    const found = await lookupCustomerAction(values.phone);
                    setCustomer(found);
                    setSearched(true);
                    setValue("deviceId", "");
                    if (found) {
                      setValue("customerName", found.name);
                      setValue("privacyConsent", !!found.consentAt);
                    }
                  } finally {
                    setLookupPending(false);
                  }
                }}
              >
                <Search size={15} />
                {it.lookup}
              </Button>
            </div>
          </Field>
          <Field label={it.name}>
            <input {...register("customerName")} required maxLength={120} />
          </Field>
        </div>
        {searched && (
          <p className="quote-hint">
            {customer ? it.customerFound : it.customerNew}
          </p>
        )}
        <label className="checkbox">
          <input type="checkbox" {...register("privacyConsent")} />
          {it.privacy}
        </label>
        <p className="help">{it.privacyInfo}</p>
      </Section>
      <Section number="02" title={it.deviceSection}>
        {customer && customer.devices.length > 0 && (
          <Field label={it.chooseDevice}>
            <select
              value={values.deviceId}
              onChange={(e) => {
                setValue("deviceId", e.target.value);
                const d = customer.devices.find((d) => d.id === e.target.value);
                for (const key of [
                  "brand",
                  "series",
                  "model",
                  "imei",
                  "appearance",
                  "accessories",
                ] as const)
                  setValue(key, d?.[key] ?? "");
              }}
            >
              <option value="">{it.newDevice}</option>
              {customer.devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.brand} {d.model} {d.imei ? `· ${d.imei}` : ""}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="form-grid three">
          <Field label={it.brand}>
            <input
              {...register("brand")}
              readOnly={!!values.deviceId}
              required
              maxLength={120}
            />
          </Field>
          <Field label={it.series}>
            <input
              {...register("series")}
              readOnly={!!values.deviceId}
              maxLength={120}
            />
          </Field>
          <Field label={it.model}>
            <input
              {...register("model")}
              readOnly={!!values.deviceId}
              required
              maxLength={120}
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field label={it.imei}>
            <input
              {...register("imei")}
              readOnly={!!values.deviceId}
              maxLength={30}
            />
          </Field>
          <Field label={it.dueDate}>
            <input {...register("dueDate")} type="date" />
          </Field>
        </div>
        <Field label={it.fault}>
          <textarea {...register("fault")} required maxLength={2000} rows={3} />
        </Field>
        <div className="form-grid">
          <Field label={it.appearance}>
            <input {...register("appearance")} maxLength={2000} />
          </Field>
          <Field label={it.accessories}>
            <input {...register("accessories")} maxLength={2000} />
          </Field>
        </div>
      </Section>
      <Section number="03" title={it.quoteSection}>
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
          owner={owner}
        />
      </Section>
      <Section number="04" title={it.paymentSection}>
        <div className="form-grid">
          <Field label={it.deposit}>
            <input {...register("deposit")} inputMode="decimal" required />
          </Field>
          <Field label={it.paymentMethod}>
            <select {...register("method")}>
              {Object.entries(it.methods).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="checkbox">
          <input type="checkbox" {...register("confirmed")} />
          {it.confirmed}
        </label>
        {values.confirmed && (
          <Field label={it.confirmationNote}>
            <input
              {...register("confirmationNote")}
              placeholder="In negozio / per telefono"
              maxLength={2000}
            />
          </Field>
        )}
        <Field label={it.notes}>
          <textarea {...register("notes")} rows={3} maxLength={2000} />
        </Field>
      </Section>
      {Object.keys(errors).length > 0 && (
        <p className="message error" role="alert">
          Controlla i campi: {Object.keys(errors).join(", ")}
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
          {Object.entries(it.kinds).map(([v, l]) => (
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
  owner,
}: {
  id: string;
  status: OrderStatus;
  remaining: number;
  owner: boolean;
}) {
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
              {owner && (
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
        <Field label={it.accessories}>
          <input
            name="accessories"
            defaultValue={values.accessories}
            maxLength={2000}
          />
        </Field>
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
  rules,
  device,
  owner,
}: {
  id: string;
  initial: ItemView[];
  rules: RuleView[];
  device: { brand: string; series: string; model: string };
  owner: boolean;
}) {
  const [items, setItems] = useState(initial);
  return (
    <ActionForm submit={it.save} action={() => quoteAction(id, items)}>
      <p className="message warning">{it.quoteNotice}</p>
      <ItemsEditor
        items={items}
        onChange={setItems}
        rules={rules}
        device={device}
        owner={owner}
      />
    </ActionForm>
  );
}
export function RuleForm({ rule }: { rule?: RuleView }) {
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
export function UserForm() {
  return (
    <ActionForm
      submit={it.newUser}
      action={(data) => userAction(Object.fromEntries(data))}
    >
      <div className="form-grid">
        <Field label={it.name}>
          <input name="name" required maxLength={120} />
        </Field>
        <Field label={it.email}>
          <input name="email" type="email" required />
        </Field>
        <Field label={it.password}>
          <input
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            placeholder={it.passwordHint}
          />
        </Field>
        <Field label={it.role}>
          <select name="role">
            <option value="STAFF">{it.staff}</option>
            <option value="OWNER">{it.owner}</option>
          </select>
        </Field>
      </div>
    </ActionForm>
  );
}
export function UserToggle({ id, enabled }: { id: string; enabled: boolean }) {
  return (
    <ActionForm
      submit={enabled ? it.disable : it.enable}
      action={() => userEnabledAction(id, !enabled)}
    >
      <input type="hidden" value={id} readOnly />
    </ActionForm>
  );
}
