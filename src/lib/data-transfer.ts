import type {
  AuditLog,
  Customer,
  CustomerPhone,
  Device,
  FaultOption,
  Payment,
  PriceRule,
  StatusHistory,
  WorkOrder,
  WorkOrderItem,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { BusinessError, type Actor } from "./domain";
import { normalizeBrand, normalizeModel } from "./catalog";

export const BACKUP_FORMAT = "ngt-repair-data";
export const BACKUP_VERSION = 1;

type JsonRow<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | null
      ? string | null
      : T[K] extends Prisma.Decimal
        ? string
        : T[K] extends Prisma.Decimal | null
          ? string | null
          : T[K];
};
type BackupData = {
  customers: JsonRow<Customer>[];
  phones: JsonRow<CustomerPhone>[];
  devices: JsonRow<Device>[];
  orders: JsonRow<WorkOrder>[];
  items: JsonRow<WorkOrderItem>[];
  payments: JsonRow<Payment>[];
  histories: JsonRow<StatusHistory>[];
  prices: JsonRow<PriceRule>[];
  faults: JsonRow<FaultOption>[];
  audits: JsonRow<AuditLog>[];
};
export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: BackupData;
};
export type ImportSummary = { imported: number; skipped: number };

function date(value: string | null | undefined) {
  return value ? new Date(value) : null;
}
function ensureBackup(value: unknown): BackupFile {
  if (!value || typeof value !== "object")
    throw new BusinessError("File di backup non valido.");
  const candidate = value as Partial<BackupFile>;
  if (
    candidate.format !== BACKUP_FORMAT ||
    typeof candidate.version !== "number" ||
    candidate.version > BACKUP_VERSION ||
    !candidate.data ||
    typeof candidate.data !== "object"
  )
    throw new BusinessError("Formato di backup non supportato.");
  for (const key of [
    "customers",
    "phones",
    "devices",
    "orders",
    "items",
    "payments",
    "histories",
    "prices",
    "faults",
    "audits",
  ] as const)
    if (!Array.isArray(candidate.data[key]))
      throw new BusinessError("File di backup incompleto.");
  return candidate as BackupFile;
}
async function ensureActor(actor: Actor) {
  const found = await db.user.findFirst({
    where: { id: actor.id, enabled: true },
  });
  if (!found) throw new BusinessError("Sessione locale non valida.");
  return found;
}

