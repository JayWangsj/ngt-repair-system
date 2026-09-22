"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Check, MoreHorizontal } from "lucide-react";
import { CustomerForm, DeviceForm, FormDialog } from "./forms";
import { Button } from "./ui/button";
import { useLanguage, useMessages } from "./language";
import { deleteCustomerAction, deleteDeviceAction } from "@/app/actions";
import { translateError } from "@/lib/i18n";

type Customer = {
  id: string;
  name: string;
  phone: string;
  phones: { phone: string }[];
};
type Device = {
  id: string;
  category: string;
  brand: string;
  model: string;
  imei: string | null;
};
export function customerListUrl(query: string) {
  return query ? `/customers?q=${encodeURIComponent(query)}` : "/customers";
}

export function PhoneList({ customer }: { customer: Customer }) {
  const it = useMessages();
  const [copied, setCopied] = useState("");
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function copy(phone: string) {
    setFailed(false);
    setCopied("");
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(phone);
      timer.current = setTimeout(() => setCopied(""), 2000);
    } catch {
      setFailed(true);
    }
  }
  return (
    <div className="customer-phones">
      {[
        ...new Set([customer.phone, ...customer.phones.map((p) => p.phone)]),
      ].map((phone) => (
        <div className="customer-phone" key={phone}>
          <a href={`tel:${phone.replace(/[^+\d]/g, "")}`}>{phone}</a>
          <Button
            variant="ghost"
            aria-label={`${it.copyPhone} ${phone}`}
            onClick={() => copy(phone)}
          >
            {copied === phone ? <Check size={15} /> : <Copy size={15} />}
          </Button>
        </div>
      ))}
      <span className="sr-only" role="status">
        {copied ? it.copiedPhone : ""}
      </span>
      {failed && (
        <span role="alert" className="danger-text">
          {it.copyFailed}
        </span>
      )}
    </div>
  );
}

function RecordActions({
  customer,
  device,
  returnTo,
  primaryEdit = false,
}: {
  customer?: Customer;
  device?: Device;
  returnTo?: string;
  primaryEdit?: boolean;
}) {
  const it = useMessages();
  const { locale } = useLanguage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const title = device ? it.editDevice : it.editCustomer;
  const name = device ? `${device.brand} ${device.model}` : customer!.name;
  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  function edit() {
    setSaved(false);
    setError("");
    trigger.current?.focus();
    setOpen(false);
    setEditing(true);
  }
  async function remove() {
    setOpen(false);
    trigger.current?.focus();
    if (!window.confirm(it.deleteConfirm)) return;
    setPending(true);
    setError("");
    setSaved(false);
    try {
      const result = device
        ? await deleteDeviceAction(device.id)
        : await deleteCustomerAction(customer!.id);
      if (!result.ok) setError(result.error ?? "Errore");
      else {
        if (!device && returnTo) router.push(returnTo);
        router.refresh();
      }
    } catch {
      setError("Connessione non disponibile. Riprova.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="record-actions">
      {primaryEdit && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            setSaved(false);
            setEditing(true);
          }}
        >
          {title}
        </Button>
      )}
      <div
        className="record-more"
        ref={container}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            trigger.current?.focus();
          }
        }}
      >
        <Button
          variant="ghost"
          ref={trigger}
          disabled={pending}
          aria-label={`${it.moreActions} ${name}`}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          <MoreHorizontal size={18} />
        </Button>
        {open && (
          <div id={id} className="record-menu">
            {!primaryEdit && (
              <Button variant="ghost" onClick={edit}>
                {title}
              </Button>
            )}
            <Button variant="ghost" className="danger-text" onClick={remove}>
              {device ? it.deleteDevice : it.deleteCustomer}
            </Button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="message error">
          {translateError(error, locale)}
        </p>
      )}
      {saved && (
        <span role="status" className="record-saved">
          {it.saved}
        </span>
      )}
      {editing && (
        <FormDialog title={title} onClose={() => setEditing(false)}>
          {device ? (
            <DeviceForm
              device={device}
              onSuccess={() => {
                setEditing(false);
                setSaved(true);
              }}
            />
          ) : (
            <CustomerForm
              customer={customer}
              onSuccess={() => {
                setEditing(false);
                setSaved(true);
              }}
            />
          )}
        </FormDialog>
      )}
    </div>
  );
}

export function CustomerList({
  customers,
}: {
  customers: (Customer & { _count: { devices: number } })[];
}) {
  const it = useMessages();
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const normalized = query.trim().toLocaleLowerCase();
  const shown = customers.filter(
    (c) =>
      c.name.toLocaleLowerCase().includes(normalized) ||
      [c.phone, ...c.phones.map((p) => p.phone)].some((phone) =>
        phone.includes(normalized),
      ),
  );
  function search(value: string) {
    window.history.replaceState(null, "", customerListUrl(value));
  }
  return (
    <>
      <form
        className="filters customer-search"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="grow">
          <span className="sr-only">{it.search}</span>
          <input
            name="q"
            value={query}
            onChange={(event) => search(event.target.value)}
            placeholder={it.customerSearch}
          />
        </label>
        {query && (
          <Button type="button" variant="outline" onClick={() => search("")}>
            {it.clearSearch}
          </Button>
        )}
      </form>
      <p className="customer-result-count" role="status">
        {shown.length} {it.customerResults}
      </p>
      <section className="panel customer-table-panel">
        {shown.length ? (
          <table className="customer-table">
            <thead>
              <tr>
                <th>{it.customer}</th>
                <th>{it.phone}</th>
                <th>{it.devices}</th>
                <th>{it.actionsLabel}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((customer) => {
                const href = `/customers/${customer.id}${query ? `?q=${encodeURIComponent(query)}` : ""}`;
                return (
                  <tr key={customer.id}>
                    <td className="customer-name">
                      <Link className="order-link" href={href}>
                        {customer.name}
                      </Link>
                    </td>
                    <td className="customer-contact">
                      <PhoneList customer={customer} />
                    </td>
                    <td className="customer-device-count">
                      <span className="mobile-label">{it.devices}: </span>
                      {customer._count.devices}
                    </td>
                    <td className="customer-row-actions">
                      <Link className="button button-ghost" href={href}>
                        {it.viewDetails}
                      </Link>
                      <RecordActions customer={customer} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            <p>{query ? it.noCustomerMatches : it.noCustomers}</p>
            {query && (
              <Button variant="outline" onClick={() => search("")}>
                {it.clearSearch}
              </Button>
            )}
          </div>
        )}
      </section>
    </>
  );
}

export function CustomerSummary({
  customer,
  query,
  deleted,
}: {
  customer: Customer;
  query: string;
  deleted: boolean;
}) {
  return (
    <section className="panel padded customer-summary">
      <PhoneList customer={customer} />
      {!deleted && (
        <RecordActions
          customer={customer}
          returnTo={customerListUrl(query)}
          primaryEdit
        />
      )}
    </section>
  );
}
export function CustomerDevices({
  devices,
  readOnly,
}: {
  devices: Device[];
  readOnly: boolean;
}) {
  const it = useMessages();
  return (
    <section className="panel customer-device-list">
      {devices.length ? (
        devices.map((device) => (
          <article className="customer-device-row" key={device.id}>
            <div>
              <strong>
                {device.brand} {device.model}
              </strong>
              <small>
                {it.imei}: {device.imei || "—"}
              </small>
            </div>
            {!readOnly && <RecordActions device={device} primaryEdit />}
          </article>
        ))
      ) : (
        <p className="empty">{it.noDevices}</p>
      )}
    </section>
  );
}
