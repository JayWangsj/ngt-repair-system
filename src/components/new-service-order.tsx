"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Smartphone, Wrench, X, Zap } from "lucide-react";
import {
  createQuickServiceOrderAction,
  lookupCustomerAction,
} from "@/app/actions";
import { cents, decimal, money } from "@/lib/domain";
import { useMessages } from "./language";
import { DeviceForm, Field, FormDialog } from "./forms";
import { DatePicker } from "./business-select";
import { Button } from "./ui/button";
import {
  CustomerPicker,
  type CustomerDetail,
  type CustomerOption,
} from "./customer-picker";
import { QuickServiceEditor, type QuickServiceView } from "./catalog-managers";

type Customer = CustomerOption & { devices: { id: string }[] };

type Service = Omit<QuickServiceView, "enabled">;

function validPrice(value: string) {
  try {
    return cents(value) > 0;
  } catch {
    return false;
  }
}

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
  const [availableServices, setAvailableServices] = useState<
    QuickServiceView[]
  >(services.map((service) => ({ ...service, enabled: true })));
  const [selectedServices, setSelectedServices] = useState<
    Record<string, string>
  >({});
  const [editingServicePrices, setEditingServicePrices] = useState<
    Record<string, boolean>
  >({});
  const [expectedDate, setExpectedDate] = useState("");
  const [expectedTime, setExpectedTime] = useState("");
  const [choosingDevices, setChoosingDevices] = useState(false);
  const [draftDeviceIds, setDraftDeviceIds] = useState<string[]>([]);
  const [choosingServices, setChoosingServices] = useState(false);
  const [draftServiceIds, setDraftServiceIds] = useState<string[]>([]);
  const [creatingDevice, setCreatingDevice] = useState(false);
  const [creatingService, setCreatingService] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const customerId = customer?.id ?? "";
  const expectedAt =
    expectedDate && expectedTime ? `${expectedDate}T${expectedTime}` : "";
  const selectedDevices =
    customer?.devices.filter((device) => deviceIds.includes(device.id)) ?? [];
  const selectedServiceItems = availableServices.filter(
    (service) => service.id in selectedServices,
  );

  function changeCustomer(next: CustomerDetail) {
    setCustomer(next);
    setDeviceIds([]);
    setChoosingDevices(false);
  }

  function toggleDraftDevice(id: string) {
    setDraftDeviceIds((current) =>
      current.includes(id)
        ? current.filter((deviceId) => deviceId !== id)
        : [...current, id],
    );
  }

  function openDevicePicker() {
    setDraftDeviceIds(deviceIds);
    setChoosingDevices(true);
  }

  function openServicePicker() {
    setDraftServiceIds(Object.keys(selectedServices));
    setChoosingServices(true);
  }

  function confirmServices() {
    setSelectedServices((current) =>
      Object.fromEntries(
        draftServiceIds.map((id) => {
          const service = availableServices.find((item) => item.id === id)!;
          return [id, current[id] ?? decimal(service.defaultPrice)];
        }),
      ),
    );
    setChoosingServices(false);
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
      setDraftDeviceIds((current) => [...new Set([...current, created.id])]);
    setCreatingDevice(false);
    setChoosingDevices(true);
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
        <div className="new-order-layout quick-service-layout">
          <section className="panel padded quick-service-order-form service-order-form-column">
            <section className="quick-service-section">
              <h2>{it.customerSection}</h2>
              <CustomerPicker
                customers={customers}
                customer={customer}
                onChange={changeCustomer}
              />
            </section>
            <section className="quick-service-section">
              <h2>{it.quickService.selectDevices}</h2>
              <div className="quick-service-device-cards">
                {selectedDevices.map((device) => (
                  <article
                    className="quick-service-device-card"
                    key={device.id}
                  >
                    <div>
                      <strong>
                        {device.brand} {device.model}
                      </strong>
                      <small>{device.imei || "—"}</small>
                    </div>
                    <button
                      type="button"
                      aria-label={`${it.remove} ${device.brand} ${device.model}`}
                      onClick={() =>
                        setDeviceIds((current) =>
                          current.filter((id) => id !== device.id),
                        )
                      }
                    >
                      <X size={16} />
                    </button>
                  </article>
                ))}
                <button
                  type="button"
                  className="quick-service-device-card is-add"
                  disabled={!customer}
                  onClick={openDevicePicker}
                >
                  <Plus size={18} /> {it.quickService.addDevice}
                </button>
              </div>
            </section>
            <section className="quick-service-section">
              <h2>{it.quickService.serviceItems}</h2>
              <div className="quick-service-service-cards">
                {selectedServiceItems.map((service) => (
                  <article
                    className="selection-summary selected-project-summary"
                    key={service.id}
                  >
                    <span className="selection-summary-icon is-project">
                      <Zap size={18} aria-hidden="true" />
                    </span>
                    <div className="selection-summary-copy">
                      <strong>{service.name}</strong>
                      <small>
                        {service.notes || it.quickService.quickMode}
                      </small>
                    </div>
                    <div className="selection-summary-value">
                      <small>{it.currentQuote}</small>
                      {editingServicePrices[service.id] ? (
                        <div className="quote-summary-price-field">
                          <input
                            autoFocus
                            className="quote-summary-price"
                            aria-label={`${service.name} ${it.currentQuote}`}
                            inputMode="decimal"
                            value={selectedServices[service.id]}
                            aria-invalid={
                              !validPrice(selectedServices[service.id])
                            }
                            onChange={(event) =>
                              setSelectedServices((current) => ({
                                ...current,
                                [service.id]: event.target.value,
                              }))
                            }
                            onBlur={() => {
                              if (validPrice(selectedServices[service.id]))
                                setEditingServicePrices((current) => ({
                                  ...current,
                                  [service.id]: false,
                                }));
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter") return;
                              event.preventDefault();
                              if (validPrice(selectedServices[service.id]))
                                event.currentTarget.blur();
                            }}
                          />
                          {!validPrice(selectedServices[service.id]) && (
                            <small className="field-error">
                              {it.positiveAmountError}
                            </small>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="summary-price-button"
                          aria-label={`${it.edit} ${it.currentQuote}`}
                          onClick={() =>
                            setEditingServicePrices((current) => ({
                              ...current,
                              [service.id]: true,
                            }))
                          }
                        >
                          <strong>
                            {money(cents(selectedServices[service.id]))}
                          </strong>
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      className="quick-service-remove"
                      aria-label={`${it.remove} ${service.name}`}
                      onClick={() =>
                        setSelectedServices((current) => {
                          const next = { ...current };
                          delete next[service.id];
                          return next;
                        })
                      }
                    >
                      <X size={16} />
                    </button>
                  </article>
                ))}
                <button
                  type="button"
                  className="quick-service-service-add"
                  onClick={openServicePicker}
                >
                  <Plus size={18} /> {it.quickService.addService}
                </button>
              </div>
            </section>
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
                subtitle={it.quickService.devicePickerHelp}
                onClose={() => setChoosingDevices(false)}
              >
                <div className="quick-service-picker">
                  <div className="quick-service-picker-list">
                    {customer.devices.map((device) => (
                      <label
                        className={`quick-service-picker-option${draftDeviceIds.includes(device.id) ? " is-selected" : ""}`}
                        key={device.id}
                      >
                        <input
                          type="checkbox"
                          checked={draftDeviceIds.includes(device.id)}
                          onChange={() => toggleDraftDevice(device.id)}
                        />
                        <span className="quick-service-picker-icon">
                          <Smartphone size={22} aria-hidden="true" />
                        </span>
                        <span className="quick-service-picker-copy">
                          <strong>
                            {device.brand} {device.model}
                          </strong>
                          <small>{device.category}</small>
                        </span>
                        <small className="quick-service-picker-meta">
                          IMEI: {device.imei || "—"}
                        </small>
                      </label>
                    ))}
                    {!customer.devices.length && (
                      <p className="muted">{it.noDevices}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="quick-service-picker-add"
                    onClick={() => {
                      setChoosingDevices(false);
                      setCreatingDevice(true);
                    }}
                  >
                    <Plus size={16} /> {it.newDevice}
                  </button>
                  <div className="quick-service-picker-footer">
                    <strong>
                      {it.quickService.selectedDevices.replace(
                        "{count}",
                        String(draftDeviceIds.length),
                      )}
                    </strong>
                    <div className="dialog-actions">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setChoosingDevices(false)}
                      >
                        {it.cancel}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          setDeviceIds(draftDeviceIds);
                          setChoosingDevices(false);
                        }}
                      >
                        {it.quickService.confirmDevices}
                      </Button>
                    </div>
                  </div>
                </div>
              </FormDialog>
            )}
            {choosingServices && (
              <FormDialog
                title={it.quickService.selectServices}
                subtitle={it.quickService.servicePickerHelp}
                onClose={() => setChoosingServices(false)}
              >
                <div className="quick-service-picker">
                  <div className="quick-service-picker-list">
                    {availableServices.map((service) => (
                      <label
                        className={`quick-service-picker-option quick-service-picker-service${draftServiceIds.includes(service.id) ? " is-selected" : ""}`}
                        key={service.id}
                      >
                        <input
                          type="checkbox"
                          checked={draftServiceIds.includes(service.id)}
                          onChange={() =>
                            setDraftServiceIds((current) =>
                              current.includes(service.id)
                                ? current.filter((id) => id !== service.id)
                                : [...current, service.id],
                            )
                          }
                        />
                        <span className="quick-service-picker-icon">
                          <Zap size={22} aria-hidden="true" />
                        </span>
                        <span className="quick-service-picker-copy">
                          <strong>{service.name}</strong>
                          <small>
                            {service.notes || it.quickService.quickMode}
                          </small>
                        </span>
                        <strong className="quick-service-picker-price">
                          {money(service.defaultPrice)}
                        </strong>
                      </label>
                    ))}
                    {!availableServices.length && (
                      <p className="muted">{it.quickService.noServices}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="quick-service-picker-add"
                    onClick={() => {
                      setChoosingServices(false);
                      setCreatingService(true);
                    }}
                  >
                    <Plus size={16} /> {it.quickService.new}
                  </button>
                  <div className="quick-service-picker-footer">
                    <strong>
                      {it.quickService.selectedServices.replace(
                        "{count}",
                        String(draftServiceIds.length),
                      )}
                    </strong>
                    <div className="dialog-actions">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setChoosingServices(false)}
                      >
                        {it.cancel}
                      </Button>
                      <Button type="button" onClick={confirmServices}>
                        {it.quickService.confirmServices}
                      </Button>
                    </div>
                  </div>
                </div>
              </FormDialog>
            )}
            {creatingDevice && customer && (
              <FormDialog
                title={it.newDevice}
                onClose={() => {
                  setCreatingDevice(false);
                  setChoosingDevices(true);
                }}
              >
                <DeviceForm
                  customerId={customer.id}
                  onSuccess={() => void refreshDevices()}
                  onCancel={() => {
                    setCreatingDevice(false);
                    setChoosingDevices(true);
                  }}
                />
              </FormDialog>
            )}
            {creatingService && (
              <FormDialog
                title={it.quickService.new}
                onClose={() => {
                  setCreatingService(false);
                  setChoosingServices(true);
                }}
              >
                <QuickServiceEditor
                  onCancel={() => {
                    setCreatingService(false);
                    setChoosingServices(true);
                  }}
                  onSaved={(saved) => {
                    setAvailableServices((current) =>
                      saved.enabled
                        ? [...current, saved].sort((a, b) =>
                            a.name.localeCompare(b.name),
                          )
                        : current,
                    );
                    if (saved.enabled)
                      setDraftServiceIds((current) => [
                        ...new Set([...current, saved.id]),
                      ]);
                    setCreatingService(false);
                    setChoosingServices(true);
                  }}
                />
              </FormDialog>
            )}
          </section>
        </div>
      )}
    </>
  );
}
