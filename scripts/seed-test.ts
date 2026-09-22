import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
const db = new PrismaClient();
async function main() {
  if (!new URL(process.env.DATABASE_URL || "").pathname.endsWith("_test"))
    throw new Error("This script only accepts *_test databases.");
  await db.auditLog.deleteMany();
  await db.payment.deleteMany();
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
}
main().finally(() => db.$disconnect());
