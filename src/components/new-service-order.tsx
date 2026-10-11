"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createQuickServiceOrderAction } from "@/app/actions";
import { decimal } from "@/lib/domain";
import { useMessages } from "./language";
import { Field } from "./forms";
import { SimpleSelect } from "./business-select";
import { Button } from "./ui/button";

type Customer = {
  id: string;
  name: string;
  phone: string;
  devices: {
    id: string;
    category: string;
    brand: string;
    model: string;
  }[];
};

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
  const [customerId, setCustomerId] = useState("");
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<
    Record<string, string>
  >({});
  const [expectedAt, setExpectedAt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const customer = customers.find((item) => item.id === customerId);
  const customerOptions = useMemo(
    () =>
      customers.map((item) => ({
        value: item.id,
        label: `${item.name} · ${item.phone}`,
      })),
    [customers],
  );

  async function submit() {
    if (
      !customerId ||
      !deviceIds.length ||
      !Object.keys(selectedServices).length
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
          {it.quickService.repairMode}
        </button>
        <button
          type="button"
          className={mode === "QUICK_SERVICE" ? "active" : ""}
          onClick={() => setMode("QUICK_SERVICE")}
        >
          {it.quickService.quickMode}
        </button>
      </div>
      {mode === "REPAIR" ? (
        repairForm
      ) : (
        <section className="panel padded quick-service-order-form">
          <div className="form-grid">
            <Field label={it.customer}>
              <SimpleSelect
                value={customerId}
                onChange={(value) => {
                  setCustomerId(value);
                  setDeviceIds([]);
                }}
                placeholder={it.selectOption}
                ariaLabel={it.customer}
                options={customerOptions}
              />
            </Field>
            <Field label={it.quickService.expectedAt}>
              <input
                type="datetime-local"
                value={expectedAt}
                required
                onChange={(event) => setExpectedAt(event.target.value)}
              />
            </Field>
          </div>
          <fieldset className="quick-service-choice-list">
            <legend>{it.quickService.selectDevices}</legend>
            {customer?.devices.map((device) => (
              <label className="checkbox" key={device.id}>
                <input
                  type="checkbox"
                  checked={deviceIds.includes(device.id)}
                  onChange={(event) =>
                    setDeviceIds((current) =>
                      event.target.checked
                        ? [...current, device.id]
                        : current.filter((id) => id !== device.id),
                    )
                  }
                />
                {device.brand} {device.model}
              </label>
            ))}
            {customer && !customer.devices.length && (
              <p className="muted">{it.noDevices}</p>
            )}
          </fieldset>
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
        </section>
      )}
    </>
  );
}
