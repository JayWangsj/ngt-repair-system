import { z } from "zod";
import { isDiagnosticFault, normalizePhone, romeDay, statuses } from "./domain";
const short = z.string().trim().min(1, "Campo obbligatorio").max(120);
const text = z.string().trim().max(2000).default("");
export const amountInput = z
  .string()
  .trim()
  .regex(/^\d{1,8}([.,]\d{1,2})?$/, "Importo non valido");
export const phoneInput = z
  .string()
  .trim()
  .min(6, "Il numero di telefono è troppo corto.")
  .max(30)
  .transform((value, ctx) => {
    try {
      return normalizePhone(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "Telefono non valido" });
      return z.NEVER;
    }
  });
export const dueDateInput = z
  .string()
  .refine(
    (value) =>
      !value ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value),
    "Data non valida",
  )
  .refine(
    (value) => !value || value >= romeDay(),
    "La consegna non può precedere oggi.",
  )
  .default("");
export const itemInput = z.object({
  project: short,
  final: amountInput,
  adjustmentReason: text,
  discount: amountInput.default("0"),
  saveRule: z.boolean().default(false),
});
export const orderInput = z
  .object({
    requestId: z.string().uuid(),
    customerName: short,
    phone: phoneInput,
    additionalPhones: z.array(phoneInput).max(2).default([]),
    privacyConsent: z.boolean().default(false),
    category: z
      .enum([
        "PHONE",
        "TABLET",
        "LAPTOP",
        "DESKTOP",
        "CONSOLE",
        "SMARTWATCH",
        "SMARTBAND",
        "OTHER",
      ])
      .default("PHONE"),
    faults: z.array(short).max(30).default([]),
    orderDiscount: amountInput.default("0"),
    includeVat: z.boolean().default(false),
    paymentKind: z.enum(["DEPOSIT", "BALANCE"]).default("DEPOSIT"),
    deviceId: z.string().max(100).default(""),
    brand: short,
    series: z.string().trim().max(120).default(""),
    model: short,
    imei: z.string().trim().max(30).default(""),
    appearance: text,
    accessories: text,
    fault: z.string().trim().max(2000).default(""),
    notes: text,
    dueDate: dueDateInput,
    confirmed: z.boolean().default(false),
    confirmationNote: text,
    items: z.array(itemInput).max(30),
    diagnosticFee: amountInput.default("10"),
    deposit: amountInput.default("0"),
    method: z.enum(["CASH", "CARD", "OTHER"]).default("CASH"),
  })
  .superRefine((value, ctx) => {
    const diagnostic = isDiagnosticFault([...value.faults, value.fault]);
    if (!diagnostic && value.items.length === 0)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Aggiungi almeno un intervento.",
      });
  });
