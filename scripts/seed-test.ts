import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
const db = new PrismaClient();
async function main() {
  if (!new URL(process.env.DATABASE_URL || "").pathname.endsWith("_test"))
    throw new Error("This script only accepts *_test databases.");
  await db.auditLog.deleteMany();
  await db.paymentAllocation.deleteMany();
  await db.payment.deleteMany();
  await db.retailSaleItem.deleteMany();
  await db.retailSale.deleteMany();
  await db.inventoryMovement.deleteMany();
  await db.product.deleteMany();
  await db.statusHistory.deleteMany();
  await db.workOrderItem.deleteMany();
  await db.workOrder.deleteMany();
  await db.device.deleteMany();
  await db.customer.deleteMany();
  await db.priceRule.deleteMany();
  await db.faultOption.deleteMany();
  await db.user.deleteMany();
  const passwordHash = await hash("Test-Only-Password-2026", 12);
  await db.user.createMany({
    data: [
      { email: "owner@test.it", name: "Titolare", role: "OWNER", passwordHash },
      { email: "staff@test.it", name: "Tecnico", role: "STAFF", passwordHash },
    ],
  });
  await db.priceRule.create({
    data: {
      category: "PHONE",
      brand: "Apple",
      model: "iPhone 13",
      project: "sostituzione display",
      suggested: "100",
      minutes: 60,
      enabled: true,
    },
  });
  const actor = await db.user.findUniqueOrThrow({
    where: { email: "owner@test.it" },
  });
  for (const product of [
    {
      name: "Cavo USB-C Test",
      category: "Ricarica",
      usage: "BOTH" as const,
      costPrice: "4.00",
      salePrice: "12.00",
      stockQuantity: 10,
      minStock: 2,
      favorite: true,
    },
    {
      name: "Cover esaurita Test",
      category: "Cover",
      usage: "RETAIL" as const,
      costPrice: "3.00",
      salePrice: "15.00",
      stockQuantity: 0,
      minStock: 2,
      favorite: false,
    },
  ]) {
    const created = await db.product.create({ data: product });
    if (product.stockQuantity > 0)
      await db.inventoryMovement.create({
        data: {
          requestId: randomUUID(),
          productId: created.id,
          quantity: product.stockQuantity,
          stockBefore: 0,
          stockAfter: product.stockQuantity,
          type: "INITIAL_STOCK",
          referenceType: "PRODUCT",
          referenceId: created.id,
          actorId: actor.id,
          actorName: actor.name,
        },
      });
  }
}
main().finally(() => db.$disconnect());