export async function exportBusinessData(): Promise<BackupFile> {
  const [
    customers,
    phones,
    devices,
    orders,
    items,
    payments,
    histories,
    prices,
    faults,
    audits,
  ] = await Promise.all([
    db.customer.findMany({ orderBy: { createdAt: "asc" } }),
    db.customerPhone.findMany({ orderBy: { phone: "asc" } }),
    db.device.findMany({ orderBy: { id: "asc" } }),
    db.workOrder.findMany({ orderBy: { number: "asc" } }),
    db.workOrderItem.findMany({ orderBy: { id: "asc" } }),
    db.payment.findMany({ orderBy: { receivedAt: "asc" } }),
    db.statusHistory.findMany({ orderBy: { createdAt: "asc" } }),
    db.priceRule.findMany({
      orderBy: [
        { category: "asc" },
        { brand: "asc" },
        { model: "asc" },
        { project: "asc" },
      ],
    }),
    db.faultOption.findMany({ orderBy: [{ category: "asc" }, { key: "asc" }] }),
    db.auditLog.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  const data = JSON.parse(
    JSON.stringify({
      customers,
      phones,
      devices,
      orders,
      items,
      payments,
      histories,
      prices,
      faults,
      audits,
    }),
  ) as BackupData;
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export async function clearBusinessData(actor: Actor) {
  await ensureActor(actor);
  return db.$transaction(async (tx) => {
    await tx.auditLog.deleteMany();
    await tx.payment.deleteMany();
    await tx.statusHistory.deleteMany();
    await tx.workOrderItem.deleteMany();
    await tx.workOrder.deleteMany();
    await tx.device.deleteMany();
    await tx.customerPhone.deleteMany();
    await tx.customer.deleteMany();
    await tx.priceRule.deleteMany();
    await tx.faultOption.deleteMany();
    await tx.$executeRawUnsafe(
      'ALTER SEQUENCE "WorkOrder_number_seq" RESTART WITH 1',
    );
    return { id: "cleared" };
  });
}

export async function importBusinessData(
  actorInput: Actor,
  value: unknown,
): Promise<ImportSummary> {
  const actor = await ensureActor(actorInput);
  const backup = ensureBackup(value);
  let imported = 0;
  let skipped = 0;
  await db.$transaction(async (tx) => {
    const customerIds = new Map<string, string>();
    const deviceIds = new Map<string, string>();
    const priceIds = new Map<string, string>();
    const orderIds = new Map<string, string>();
    const entityIds = new Map<string, string>();
    const orderSourceIds = new Set(backup.data.orders.map((order) => order.id));

    for (const source of backup.data.customers) {
      let target = await tx.customer.findUnique({ where: { id: source.id } });
      target ??= await tx.customer.findFirst({
        where: {
          OR: [
            { phone: source.phone },
            { phones: { some: { phone: source.phone } } },
          ],
        },
      });
      if (!target) {
        target = await tx.customer.create({
          data: {
            id: source.id,
            name: source.name,
            phone: source.phone,
            consentAt: date(source.consentAt),
            consentVersion: source.consentVersion,
            codiceFiscale: source.codiceFiscale,
            partitaIva: source.partitaIva,
            createdAt: date(source.createdAt) ?? new Date(),
            deletedAt: date(source.deletedAt),
          },
        });
        imported++;
      } else skipped++;
      customerIds.set(source.id, target.id);
      entityIds.set(source.id, target.id);
    }
    for (const source of backup.data.phones) {
      const customerId = customerIds.get(source.customerId);
      if (!customerId) {
        skipped++;
        continue;
      }
      const exists = await tx.customerPhone.findUnique({
        where: { phone: source.phone },
      });
      if (exists) skipped++;
      else {
        await tx.customerPhone.create({
          data: { phone: source.phone, customerId },
        });
        imported++;
      }
    }
    for (const source of backup.data.devices) {
      const customerId = customerIds.get(source.customerId);
      if (!customerId) {
        skipped++;
        continue;
      }
      let target = await tx.device.findUnique({ where: { id: source.id } });
      target ??= await tx.device.findFirst({
        where: {
          customerId,
          category: source.category,
          brand: normalizeBrand(source.brand),
          series: normalizeModel(source.series),
          model: normalizeModel(source.model),
          imei: source.imei,
        },
      });
      if (!target) {
        target = await tx.device.create({
          data: {
            id: source.id,
            customerId,
            category: source.category,
            brand: normalizeBrand(source.brand),
            series: normalizeModel(source.series),
            model: normalizeModel(source.model),
            imei: source.imei,
            appearance: source.appearance,
            accessories: source.accessories,
            deletedAt: date(source.deletedAt),
          },
        });
        imported++;
      } else skipped++;
      deviceIds.set(source.id, target.id);
      entityIds.set(source.id, target.id);
    }
    for (const source of backup.data.prices) {
      let target = await tx.priceRule.findUnique({ where: { id: source.id } });
      target ??= await tx.priceRule.findUnique({
        where: {
          category_brand_series_model_project: {
            category: source.category,
            brand: normalizeBrand(source.brand),
            series: normalizeModel(source.series),
            model: normalizeModel(source.model),
            project: source.project,
          },
        },
      });
      if (!target) {
        target = await tx.priceRule.create({
          data: {
            id: source.id,
            category: source.category,
            brand: normalizeBrand(source.brand),
            series: normalizeModel(source.series),
            model: normalizeModel(source.model),
            project: source.project,
            suggested: source.suggested,
            cost: source.cost,
            minutes: source.minutes,
            enabled: source.enabled,
            notes: source.notes,
            updatedAt: date(source.updatedAt) ?? new Date(),
          },
        });
        imported++;
      } else skipped++;
      priceIds.set(source.id, target.id);
      entityIds.set(source.id, target.id);
    }
    for (const source of backup.data.orders) {
      const deviceId = deviceIds.get(source.deviceId);
      if (!deviceId) {
        skipped++;
        continue;
      }
      const target = await tx.workOrder.findUnique({
        where: { id: source.id },
      });
      if (target) {
        skipped++;
        orderIds.set(source.id, target.id);
        entityIds.set(source.id, target.id);
        continue;
      }
      const numberConflict = await tx.workOrder.findUnique({
        where: { number: source.number },
      });
      if (numberConflict) {
        skipped++;
        continue;
      }
      const created = await tx.workOrder.create({
        data: {
          id: source.id,
          number: source.number,
          customerName: source.customerName,
          deviceId,
          status: source.status,
          orderDiscount: source.orderDiscount,
          includeVat: source.includeVat,
          fault: source.fault,
          appearance: source.appearance,
          accessories: source.accessories,
          notes: source.notes,
          dueDate: source.dueDate,
          confirmedAt: date(source.confirmedAt),
          confirmationNote: source.confirmationNote,
          pickedUpAt: date(source.pickedUpAt),
          pickedUpBy: source.pickedUpBy,
          createdAt: date(source.createdAt) ?? new Date(),
          updatedAt: date(source.updatedAt) ?? new Date(),
        },
      });
      imported++;
      orderIds.set(source.id, created.id);
      entityIds.set(source.id, created.id);
    }
    for (const source of backup.data.items) {
      const orderId = orderIds.get(source.orderId);
      if (!orderId) {
        skipped++;
        continue;
      }
      const exists = await tx.workOrderItem.findUnique({
        where: { id: source.id },
      });
      if (exists) skipped++;
      else {
        await tx.workOrderItem.create({
          data: {
            id: source.id,
            orderId,
            ruleId: source.ruleId
              ? (priceIds.get(source.ruleId) ?? null)
              : null,
            project: source.project,
            suggested: source.suggested,
            discount: source.discount,
            final: source.final,
            matchLevel: source.matchLevel,
            adjustmentReason: source.adjustmentReason,
            minutes: source.minutes,
          },
        });
        imported++;
      }
    }
    for (const source of backup.data.payments) {
      const orderId = orderIds.get(source.orderId);
      if (!orderId) {
        skipped++;
        continue;
      }
      const exists =
        (await tx.payment.findUnique({ where: { id: source.id } })) ??
        (await tx.payment.findUnique({
          where: { requestId: source.requestId },
        }));
      if (exists) skipped++;
      else {
        await tx.payment.create({
          data: {
            id: source.id,
            requestId: source.requestId,
            orderId,
            amount: source.amount,
            method: source.method,
            kind: source.kind,
            receivedAt: date(source.receivedAt) ?? new Date(),
            actorId: actor.id,
            actorName: source.actorName,
          },
        });
        imported++;
      }
    }
    for (const source of backup.data.histories) {
      const orderId = orderIds.get(source.orderId);
      if (!orderId) {
        skipped++;
        continue;
      }
      const exists = await tx.statusHistory.findUnique({
        where: { id: source.id },
      });
      if (exists) skipped++;
      else {
        await tx.statusHistory.create({
          data: {
            id: source.id,
            orderId,
            from: source.from,
            to: source.to,
            actorId: actor.id,
            actorName: source.actorName,
            note: source.note,
            createdAt: date(source.createdAt) ?? new Date(),
          },
        });
        imported++;
      }
    }
    for (const source of backup.data.faults) {
      const exists =
        (await tx.faultOption.findUnique({ where: { id: source.id } })) ??
        (await tx.faultOption.findUnique({
          where: {
            category_key: { category: source.category, key: source.key },
          },
        }));
      if (exists) skipped++;
      else {
        await tx.faultOption.create({ data: source });
        imported++;
      }
    }
    for (const source of backup.data.audits) {
      if (
        orderSourceIds.has(source.entityId) &&
        !entityIds.has(source.entityId)
      ) {
        skipped++;
        continue;
      }
      const exists = await tx.auditLog.findUnique({ where: { id: source.id } });
      if (exists) skipped++;
      else {
        await tx.auditLog.create({
          data: {
            id: source.id,
            entityId: entityIds.get(source.entityId) ?? source.entityId,
            action: source.action,
            actorId: actor.id,
            actorName: source.actorName,
            context: source.context as Prisma.InputJsonValue,
            createdAt: date(source.createdAt) ?? new Date(),
          },
        });
        imported++;
      }
    }
    await tx.$executeRawUnsafe(
      "SELECT setval(" +
        "pg_get_serial_sequence('\"WorkOrder\"', 'number'), " +
        'GREATEST((SELECT COALESCE(MAX("number"), 0) FROM "WorkOrder"), 1), ' +
        '(SELECT COUNT(*) > 0 FROM "WorkOrder"))',
    );
  });
  return { imported, skipped };
}
