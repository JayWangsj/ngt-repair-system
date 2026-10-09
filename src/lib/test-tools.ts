import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type User } from "@prisma/client";
import { getBusinessDay } from "@/lib/business-date";
import { BusinessError } from "@/lib/domain";
import { db } from "@/lib/db";
import { isTestToolsEnabled } from "@/lib/test-tools-guard";

const devices = [
  { brand: "Apple", model: "iPhone 15 Pro Max", prices: [349, 129, 159, 219] },
  { brand: "Samsung", model: "Galaxy S24 Ultra", prices: [329, 119, 149, 249] },
  { brand: "Xiaomi", model: "Redmi Note 13 Pro+", prices: [149, 79, 99, 139] },
  { brand: "Google", model: "Pixel 9 Pro XL", prices: [299, 119, 159, 229] },
  { brand: "OnePlus", model: "Nord 4 5G", prices: [179, 89, 119, 159] },
];

const projects = [
  { name: "sostituzione display", minutes: 90, product: "Display" },
  { name: "sostituzione batteria", minutes: 60, product: "Batteria" },
  {
    name: "riparazione connettore di ricarica",
    minutes: 90,
    product: "Connettore",
  },
  {
    name: "sostituzione fotocamera posteriore",
    minutes: 75,
    product: "Fotocamera",
  },
];

const productCatalog = [
  {
    name: "Display OLED compatibile iPhone 15 Pro Max",
    category: "Display e touchscreen",
    usage: "REPAIR",
    costPrice: "148.00",
    salePrice: "249.00",
    stockQuantity: 7,
    minStock: 2,
  },
  {
    name: "Cover silicone MagSafe iPhone 15 Pro Max",
    category: "Cover",
    usage: "RETAIL",
    costPrice: "7.50",
    salePrice: "19.90",
    stockQuantity: 18,
    minStock: 4,
  },
  {
    name: "Batteria iPhone 15 Pro Max 4422 mAh",
    category: "Batterie",
    usage: "REPAIR",
    costPrice: "42.00",
    salePrice: "89.00",
    stockQuantity: 9,
    minStock: 3,
  },
  {
    name: "Cavo USB-C 60 W 1 m",
    category: "Cavi e alimentazione",
    usage: "RETAIL",
    costPrice: "4.80",
    salePrice: "12.90",
    stockQuantity: 26,
    minStock: 6,
  },
  {
    name: "Display Dynamic AMOLED Galaxy S24 Ultra",
    category: "Display e touchscreen",
    usage: "REPAIR",
    costPrice: "185.00",
    salePrice: "299.00",
    stockQuantity: 5,
    minStock: 2,
  },
  {
    name: "Alimentatore USB-C PD 30 W",
    category: "Cavi e alimentazione",
    usage: "RETAIL",
    costPrice: "11.50",
    salePrice: "24.90",
    stockQuantity: 15,
    minStock: 4,
  },
  {
    name: "Connettore USB-C Pixel 9 Pro XL",
    category: "Connettori e ricarica",
    usage: "REPAIR",
    costPrice: "29.00",
    salePrice: "69.00",
    stockQuantity: 8,
    minStock: 2,
  },
  {
    name: "Pellicola vetro temperato universale",
    category: "Protezione schermo",
    usage: "RETAIL",
    costPrice: "1.80",
    salePrice: "9.90",
    stockQuantity: 40,
    minStock: 10,
  },
  {
    name: "Fotocamera posteriore OnePlus Nord 4",
    category: "Fotocamere",
    usage: "REPAIR",
    costPrice: "48.00",
    salePrice: "99.00",
    stockQuantity: 6,
    minStock: 2,
  },
  {
    name: "Cuffie USB-C con microfono",
    category: "Audio",
    usage: "RETAIL",
    costPrice: "6.80",
    salePrice: "19.90",
    stockQuantity: 20,
    minStock: 5,
  },
  {
    name: "Display AMOLED Redmi Note 13 Pro+",
    category: "Display e touchscreen",
    usage: "REPAIR",
    costPrice: "62.00",
    salePrice: "129.00",
    stockQuantity: 10,
    minStock: 3,
  },
  {
    name: "Cover trasparente Galaxy S24 Ultra",
    category: "Cover",
    usage: "RETAIL",
    costPrice: "5.20",
    salePrice: "14.90",
    stockQuantity: 22,
    minStock: 5,
  },
  {
    name: "Batteria Galaxy S24 Ultra 5000 mAh",
    category: "Batterie",
    usage: "REPAIR",
    costPrice: "38.00",
    salePrice: "79.00",
    stockQuantity: 11,
    minStock: 3,
  },
  {
    name: "Pellicola privacy iPhone 15 Pro Max",
    category: "Protezione schermo",
    usage: "RETAIL",
    costPrice: "3.50",
    salePrice: "14.90",
    stockQuantity: 24,
    minStock: 6,
  },
  {
    name: "Altoparlante auricolare iPhone 15 Pro Max",
    category: "Audio",
    usage: "REPAIR",
    costPrice: "18.00",
    salePrice: "49.00",
    stockQuantity: 7,
    minStock: 2,
  },
  {
    name: "Supporto auto magnetico",
    category: "Accessori",
    usage: "RETAIL",
    costPrice: "5.50",
    salePrice: "16.90",
    stockQuantity: 16,
    minStock: 4,
  },
  {
    name: "Vetro fotocamera Galaxy S24 Ultra",
    category: "Fotocamere",
    usage: "REPAIR",
    costPrice: "12.00",
    salePrice: "35.00",
    stockQuantity: 13,
    minStock: 3,
  },
  {
    name: "Power bank 10000 mAh 20 W",
    category: "Cavi e alimentazione",
    usage: "RETAIL",
    costPrice: "14.50",
    salePrice: "34.90",
    stockQuantity: 12,
    minStock: 3,
  },
  {
    name: "Flat accensione Redmi Note 13 Pro+",
    category: "Componenti interni",
    usage: "REPAIR",
    costPrice: "9.50",
    salePrice: "29.00",
    stockQuantity: 9,
    minStock: 2,
  },
  {
    name: "Adattatore USB-C a jack 3,5 mm",
    category: "Audio",
    usage: "RETAIL",
    costPrice: "3.20",
    salePrice: "11.90",
    stockQuantity: 25,
    minStock: 6,
  },
] as const;

