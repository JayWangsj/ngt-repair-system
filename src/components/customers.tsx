"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { CustomerForm, DeviceForm, FormDialog } from "./forms";
import { RecordIcon } from "./ui/record-icon";
import { Button } from "./ui/button";
import { BatchControls } from "./ui/batch-controls";
import { useLanguage, useMessages } from "./language";
import {
  deleteCustomerAction,
  deleteCustomersAction,
  deleteDeviceAction,
} from "@/app/actions";
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
  return (
    <div className="customer-phones">
      {[
        ...new Set([customer.phone, ...customer.phones.map((p) => p.phone)]),
      ].map((phone) => (
        <div className="customer-phone" key={phone}>
          <a href={`tel:${phone.replace(/[^+\d]/g, "")}`}>{phone}</a>
        </div>
      ))}
    </div>
  );
}

function RecordActions({
  customer,
  device,
  returnTo,
  closeOnDelete = false,
  disabled = false,
}: {
  customer?: Customer;
  device?: Device;
  returnTo?: string;
  closeOnDelete?: boolean;
  disabled?: boolean;
}) {
  const it = useMessages();
  const { locale } = useLanguage();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const title = device ? it.editDevice : it.editCustomer;
  async function remove() {
    if (
      !window.confirm(
        device
          ? it.deleteConfirm
          : it.customerDeleteConfirm.replace("{count}", "1"),
      )
    )
      return;
    setPending(true);
    setError("");
    setSaved(false);
    try {
      const result = device
        ? await deleteDeviceAction(device.id)
        : await deleteCustomerAction(customer!.id);
      if (!result.ok) setError(result.error ?? "Errore");
      else {
        if (!device && returnTo) {
          if (closeOnDelete) router.back();
          else router.push(returnTo);
        }
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
      <RecordIcon
        kind="edit"
        label={title}
        disabled={pending || disabled}
        onClick={() => {
          setSaved(false);
          setError("");
          setEditing(true);
        }}
      />
      <RecordIcon
        kind="delete"
        label={device ? it.deleteDevice : it.deleteCustomer}
        disabled={pending}
        onClick={remove}
      />
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
  const router = useRouter();
  const { locale } = useLanguage();
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [batchMode, setBatchMode] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("customer-list-position");
      if (!saved) return;
      sessionStorage.removeItem("customer-list-position");
      const position = JSON.parse(saved);
      if (position.query === query && Number.isFinite(position.y)) {
        const frame = requestAnimationFrame(() =>
          window.scrollTo(0, position.y),
        );
        return () => cancelAnimationFrame(frame);
      }
    } catch {
      /* Storage may be unavailable in private sessions. */
    }
  }, [query]);
  const normalized = query.trim().toLocaleLowerCase();
  const shown = customers.filter(
    (c) =>
      c.name.toLocaleLowerCase().includes(normalized) ||
      [c.phone, ...c.phones.map((p) => p.phone)].some((phone) =>
        phone.includes(normalized),
      ),
  );
  const selectedIds = selected.filter((id) => shown.some((c) => c.id === id));
  async function removeSelected() {
    if (!selectedIds.length || pending) return;
    if (
      !window.confirm(
        it.customerDeleteConfirm.replace("{count}", String(selectedIds.length)),
      )
    )
      return;
    setPending(true);
    setError("");
    try {
      const result = await deleteCustomersAction(selectedIds);
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
  function search(value: string) {
    setQuery(value);
    setSelected([]);
    window.history.replaceState(
      { ...window.history.state },
      "",
      customerListUrl(value),
    );
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
            type="search"
            disabled={pending}
            name="q"
            value={query}
            onChange={(event) => search(event.target.value)}
            placeholder={it.customerSearch}
          />
        </label>
        {query && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => search("")}
          >
            {it.clearSearch}
          </Button>
        )}
      </form>
      <p className="customer-result-count" role="status">
        {shown.length} {it.customerResults}
      </p>
      <div className="inventory-batch-controls customer-batch-toolbar">
        <BatchControls
          active={batchMode}
          pending={pending}
          selectedCount={selectedIds.length}
          deleteDisabled={selectedIds.length > 500}
          hasItems={shown.length > 0}
          manageLabel={it.batchManage}
          selectedLabel={it.inventory.selectedCount.replace(
            "{count}",
            String(selectedIds.length),
          )}
          selectAllLabel={it.selectAll}
          deleteLabel={it.deleteCustomers}
          finishLabel={it.finishBatch}
          onStart={() => {
            setBatchMode(true);
            setSelected([]);
          }}
          onSelectAll={() => setSelected(shown.map((customer) => customer.id))}
          onDelete={removeSelected}
          onFinish={() => {
            setBatchMode(false);
            setSelected([]);
          }}
        />
        {batchMode && selectedIds.length > 500 && (
          <span role="alert">{it.batchLimit}</span>
        )}
      </div>
      {error && (
        <p className="message error" role="alert">
          {translateError(error, locale)}
        </p>
      )}
      <section className="panel customer-table-panel">
        {shown.length ? (
          <table className="customer-table">
            <thead>
              <tr>
                {batchMode && (
                  <th className="customer-selection">
                    <span className="sr-only">{it.selectOption}</span>
                  </th>
                )}
                <th className="customer-name-heading">{it.customer}</th>
                <th className="customer-phone-heading">{it.phone}</th>
                <th className="customer-device-heading">{it.devices}</th>
                <th className="customer-actions-heading">{it.actionsLabel}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((customer) => {
                const href = `/customers/${customer.id}${query ? `?q=${encodeURIComponent(query)}` : ""}`;
                return (
                  <tr className="business-list-row" key={customer.id}>
                    {batchMode && (
                      <td className="customer-selection">
                        <input
                          type="checkbox"
                          aria-label={it.selectOption + " " + customer.name}
                          disabled={pending}
                          checked={selectedIds.includes(customer.id)}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, customer.id]
                                : current.filter((id) => id !== customer.id),
                            )
                          }
                        />
                      </td>
                    )}
                    <td className="customer-name">
                      <Link
                        className="order-link"
                        href={href}
                        onClick={() => {
                          try {
                            sessionStorage.setItem(
                              "customer-list-position",
                              JSON.stringify({ query, y: window.scrollY }),
                            );
                          } catch {}
                        }}
                      >
                        <span>{customer.name}</span>
                        <ChevronRight size={15} aria-hidden="true" />
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
                      <RecordActions customer={customer} disabled={pending} />
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
  showHeading = true,
  dialog = false,
}: {
  customer: Customer;
  query: string;
  deleted: boolean;
  showHeading?: boolean;
  dialog?: boolean;
}) {
  return (
    <section className="panel padded customer-summary">
      <div>
        {showHeading && <h1>{customer.name}</h1>}
        <PhoneList customer={customer} />
      </div>
      {!deleted && (
        <RecordActions
          customer={customer}
          returnTo={customerListUrl(query)}
          closeOnDelete={dialog}
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
          <article
            className="customer-device-row business-list-row"
            key={device.id}
          >
            <div>
              <strong>
                {device.brand} {device.model}
              </strong>
              {device.imei && (
                <small>
                  {it.imei}: {device.imei}
                </small>
              )}
            </div>
            {!readOnly && <RecordActions device={device} />}
          </article>
        ))
      ) : (
        <p className="empty">{it.noDevices}</p>
      )}
    </section>
  );
}