export const editInput = z.object({
  fault: z.string().trim().min(1).max(2000),
  notes: text,
  appearance: text,
  accessories: text,
  dueDate: dueDateInput,
});
export const paymentInput = z.object({
  requestId: z.string().uuid(),
  amount: amountInput,
  method: z.enum(["CASH", "CARD", "OTHER"]),
  kind: z.enum(["DEPOSIT", "BALANCE", "OTHER"]),
});
export const productInput = z.object({
  requestId: z.string().uuid(),
  name: short,
  category: short,
  usage: z.enum(["RETAIL", "REPAIR", "BOTH"]),
  costPrice: amountInput,
  salePrice: amountInput,
  initialStock: z.coerce.number().int().min(0).max(1_000_000).default(0),
  minStock: z.coerce.number().int().min(0).max(1_000_000).default(0),
  favorite: z.boolean().default(false),
  enabled: z.boolean().default(true),
});
export const productUpdateInput = z.object({
  name: short,
  category: short,
  usage: z.enum(["RETAIL", "REPAIR", "BOTH"]),
  costPrice: amountInput,
  salePrice: amountInput,
  stockQuantity: z.coerce.number().int().min(0).max(1_000_000),
  minStock: z.coerce.number().int().min(0).max(1_000_000),
  favorite: z.boolean(),
});
export const paidTotalInput = z.object({
  requestId: z.string().uuid(),
  amount: amountInput,
  method: z.enum(["CASH", "CARD", "OTHER"]).default("CASH"),
});
export const inventoryAdjustmentInput = z.object({
  requestId: z.string().uuid(),
  quantity: z.coerce
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((value) => value !== 0, "La variazione non può essere zero."),
  type: z.enum(["STOCK_IN", "MANUAL_ADJUSTMENT"]),
  note: text,
});
export const retailSaleInput = z.object({
  requestId: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .max(100),
  discount: amountInput.default("0"),
  method: z.enum(["CASH", "CARD", "OTHER"]),
});
export const workOrderProductInput = z.object({
  productId: z.string().min(1),
  kind: z.enum(["REPAIR_PART", "RETAIL_ADDON"]),
  quantity: z.coerce.number().int().min(1).max(999),
});
export const checkoutInput = z.object({
  requestId: z.string().uuid(),
  amount: amountInput.default("0"),
  method: z.enum(["CASH", "CARD", "OTHER"]),
  pickedUpBy: short,
  pickedUpAt: z.string().datetime().optional(),
  override: z.boolean().default(false),
});
export const statusInput = z.object({
  status: z.enum(statuses),
  note: text,
  pickedUpBy: z.string().trim().max(120).default(""),
  override: z.boolean().default(false),
});
export const warrantyInput = z.object({
  months: z.coerce.number().int().min(0).max(120),
  scope: text,
  notes: text,
});
export const afterSalesInput = z.object({
  reason: short,
  projectId: z.string().trim().max(120).default(""),
  projectSource: z.enum(["original", "catalog", "custom"]).default("custom"),
  treatment: z.enum(["WARRANTY", "PAID"]).default("PAID"),
  notes: text,
  fee: amountInput.default("0"),
  dueDate: dueDateInput,
});
export const refundInput = z.object({
  requestId: z.string().uuid(),
  method: z.enum(["CASH", "CARD", "OTHER"]),
  reason: z.string().trim().min(1).max(2000),
});
export const ruleInput = z
  .object({
    category: z
      .enum([
        "PHONE",
        "TABLET",
        "LAPTOP",
        "DESKTOP",
        "CONSOLE",
        "SMARTWATCH",
        "SMARTBAND",
        "OTHER",
      ])
      .default("PHONE"),
    brand: z.string().trim().max(120).default(""),
    series: z.string().trim().max(120).default(""),
    model: z.string().trim().max(120).default(""),
    project: short,
    suggested: amountInput,
    cost: z.union([amountInput, z.literal("")]).default(""),
    minutes: z.coerce.number().int().min(0).max(10000).default(60),
    enabled: z.boolean().default(true),
    notes: text,
    requiredProductId: z.string().trim().max(100).default(""),
    requiredQuantity: z.coerce.number().int().min(1).max(999).default(1),
  })
  .superRefine((r, ctx) => {
    if (
      (r.model && !r.brand) ||
      (r.series && !r.brand) ||
      (r.brand && !r.model && !r.series) ||
      (r.model && r.series)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Scegli marca + modello, marca + serie oppure una regola generica senza dispositivo.",
      });
  });
export const userInput = z.object({
  name: short,
  email: z.string().email().toLowerCase(),
  password: z.string().min(12).max(128),
  role: z.enum(["OWNER", "STAFF"]),
});

export const quoteInput = z.object({
  items: z.array(itemInput).min(1).max(30),
  orderDiscount: amountInput.default("0"),
  includeVat: z.boolean().default(false),
});

export const customerInput = z
  .object({
    name: short,
    phone: phoneInput,
    additionalPhones: z.array(phoneInput).max(2).default([]),
  })
  .refine(
    (v) =>
      new Set([v.phone, ...v.additionalPhones]).size ===
      1 + v.additionalPhones.length,
    "I numeri di telefono non possono essere duplicati.",
  );
export const deviceInput = z.object({
  category: z.enum([
    "PHONE",
    "TABLET",
    "LAPTOP",
    "DESKTOP",
    "CONSOLE",
    "SMARTWATCH",
    "SMARTBAND",
    "OTHER",
  ]),
  brand: short,
  model: short,
  imei: z.string().trim().max(30).default(""),
});
