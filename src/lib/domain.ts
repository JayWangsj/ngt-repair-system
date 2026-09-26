export const statuses = [
  "RECEIVED",
  "DIAGNOSING",
  "WAITING_APPROVAL",
  "REPAIRING",
  "PARTS_MISSING",
  "READY",
  "COMPLETED",
  "REWORKING",
  "REFUNDED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof statuses)[number];
export type Actor = { id: string; name: string; role: "OWNER" | "STAFF" };
export class BusinessError extends Error {}
export function cents(value: string | { toString(): string }): number {
  const text = value.toString().trim().replace(",", ".");
  if (!/^-?\d{1,8}(\.\d{1,2})?$/.test(text))
    throw new BusinessError("Importo non valido (massimo 2 decimali).");
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const valueInCents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return negative ? -valueInCents : valueInCents;
}
export function decimal(value: number): string {
  if (!Number.isSafeInteger(value))
    throw new BusinessError("Importo non valido.");
  const absolute = Math.abs(value);
  return `${value < 0 ? "-" : ""}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}
export function total(
  items: { final: string | { toString(): string } }[],
): number {
  return items.reduce((sum, item) => sum + cents(item.final), 0);
}
type Amount = string | { toString(): string };
export type QuoteItem = { final: Amount; discount?: Amount };
export type QuoteOptions = { orderDiscount?: Amount; includeVat?: boolean };
export type ProductCharge = {
  unitPrice: Amount;
  discount?: Amount;
  quantity: number;
};
export type WorkOrderOptions = QuoteOptions & {
  products?: ProductCharge[];
  afterSalesFee?: Amount;
  status?: OrderStatus;
};
export function settlement(items: QuoteItem[], options: WorkOrderOptions = {}) {
  const gross = total(items);
  const itemDiscount = items.reduce((sum, item) => {
    const discount = cents(item.discount ?? "0");
    if (discount < 0 || discount > cents(item.final))
      throw new BusinessError("Lo sconto supera il prezzo.");
    return sum + discount;
  }, 0);
  const discount = itemDiscount + cents(options.orderDiscount ?? "0");
  if (discount < 0 || discount > gross)
    throw new BusinessError("Lo sconto supera il prezzo.");
  const net = gross - discount;
  const vat = Math.round((net * 22) / 100);
  const products = options.products ?? [];
  const productTotal = products.reduce((sum, product) => {
    if (!Number.isSafeInteger(product.quantity) || product.quantity <= 0)
      throw new BusinessError("Quantità prodotto non valida.");
    const line = cents(product.unitPrice) * product.quantity;
    const lineDiscount = cents(product.discount ?? "0");
    if (lineDiscount < 0 || lineDiscount > line)
      throw new BusinessError("Lo sconto prodotto supera il prezzo.");
    return sum + line - lineDiscount;
  }, 0);
  const afterSalesTotal = cents(options.afterSalesFee ?? "0");
  if (afterSalesTotal < 0)
    throw new BusinessError("Costo post-vendita non valido.");
  return {
    gross,
    discount,
    net,
    vat,
    withVat: net + vat,
    productTotal,
    afterSalesTotal,
    due: net + (options.includeVat ? vat : 0) + productTotal + afterSalesTotal,
  };
}

export function allocatePayment(
  amount: number,
  repairOutstanding: number,
  retailOutstanding: number,
) {
  const outstanding = repairOutstanding + retailOutstanding;
  if (amount < 0 || amount > outstanding || outstanding <= 0)
    throw new BusinessError("Ripartizione pagamento non valida.");
  if (amount === outstanding)
    return { repair: repairOutstanding, retail: retailOutstanding };
  const repair = Math.min(
    repairOutstanding,
    Math.round((amount * repairOutstanding) / outstanding),
  );
  return {
    repair,
    retail: Math.min(retailOutstanding, amount - repair),
  };
}
export function balance(
  items: QuoteItem[],
  payments: { amount: string | { toString(): string } }[],
  options: WorkOrderOptions = {},
) {
  if (options.status === "REFUNDED") return 0;
  return (
    settlement(items, options).due -
    payments.reduce((sum, payment) => sum + cents(payment.amount), 0)
  );
}
export const transitions: Record<OrderStatus, OrderStatus[]> = {
  RECEIVED: [
    "DIAGNOSING",
    "WAITING_APPROVAL",
    "REPAIRING",
    "PARTS_MISSING",
    "CANCELLED",
  ],
  DIAGNOSING: [
    "WAITING_APPROVAL",
    "REPAIRING",
    "PARTS_MISSING",
    "READY",
    "CANCELLED",
  ],
  WAITING_APPROVAL: ["DIAGNOSING", "REPAIRING", "PARTS_MISSING", "CANCELLED"],
  REPAIRING: ["WAITING_APPROVAL", "PARTS_MISSING", "READY", "CANCELLED"],
  PARTS_MISSING: [
    "DIAGNOSING",
    "WAITING_APPROVAL",
    "REPAIRING",
    "READY",
    "CANCELLED",
  ],
  READY: ["REPAIRING", "COMPLETED"],
  COMPLETED: [],
  REWORKING: ["READY"],
  REFUNDED: [],
  CANCELLED: [],
};
export function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (!transitions[from].includes(to))
    throw new BusinessError("Cambio di stato non consentito.");
}
export function assertOwner(actor: Actor) {
  if (actor.role !== "OWNER")
    throw new BusinessError("Operazione riservata al titolare.");
}
export function assertDelivery(remaining: number) {
  if (remaining !== 0)
    throw new BusinessError("Il saldo deve essere zero prima della consegna.");
}
export function warrantyPeriod(
  deliveredAt: Date | null,
  months: number,
  today = romeDay(),
) {
  if (!deliveredAt || months <= 0) return null;
  const start = romeDay(deliveredAt);
  const [year, month, day] = start.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0),
  ).getUTCDate();
  const end = `${targetYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
  return { start, end, active: today <= end };
}
export function normalizePhone(phone: string) {
  const clean = phone.replace(/[\s().-]/g, "").replace(/^00/, "+");
  if (!/^\+?\d{6,15}$/.test(clean))
    throw new BusinessError("Numero di telefono non valido.");
  return clean.startsWith("+") ? clean : `+39${clean}`;
}
export type MatchableRule = {
  id: string;
  category: string;
  brand: string;
  series: string;
  model: string;
  project: string;
  enabled: boolean;
};
const norm = (s: string) => s.trim().toLocaleLowerCase("it");
export function matchRule<T extends MatchableRule>(
  rules: T[],
  device: { category: string; brand: string; series: string; model: string },
  project: string,
): { rule: T; level: string } | null {
  const eligible = rules.filter(
    (r) =>
      r.enabled &&
      r.category === device.category &&
      norm(r.project) === norm(project),
  );
  const exact = eligible.find(
    (r) =>
      r.model &&
      norm(r.brand) === norm(device.brand) &&
      norm(r.model) === norm(device.model),
  );
  if (exact) return { rule: exact, level: "MODEL" };
  const series = eligible.find(
    (r) =>
      !r.model &&
      r.brand &&
      norm(r.brand) === norm(device.brand) &&
      r.series &&
      norm(r.series) === norm(device.series),
  );
  if (series) return { rule: series, level: "SERIES" };
  const generic = eligible.find((r) => !r.brand && !r.series && !r.model);
  return generic ? { rule: generic, level: "GENERIC" } : null;
}
export function romeDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function isDiagnosticFault(values: string[]) {
  return values.some((value) =>
    ["da diagnosticare", "故障待检测"].includes(value.trim().toLowerCase()),
  );
}
export function isOverdue(
  order: { status: string; dueDate: string | null },
  today = romeDay(),
) {
  return (
    !["COMPLETED", "REFUNDED", "CANCELLED"].includes(order.status) &&
    !!order.dueDate &&
    order.dueDate < today
  );
}
export const money = (amount: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
    amount / 100,
  );
export const dateTime = (date: Date | string) =>
  new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(new Date(date));
export const dateOnly = (date: string | null) =>
  date ? date.split("-").reverse().join("/") : "—";
export const orderCode = (code: string | number) =>
  typeof code === "string" ? code : `NGT-${String(code).padStart(5, "0")}`;
export const saleCode = (code: string | number) =>
  typeof code === "string" ? code : `R-${String(code).padStart(5, "0")}`;
export const creatablePaymentMethods = ["CASH", "CARD", "OTHER"] as const;

export type InventoryStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
export function inventoryStatus(
  stock: number,
  minimum: number,
): InventoryStatus {
  if (stock <= 0) return "OUT_OF_STOCK";
  return stock <= minimum ? "LOW_STOCK" : "IN_STOCK";
}
