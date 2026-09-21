import { z } from "zod";
import { normalizePhone, statuses } from "./domain";
const short = z.string().trim().min(1, "Campo obbligatorio").max(120);
const text = z.string().trim().max(2000).default("");
export const amountInput = z
  .string()
  .trim()
  .regex(/^\d{1,8}([.,]\d{1,2})?$/, "Importo non valido");
export const phoneInput = z
  .string()
  .trim()
  .min(6)
  .max(30)
  .transform((value, ctx) => {
    try {
      return normalizePhone(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "Telefono non valido" });
      return z.NEVER;
    }
  });
const day = z
  .string()
  .refine(
    (value) =>
      !value ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value),
    "Data non valida",
  )
  .default("");
export const itemInput = z.object({
  project: short,
  final: amountInput,
  adjustmentReason: text,
  discount: amountInput.default("0"),
  saveRule: z.boolean().default(false),
});
export const orderInput = z.object({
  requestId: z.string().uuid(),
  customerName: short,
  phone: phoneInput,
  additionalPhones: z.array(phoneInput).max(2).default([]),
  privacyConsent: z.boolean().default(false),
  category: z
    .enum(["PHONE", "TABLET", "LAPTOP", "DESKTOP", "CONSOLE", "OTHER"])
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
  dueDate: day,
  confirmed: z.boolean().default(false),
  confirmationNote: text,
  items: z.array(itemInput).min(1).max(30),
  deposit: amountInput.default("0"),
  method: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]).default("CASH"),
});
export const editInput = z.object({
  fault: z.string().trim().min(1).max(2000),
  notes: text,
  appearance: text,
  accessories: text,
  dueDate: day,
});
export const paymentInput = z.object({
  requestId: z.string().uuid(),
  amount: amountInput,
  method: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]),
  kind: z.enum(["DEPOSIT", "BALANCE", "OTHER"]),
});
export const statusInput = z.object({
  status: z.enum(statuses),
  note: text,
  pickedUpBy: z.string().trim().max(120).default(""),
  override: z.boolean().default(false),
});
export const ruleInput = z
  .object({
    brand: z.string().trim().max(120).default(""),
    series: z.string().trim().max(120).default(""),
    model: z.string().trim().max(120).default(""),
    project: short,
    suggested: amountInput,
    cost: z.union([amountInput, z.literal("")]).default(""),
    minutes: z.coerce.number().int().min(0).max(10000).default(60),
    enabled: z.boolean().default(true),
    notes: text,
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
    "Telefoni duplicati.",
  );
export const deviceInput = z.object({
  category: z.enum([
    "PHONE",
    "TABLET",
    "LAPTOP",
    "DESKTOP",
    "CONSOLE",
    "OTHER",
  ]),
  brand: short,
  model: short,
  imei: z.string().trim().max(30).default(""),
});
