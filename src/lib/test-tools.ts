import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type User } from "@prisma/client";
import { BusinessError, romeDay } from "@/lib/domain";
import { db } from "@/lib/db";
import { isTestToolsEnabled } from "@/lib/test-tools-guard";

export async function generateTestData(
  actor: Pick<User, "id" | "name">,
  count: 10 | 50 | 100,
) {
  if (!isTestToolsEnabled())
    throw new BusinessError("Gli strumenti di test non sono disponibili.");

  const token = `${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  const prefix = `TEST-${token}`;
  const now = Date.now();
  const statuses = [
    "RECEIVED",
    "DIAGNOSING",
    "REPAIRING",
    "PARTS_MISSING",
    "READY",
    "COMPLETED",
    "REWORKING",
    "REFUNDED",
    "CANCELLED",
  ] as const;
  const brands = ["Apple", "Samsung", "Xiaomi", "Google", "OnePlus"];
  const models = [
    "iPhone 15 Pro Max",
    "Galaxy S24 Ultra",
    "Redmi Note 13 Pro Plus",
    "Pixel 9 Pro XL",
    "Nord 4 5G Edizione Test",
  ];
  const productCount = Math.min(20, Math.max(6, Math.ceil(count / 5)));

  await db.$transaction(async (tx) => {
    for (const category of ["TEST · Ricambi", "TEST · Accessori"])
      await tx.inventoryCategory.upsert({
        where: { name: category },
        create: { name: category, repairOnly: category.includes("Ricambi") },
        update: {},
      });

    const products: Prisma.ProductCreateManyInput[] = Array.from(
      { length: productCount },
      (_, index) => ({
        id: `${prefix}-product-${index}`,
        name:
          index % 2
            ? `${prefix} Cover protettiva modello lungo ${index + 1}`
            : `${prefix} Batteria compatibile alta capacità ${index + 1}`,
        category: index % 2 ? "TEST · Accessori" : "TEST · Ricambi",
        usage: index % 2 ? "RETAIL" : "REPAIR",
        costPrice: String(8 + index),
        salePrice: String(19 + index * 3),
        stockQuantity: 20 + index,
        minStock: 3,
        favorite: index < 4,
      }),
    );
    await tx.product.createMany({ data: products });
    await tx.inventoryMovement.createMany({
      data: products.map((product) => ({
        requestId: randomUUID(),
        productId: product.id!,
        quantity: product.stockQuantity ?? 0,
        stockBefore: 0,
        stockAfter: product.stockQuantity ?? 0,
        type: "INITIAL_STOCK",
        referenceType: "PRODUCT",
        referenceId: product.id!,
        note: "Dati generati per test",
        actorId: actor.id,
        actorName: actor.name,
      })),
    });

    const customers: Prisma.CustomerCreateManyInput[] = [];
    const devices: Prisma.DeviceCreateManyInput[] = [];
    const orders: Prisma.WorkOrderCreateManyInput[] = [];
    const items: Prisma.WorkOrderItemCreateManyInput[] = [];
    const history: Prisma.StatusHistoryCreateManyInput[] = [];
    for (let index = 0; index < count; index += 1) {
      const customerId = `${prefix}-customer-${index}`;
      const deviceId = `${prefix}-device-${index}`;
      const orderId = `${prefix}-order-${index}`;
      const status = statuses[index % statuses.length];
      const createdAt = new Date(now - index * 60_000);
      const dueOffset = index % 4 === 0 ? -3 : (index % 8) + 1;
      const customerName =
        index % 7 === 0
          ? `${prefix} Cliente con denominazione particolarmente lunga ${index + 1}`
          : `${prefix} Cliente ${index + 1}`;
      customers.push({
        id: customerId,
        name: customerName,
        phone: `+39009${String(now).slice(-5)}${String(index).padStart(3, "0")}`,
        consentAt: createdAt,
        consentVersion: "TEST",
        createdAt,
      });
      devices.push({
        id: deviceId,
        customerId,
        category: "PHONE",
        brand: brands[index % brands.length],
        model: models[index % models.length],
        appearance: "Dati generati per prova interfaccia",
      });
      orders.push({
        id: orderId,
        code: `${prefix}-${String(index + 1).padStart(3, "0")}`,
        customerName,
        deviceId,
        status,
        fault: index % 2 ? "Display rotto" : "Problema di ricarica",
        notes: "Scheda generata automaticamente per test",
        dueDate: romeDay(new Date(now + dueOffset * 86_400_000)),
        afterSalesOpen: status === "REWORKING",
        createdAt,
        updatedAt: createdAt,
      });
      items.push({
        id: `${prefix}-item-${index}`,
        orderId,
        project:
          index % 3 === 0
            ? "Sostituzione componente con descrizione estesa per test"
            : "Sostituzione display",
        suggested: String(80 + (index % 5) * 20),
        final: String(80 + (index % 5) * 20),
        matchLevel: "TEST",
        minutes: 60 + (index % 4) * 15,
      });
      history.push({
        id: `${prefix}-history-${index}`,
        orderId,
        to: status,
        actorId: actor.id,
        actorName: actor.name,
        note: "Stato generato per test",
        createdAt,
      });
    }
    await tx.customer.createMany({ data: customers });
    await tx.device.createMany({ data: devices });
    await tx.workOrder.createMany({ data: orders });
    await tx.workOrderItem.createMany({ data: items });
    await tx.statusHistory.createMany({ data: history });
  });

  return {
    id: prefix,
    customers: count,
    products: productCount,
    orders: count,
  };
}