const firstNames = [
  "Alessandro",
  "Andrea",
  "Chiara",
  "Davide",
  "Elena",
  "Federico",
  "Francesca",
  "Giulia",
  "Lorenzo",
  "Luca",
  "Marco",
  "Martina",
  "Matteo",
  "Michela",
  "Paolo",
  "Sara",
  "Simone",
  "Sofia",
  "Stefano",
  "Valentina",
];
const lastNames = [
  "Bianchi",
  "Colombo",
  "Conti",
  "Costa",
  "De Angelis",
  "De Santis",
  "Esposito",
  "Ferrari",
  "Fontana",
  "Gallo",
  "Giordano",
  "Greco",
  "Lombardi",
  "Mancini",
  "Marino",
  "Moretti",
  "Ricci",
  "Rinaldi",
  "Romano",
  "Russo",
];

function offsetDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

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
  const productCount = Math.min(20, Math.max(6, Math.ceil(count / 5)));

  await db.$transaction(async (tx) => {
    const businessDay = await getBusinessDay(tx);
    const selectedCatalog = productCatalog.slice(0, productCount);
    for (const category of new Set(
      selectedCatalog.map((item) => item.category),
    )) {
      const repairOnly = selectedCatalog
        .filter((item) => item.category === category)
        .every((item) => item.usage === "REPAIR");
      await tx.inventoryCategory.upsert({
        where: { name: category },
        create: { name: category, repairOnly },
        update: { repairOnly },
      });
    }

    const products: Prisma.ProductCreateManyInput[] = selectedCatalog.map(
      (product, index) => ({
        id: `${prefix}-product-${index}`,
        ...product,
        favorite: index < 6,
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
        note: "Carico iniziale dati demo",
        actorId: actor.id,
        actorName: actor.name,
      })),
    });

    const repairProducts = products.filter(
      (product) => product.usage === "REPAIR",
    );
    const rules = new Map<
      string,
      { id: string; suggested: string; requiredProductId: string | null }
    >();
    for (const [deviceIndex, device] of devices.entries()) {
      for (const [projectIndex, project] of projects.entries()) {
        const requiredProduct =
          repairProducts.find((product) =>
            product.name.startsWith(project.product),
          ) ?? repairProducts[projectIndex % repairProducts.length];
        const suggested = String(device.prices[projectIndex]);
        const rule = await tx.priceRule.upsert({
          where: {
            category_brand_series_model_project: {
              category: "PHONE",
              brand: device.brand,
              series: "",
              model: device.model,
              project: project.name,
            },
          },
          create: {
            id: `${prefix}-rule-${deviceIndex}-${projectIndex}`,
            category: "PHONE",
            brand: device.brand,
            model: device.model,
            project: project.name,
            suggested,
            cost: String(Math.round(device.prices[projectIndex] * 0.45)),
            minutes: project.minutes,
            notes: `Dati demo ${prefix}`,
            requiredProductId: requiredProduct?.id ?? null,
          },
          update: {
            suggested,
            cost: String(Math.round(device.prices[projectIndex] * 0.45)),
            minutes: project.minutes,
            enabled: true,
            notes: `Dati demo ${prefix}`,
            requiredProductId: requiredProduct?.id ?? null,
          },
        });
        rules.set(`${device.model}|${project.name}`, {
          id: rule.id,
          suggested,
          requiredProductId: requiredProduct?.id ?? null,
        });
      }
    }

    const codePrefix = `R-${businessDay.replaceAll("-", "")}`;
    const latestOrder = await tx.workOrder.findFirst({
      where: { code: { startsWith: codePrefix } },
      orderBy: { code: "desc" },
      select: { code: true },
    });
    const firstSequence = latestOrder
      ? Number(latestOrder.code.slice(-3)) + 1
      : 1;
    if (firstSequence + count - 1 > 999)
      throw new BusinessError("Limite giornaliero raggiunto.");

    const customers: Prisma.CustomerCreateManyInput[] = [];
    const customerPhones: Prisma.CustomerPhoneCreateManyInput[] = [];
    const generatedDevices: Prisma.DeviceCreateManyInput[] = [];
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
      const customerName = `${firstNames[index % firstNames.length]} ${lastNames[(index * 7) % lastNames.length]}`;
      const phone = `+393${String(20 + (index % 70)).padStart(2, "0")}${String(now % 10_000).padStart(4, "0")}${String(index).padStart(3, "0")}`;
      const device = devices[index % devices.length];
      const project = projects[index % projects.length];
      const rule = rules.get(`${device.model}|${project.name}`)!;
      customers.push({
        id: customerId,
        name: customerName,
        phone,
        consentAt: createdAt,
        consentVersion: `DEMO-${token}`,
        createdAt,
      });
      customerPhones.push({ phone, customerId });
      generatedDevices.push({
        id: deviceId,
        customerId,
        category: "PHONE",
        brand: device.brand,
        model: device.model,
        appearance:
          index % 3 === 0
            ? "Lievi segni d'uso sulla cornice"
            : "Buone condizioni generali",
        accessories: index % 4 === 0 ? "Custodia protettiva" : "",
      });
      orders.push({
        id: orderId,
        code: `${codePrefix}${String(firstSequence + index).padStart(3, "0")}`,
        customerName,
        deviceId,
        status,
        fault: index % 2 ? "Display rotto" : "Problema di ricarica",
        notes: `Dati demo ${prefix}`,
        dueDate: offsetDay(businessDay, dueOffset),
        afterSalesOpen: status === "REWORKING",
        createdAt,
        updatedAt: createdAt,
      });
      items.push({
        id: `${prefix}-item-${index}`,
        orderId,
        ruleId: rule.id,
        project: project.name,
        suggested: rule.suggested,
        final: rule.suggested,
        matchLevel: "MODEL",
        minutes: project.minutes,
        requiredProductId: rule.requiredProductId,
      });
      history.push({
        id: `${prefix}-history-${index}`,
        orderId,
        to: status,
        actorId: actor.id,
        actorName: actor.name,
        note: "Stato iniziale dati demo",
        createdAt,
      });
    }
    await tx.customer.createMany({ data: customers });
    await tx.customerPhone.createMany({ data: customerPhones });
    await tx.device.createMany({ data: generatedDevices });
    await tx.workOrder.createMany({ data: orders });
    await tx.workOrderItem.createMany({ data: items });
    await tx.statusHistory.createMany({ data: history });
  });

  return {
    id: prefix,
    customers: count,
    products: productCount,
    priceRules: devices.length * projects.length,
    orders: count,
  };
}
