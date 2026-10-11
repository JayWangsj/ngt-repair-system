"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, Wrench, X, Zap } from "lucide-react";
import {
  createQuickServiceOrderAction,
  lookupCustomerAction,
} from "@/app/actions";
import { decimal } from "@/lib/domain";
import { useMessages } from "./language";
import { DeviceForm, Field, FormDialog } from "./forms";
import { DatePicker } from "./business-select";
import { Button } from "./ui/button";
import {
  CustomerPicker,
  type CustomerDetail,
  type CustomerOption,
} from "./customer-picker";

type Customer = CustomerOption & { devices: { id: string }[] };

type Service = {
  id: string;
  name: string;
  defaultPrice: number;
  notes: string;
};

export function NewServiceOrder({
  repairForm,
  customers,
  services,
  initialMode = "REPAIR",
}: {
  repairForm: ReactNode;
  customers: Customer[];
  services: Service[];
  initialMode?: "REPAIR" | "QUICK_SERVICE";
}) {
  const it = useMessages();
  const router = useRouter();
  const [mode, setMode] = useState<"REPAIR" | "QUICK_SERVICE">(initialMode);
  const [customer, setCustomer] = useState<CustomerDetail>(null);
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<
    Record<string, string>
  >({});
  const [expectedDate, setExpectedDate] = useState("");
  const [expectedTime, setExpectedTime] = useState("");
  const [choosingDevices, setChoosingDevices] = useState(false);
  const [creatingDevice, setCreatingDevice] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const customerId = customer?.id ?? "";
  const expectedAt =
    expectedDate && expectedTime ? `${expectedDate}T${expectedTime}` : "";
  const selectedDevices =
    customer?.devices.filter((device) => deviceIds.includes(device.id)) ?? [];

  function changeCustomer(next: CustomerDetail) {
    setCustomer(next);
    setDeviceIds([]);
    setChoosingDevices(false);
  }

  function toggleDevice(id: string) {
    setDeviceIds((current) =>
      current.includes(id)
        ? current.filter((deviceId) => deviceId !== id)
        : [...current, id],
    );
  }

  async function refreshDevices() {
    if (!customer) return;
    const previousIds = new Set(customer.devices.map((device) => device.id));
    const updated = await lookupCustomerAction(customer.phone);
    if (!updated) return;
    const created = updated.devices.find(
      (device) => !previousIds.has(device.id),
    );
    setCustomer(updated);
    if (created)
      setDeviceIds((current) => [...new Set([...current, created.id])]);
    setCreatingDevice(false);
  }

  async function submit() {
    if (
      !customerId ||
      !deviceIds.length ||
      !Object.keys(selectedServices).length ||
      !expectedAt
    )
      return setError(it.validationError);
    setPending(true);
    setError("");
    const result = await createQuickServiceOrderAction({
      requestId: crypto.randomUUID(),
      customerId,
      deviceIds,
      services: Object.entries(selectedServices).map(([serviceId, price]) => ({
        serviceId,
        price,
      })),
      expectedAt,
    });
    setPending(false);
    if (!result.ok || !result.id)
      return setError(result.ok ? it.connectionError : result.error);
    router.push(`/orders/${result.id}`);
  }

  return (
    <>
      <div className="service-mode-switch panel">
        <button
          type="button"
          className={mode === "REPAIR" ? "active" : ""}
          onClick={() => setMode("REPAIR")}
        >
          <Wrench size={17} aria-hidden="true" />
          {it.quickService.repairMode}
        </button>
        <button
          type="button"
          className={mode === "QUICK_SERVICE" ? "active" : ""}
          onClick={() => setMode("QUICK_SERVICE")}
        >
          <Zap size={17} aria-hidden="true" />
          {it.quickService.quickMode}
        </button>
      </div>
      {mode === "REPAIR" ? (
        repairForm
      ) : (
        <section className="panel padded quick-service-order-form">
          <section className="quick-service-section">
            <h2>{it.customerSection}</h2>
            <CustomerPicker
              customers={customers}
              customer={customer}
              onChange={changeCustomer}
            />
          </section>
          <section className="quick-service-section">
            <div className="quick-service-section-heading">
              <h2>{it.quickService.selectDevices}</h2>
              <Button
                type="button"
                variant="outline"
                disabled={!customer}
                onClick={() => setChoosingDevices(true)}
              >
                <Plus size={16} /> {it.quickService.addDevice}
              </Button>
            </div>
            <div className="quick-service-device-cards">
              {selectedDevices.map((device) => (
                <article className="quick-service-device-card" key={device.id}>
                  <div>
                    <strong>
                      {device.brand} {device.model}
                    </strong>
                    <small>{device.imei || "—"}</small>
                  </div>
                  <button
                    type="button"
                    aria-label={`${it.remove} ${device.brand} ${device.model}`}
                    onClick={() => toggleDevice(device.id)}
                  >
                    <X size={16} />
                  </button>
                </article>
              ))}
              <button
                type="button"
                className="quick-service-device-card is-add"
                disabled={!customer}
                onClick={() => setChoosingDevices(true)}
              >
                <Plus size={18} /> {it.quickService.addDevice}
              </button>
            </div>
          </section>
          <fieldset className="quick-service-choice-list">
            <legend>{it.quickService.serviceItems}</legend>
            {services.map((service) => {
              const checked = service.id in selectedServices;
              return (
                <div className="quick-service-choice" key={service.id}>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setSelectedServices((current) => {
                          const next = { ...current };
                          if (event.target.checked)
                            next[service.id] = decimal(service.defaultPrice);
                          else delete next[service.id];
                          return next;
                        })
                      }
                    />
                    <span>
                      <strong>{service.name}</strong>
                      {service.notes && <small>{service.notes}</small>}
                    </span>
                  </label>
                  {checked && (
                    <input
                      aria-label={`${service.name} ${it.quickService.defaultPrice}`}
                      inputMode="decimal"
                      value={selectedServices[service.id]}
                      onChange={(event) =>
                        setSelectedServices((current) => ({
                          ...current,
                          [service.id]: event.target.value,
                        }))
                      }
                    />
                  )}
                </div>
              );
            })}
            {!services.length && (
              <p className="muted">{it.quickService.noServices}</p>
            )}
          </fieldset>
          <section className="quick-service-section quick-service-schedule">
            <h2>{it.quickService.expectedAt}</h2>
            <div className="form-grid">
              <Field label={it.quickService.expectedDate}>
                <DatePicker
                  value={expectedDate}
                  required
                  onChange={(event) => setExpectedDate(event.target.value)}
                />
              </Field>
              <Field label={it.quickService.expectedTime}>
                <input
                  type="time"
                  value={expectedTime}
                  required
                  onChange={(event) => setExpectedTime(event.target.value)}
                />
              </Field>
            </div>
          </section>
          {error && <p className="message error">{error}</p>}
          <div className="dialog-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/orders")}
            >
              {it.cancel}
            </Button>
            <Button
              type="button"
              disabled={
                pending ||
                !customerId ||
                !deviceIds.length ||
                !expectedAt ||
                !Object.keys(selectedServices).length
              }
              onClick={() => void submit()}
            >
              {it.quickService.createOrder}
            </Button>
          </div>
          {choosingDevices && customer && (
            <FormDialog
              title={it.quickService.selectDevices}
              onClose={() => setChoosingDevices(false)}
            >
              <div className="quick-service-device-picker">
                {customer.devices.map((device) => (
                  <label
                    className="quick-service-device-option"
                    key={device.id}
                  >
                    <input
                      type="checkbox"
                      checked={deviceIds.includes(device.id)}
                      onChange={() => toggleDevice(device.id)}
                    />
                    <span>
                      <strong>
                        {device.brand} {device.model}
                      </strong>
                      <small>{device.imei || "—"}</small>
                    </span>
                  </label>
                ))}
                {!customer.devices.length && (
                  <p className="muted">{it.noDevices}</p>
                )}
                <div className="dialog-actions">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setChoosingDevices(false);
                      setCreatingDevice(true);
                    }}
                  >
                    <Plus size={16} /> {it.newDevice}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setChoosingDevices(false)}
                  >
                    {it.quickService.confirmDevices}
                  </Button>
                </div>
              </div>
            </FormDialog>
          )}
          {creatingDevice && customer && (
            <FormDialog
              title={it.newDevice}
              onClose={() => setCreatingDevice(false)}
            >
              <DeviceForm
                customerId={customer.id}
                onSuccess={() => void refreshDevices()}
                onCancel={() => setCreatingDevice(false)}
              />
            </FormDialog>
          )}
        </section>
      )}
    </>
  );
}
