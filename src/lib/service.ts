import { Prisma, type PrismaClient } from "@prisma/client";
import { db } from "./db";
import {
  assertDelivery,
  assertOwner,
  assertTransition,
  balance,
  allocatePayment,
  BusinessError,
  cents,
  decimal,
  matchRule,
  total,
  settlement,
  type Actor,
} from "./domain";
import {
  customerInput,
  deviceInput,
  editInput,
  itemInput,
  quoteInput,
  orderInput,
  paymentInput,
  productInput,
  inventoryAdjustmentInput,
  retailSaleInput,
  workOrderProductInput,
  checkoutInput,
  ruleInput,
  statusInput,
  userInput,
} from "./validation";
import { z } from "zod";
import { hash } from "bcryptjs";
import { normalizeBrand, normalizeModel } from "./catalog";

type Tx = Prisma.TransactionClient;
export const orderInclude = {
  device: { include: { customer: true } },
  items: true,
  products: true,
  payments: {
    orderBy: { receivedAt: "asc" as const },
    include: { allocations: true },
  },
  history: { orderBy: { createdAt: "asc" as const } },
};
export async function transact<T>(
  work: (tx: Tx) => Promise<T>,
  client: PrismaClient = db,
): Promise<T> {
  for (let i = 0; i < 4; i++) {
    try {
      return await client.$transaction(work, {
        isolationLevel: "Serializable",
        maxWait: 10000,
        timeout: 15000,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        i === 3
      )
        throw error;
    }
  }
  throw new BusinessError("Riprovare l'operazione.");
}
async function currentActor(tx: Tx, actor: Actor) {
  const user = await tx.user.findUnique({ where: { id: actor.id } });
  if (!user?.enabled)
    throw new BusinessError("Sessione non valida. Accedi di nuovo.");
  return { id: user.id, name: user.name, role: user.role };
}
async function audit(
  tx: Tx,
  actor: Actor,
  entityId: string,
  action: string,
  context: Prisma.InputJsonValue = {},
) {
  await tx.auditLog.create({
    data: {
      entityId,
      action,
      actorId: actor.id,
      actorName: actor.name,
      context,
    },
  });
}
async function snapshots(
  tx: Tx,
  actor: Actor,
  device: { category: string; brand: string; series: string; model: string },
  input: z.infer<typeof itemInput>[],
  previousItems?: {
    project: string;
    final: { toString(): string };
    ruleId: string | null;
  }[],
) {
  const rules = await tx.priceRule.findMany({
    where: { enabled: true },
    orderBy: { id: "asc" },
  });
  const results = [];
  const projectPrices = new Map<string, number>();
  for (const item of input) {
    const match = matchRule(rules, device, item.project);
    const final = cents(item.final);
    const projectKey = item.project.trim().toLowerCase();
    if (
      projectPrices.has(projectKey) &&
      projectPrices.get(projectKey) !== final
    )
      throw new BusinessError(
        "Prezzi diversi per lo stesso intervento: distingui la specifica del ricambio.",
      );
    projectPrices.set(projectKey, final);
    const key = {
      category: device.category,
      brand: normalizeBrand(device.brand),
      series: "",
      model: normalizeModel(device.model),
      project: item.project.trim().toLowerCase(),
    };
    const previous = await tx.priceRule.findUnique({
      where: { category_brand_series_model_project: key },
    });
    const oldItem = previousItems?.find(
      (i) => i.project.trim().toLowerCase() === key.project,
    );
    const unchanged = oldItem && cents(oldItem.final) === final;
    const rule = unchanged
      ? null
      : await tx.priceRule.upsert({
          where: { category_brand_series_model_project: key },
          create: {
            ...key,
            suggested: decimal(final),
            minutes: match?.rule.minutes ?? 60,
          },
          update: { suggested: decimal(final), enabled: true },
        });
    const ruleId = rule?.id ?? oldItem?.ruleId ?? match?.rule.id;
    if (rule && (!previous || cents(previous.suggested) !== final))
      await audit(
        tx,
        actor,
        rule.id,
        previous ? "PRICE_RULE_UPDATED" : "PRICE_RULE_CREATED",
        {
          before: previous?.suggested.toString() ?? null,
          after: decimal(final),
        },
      );
    results.push({
      project: item.project,
      final: decimal(final),
      discount: decimal(cents(item.discount)),
      suggested: match?.rule.suggested ?? null,
      ruleId,
      matchLevel: match?.level ?? "MANUAL",
      adjustmentReason: item.adjustmentReason,
      minutes: match?.rule.minutes ?? 0,
    });
  }
  return results;
}
export async function createOrder(actorInput: Actor, raw: unknown) {
  const data = orderInput.parse(raw);
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    const previous = await tx.auditLog.findFirst({
      where: {
        action: "ORDER_CREATED",
        context: { path: ["requestId"], equals: data.requestId },
      },
    });
    if (previous)
      return tx.workOrder.findUniqueOrThrow({
        where: { id: previous.entityId },
      });
    let customer = await tx.customer.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { phone: data.phone },
          { phones: { some: { phone: data.phone } } },
        ],
      },
    });
    if (!customer) {
      customer = await tx.customer.create({
        data: {
          name: data.customerName,
          phone: data.phone,
          consentAt: data.privacyConsent ? new Date() : null,
          consentVersion: data.privacyConsent ? "1.0" : null,
        },
      });
    } else if (data.privacyConsent && !customer.consentAt) {
      customer = await tx.customer.update({
        where: { id: customer.id },
        data: { consentAt: new Date(), consentVersion: "1.0" },
      });
    }
    if (customer.deletedAt)
      throw new BusinessError("Cliente eliminato: usa un altro telefono.");
    await syncPhones(
      tx,
      customer.id,
      customer.phone,
      data.additionalPhones,
      true,
    );
    const device = data.deviceId
      ? await tx.device.findFirst({
          where: {
            id: data.deviceId,
            customerId: customer.id,
            deletedAt: null,
          },
        })
      : await tx.device.create({
          data: {
            customerId: customer.id,
            category: data.category,
            brand: normalizeBrand(data.brand),
            series: normalizeModel(data.series),
            model: normalizeModel(data.model),
            imei: data.imei || null,
            appearance: data.appearance,
            accessories: data.accessories,
          },
        });
    if (!device)
      throw new BusinessError(
        "Il dispositivo non appartiene al cliente selezionato.",
      );
    const items = await snapshots(tx, actor, device, data.items);
    const quote = settlement(items, data);
    if (cents(data.deposit) > quote.due)
      throw new BusinessError("L'acconto supera il totale.");
    const faults = [
      ...new Map(
        data.faults.map((name) => [name.trim().toLowerCase(), name.trim()]),
      ).values(),
    ];
    if (!faults.length && !data.fault)
      throw new BusinessError("Indica il problema segnalato.");
    for (const name of faults)
      await tx.faultOption.upsert({
        where: {
          category_key: { category: device.category, key: name.toLowerCase() },
        },
        create: { category: device.category, name, key: name.toLowerCase() },
        update: {},
      });
    const order = await tx.workOrder.create({
      data: {
        deviceId: device.id,
        customerName: customer.name,
        fault: [...faults, data.fault].filter(Boolean).join("; "),
        orderDiscount: decimal(cents(data.orderDiscount)),
        includeVat: data.includeVat,
        appearance: data.appearance,
        accessories: data.accessories,
        dueDate: data.dueDate || null,
        notes: data.notes,
        confirmedAt: data.confirmed ? new Date() : null,
        confirmationNote: data.confirmed ? data.confirmationNote : "",
        items: { create: items },
        history: {
          create: { to: "RECEIVED", actorId: actor.id, actorName: actor.name },
        },
        payments:
          cents(data.deposit) > 0
            ? {
                create: {
                  requestId: data.requestId,
                  amount: decimal(cents(data.deposit)),
                  method: data.method,
                  kind:
                    cents(data.deposit) === quote.due
                      ? "BALANCE"
                      : data.paymentKind,
                  actorId: actor.id,
                  actorName: actor.name,
                  allocations: {
                    create: {
                      source: "REPAIR",
                      amount: decimal(cents(data.deposit)),
                    },
                  },
                },
              }
            : undefined,
      },
    });
    await audit(tx, actor, order.id, "ORDER_CREATED", {
      requestId: data.requestId,
      total: decimal(total(items)),
      confirmed: data.confirmed,
    });
    if (cents(data.deposit) > 0)
      await audit(tx, actor, order.id, "PAYMENT_ADDED", {
        amount: decimal(cents(data.deposit)),
        method: data.method,
        kind: cents(data.deposit) === quote.due ? "BALANCE" : data.paymentKind,
      });
    return order;
  });
}
export async function updateOrder(actorInput: Actor, id: string, raw: unknown) {
  const data = editInput.parse(raw);
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    const order = await tx.workOrder.findUniqueOrThrow({ where: { id } });
    if (["COMPLETED", "CANCELLED"].includes(order.status))
      throw new BusinessError("La scheda è chiusa.");
    await tx.workOrder.update({
      where: { id },
      data: { ...data, dueDate: data.dueDate || null },
    });
    await audit(tx, actor, id, "ORDER_UPDATED", { fields: Object.keys(data) });
  });
}
export async function replaceQuote(
  actorInput: Actor,
  id: string,
  raw: unknown,
) {
  const parsed = Array.isArray(raw) ? null : quoteInput.parse(raw);
  const itemsInput =
    parsed?.items ?? z.array(itemInput).min(1).max(30).parse(raw);
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    const order = await tx.workOrder.findUniqueOrThrow({
      where: { id },
      include: orderInclude,
    });
    if (["COMPLETED", "CANCELLED"].includes(order.status))
      throw new BusinessError("La scheda è chiusa.");
    const items = await snapshots(
      tx,
      actor,
      order.device,
      itemsInput,
      order.items,
    );
    const options = parsed ?? order;
    if (
      balance(items, order.payments, { ...options, products: order.products }) <
      0
    )
      throw new BusinessError(
        "Il nuovo totale è inferiore agli incassi già registrati.",
      );
    await audit(tx, actor, id, "QUOTE_UPDATED", {
      beforeOptions: {
        orderDiscount: order.orderDiscount.toString(),
        includeVat: order.includeVat,
      },
      afterOptions: {
        orderDiscount: options.orderDiscount.toString(),
        includeVat: options.includeVat,
      },
      before: order.items.map((i) => ({
        project: i.project,
        suggested: i.suggested?.toString() ?? null,
        final: i.final.toString(),
        discount: i.discount.toString(),
        matchLevel: i.matchLevel,
        adjustmentReason: i.adjustmentReason,
      })),
      after: items.map((i) => ({
        project: i.project,
        suggested: i.suggested?.toString() ?? null,
        final: i.final,
        discount: i.discount,
        matchLevel: i.matchLevel,
        adjustmentReason: i.adjustmentReason,
      })),
    });
    await tx.workOrderItem.deleteMany({ where: { orderId: id } });
    await tx.workOrder.update({
      where: { id },
      data: {
        items: { create: items },
        orderDiscount: decimal(cents(options.orderDiscount)),
        includeVat: options.includeVat,
        confirmedAt: null,
        confirmationNote: "",
      },
    });
  });
}
export async function confirmQuote(
  actorInput: Actor,
  id: string,
  raw: unknown,
) {
  const note = z.string().trim().min(1).max(2000).parse(raw);
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    const order = await tx.workOrder.findUniqueOrThrow({ where: { id } });
    if (["COMPLETED", "CANCELLED"].includes(order.status))
      throw new BusinessError("La scheda è chiusa.");
    await tx.workOrder.update({
      where: { id },
      data: { confirmedAt: new Date(), confirmationNote: note },
    });
    await audit(tx, actor, id, "QUOTE_CONFIRMED");
  });
}
export async function addPayment(actorInput: Actor, id: string, raw: unknown) {
  const data = paymentInput.parse(raw);
  if (data.kind === "DEPOSIT")
    throw new BusinessError(
      "Acconto consentito solo alla creazione della scheda.",
    );
  const amount = cents(data.amount);
  if (amount <= 0)
    throw new BusinessError("L'importo deve essere maggiore di zero.");
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    const existing = await tx.payment.findUnique({
      where: { requestId: data.requestId },
    });
    if (existing) {
      if (
        existing.orderId !== id ||
        cents(existing.amount) !== amount ||
        existing.kind !== data.kind ||
        existing.method !== data.method
      )
        throw new BusinessError("Richiesta di pagamento già utilizzata.");
      return existing;
    }
    const order = await tx.workOrder.findUniqueOrThrow({
      where: { id },
      include: {
        items: true,
        products: true,
        payments: { include: { allocations: true } },
      },
    });
    if (order.status === "CANCELLED")
      throw new BusinessError("La scheda è annullata.");
    if (amount > balance(order.items, order.payments, order))
      throw new BusinessError("L'importo supera il saldo da pagare.");
    const repairDue = settlement(order.items, {
      orderDiscount: order.orderDiscount,
      includeVat: order.includeVat,
    }).due;
    const retailDue = settlement([], { products: order.products }).productTotal;
    const repairPaid = order.payments
      .flatMap((payment) => payment.allocations)
      .filter((allocation) => allocation.source === "REPAIR")
      .reduce((sum, allocation) => sum + cents(allocation.amount), 0);
    const retailPaid = order.payments
      .flatMap((payment) => payment.allocations)
      .filter((allocation) => allocation.source === "RETAIL")
      .reduce((sum, allocation) => sum + cents(allocation.amount), 0);
    const allocation = allocatePayment(
      amount,
      Math.max(0, repairDue - repairPaid),
      Math.max(0, retailDue - retailPaid),
    );
    const payment = await tx.payment.create({
      data: {
        ...data,
        amount: decimal(amount),
        orderId: id,
        actorId: actor.id,
        actorName: actor.name,
        allocations: {
          create: [
            ...(allocation.repair
              ? [
                  {
                    source: "REPAIR" as const,
                    amount: decimal(allocation.repair),
                  },
                ]
              : []),
            ...(allocation.retail
              ? [
                  {
                    source: "RETAIL" as const,
                    amount: decimal(allocation.retail),
                  },
                ]
              : []),
          ],
        },
      },
    });
    await audit(tx, actor, id, "PAYMENT_ADDED", {
      paymentId: payment.id,
      amount: decimal(amount),
      kind: data.kind,
      method: data.method,
    });
    return payment;
  });
}
export async function changeStatus(
  actorInput: Actor,
  id: string,
  raw: unknown,
) {
  const data = statusInput.parse(raw);
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    const order = await tx.workOrder.findUniqueOrThrow({
      where: { id },
      include: { items: true, products: true, payments: true },
    });
    assertTransition(order.status, data.status);

    if (data.status === "CANCELLED" && order.payments.length)
      throw new BusinessError(
        "Sono presenti incassi: gestire il rimborso prima dell'annullamento. I rimborsi non sono inclusi nel MVP.",
      );
    if (data.status === "COMPLETED") {
      if (!data.pickedUpBy)
        throw new BusinessError("Indica chi ritira il dispositivo.");
      assertDelivery(
        actor,
        balance(order.items, order.payments, order),
        data.override,
      );
    }
    if (data.status === "READY")
      await consumeWorkOrderProducts(tx, actor, id, "REPAIR_PART");
    if (data.status === "COMPLETED")
      await consumeWorkOrderProducts(tx, actor, id, "RETAIL_ADDON");
    await tx.workOrder.update({
      where: { id },
      data: {
        status: data.status,
        ...(data.status === "COMPLETED"
          ? { pickedUpAt: new Date(), pickedUpBy: data.pickedUpBy }
          : {}),
      },
    });
    await tx.statusHistory.create({
      data: {
        orderId: id,
        from: order.status,
        to: data.status,
        actorId: actor.id,
        actorName: actor.name,
        note: data.note,
      },
    });
    await audit(
      tx,
      actor,
      id,
      data.status === "COMPLETED" ? "ORDER_DELIVERED" : "STATUS_CHANGED",
      {
        from: order.status,
        to: data.status,
        unpaidOverride:
          data.status === "COMPLETED" &&
          balance(order.items, order.payments, order) > 0,
        balance: decimal(balance(order.items, order.payments, order)),
      },
    );
  });
}
export async function savePriceRule(
  actorInput: Actor,
  id: string | null,
  raw: unknown,
) {
  const input = ruleInput.parse(raw);
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    assertOwner(actor);
    const data = {
      ...input,
      category: input.category,
      brand: normalizeBrand(input.brand),
      series: normalizeModel(input.series),
      model: normalizeModel(input.model),
      project: input.project.toLowerCase(),
      suggested: decimal(cents(input.suggested)),
      cost: input.cost ? decimal(cents(input.cost)) : null,
    };
    const before = id
      ? await tx.priceRule.findUniqueOrThrow({ where: { id } })
      : null;
    const rule = id
      ? await tx.priceRule.update({ where: { id }, data })
      : await tx.priceRule.create({ data });
    await audit(
      tx,
      actor,
      rule.id,
      id ? "PRICE_RULE_UPDATED" : "PRICE_RULE_CREATED",
      {
        before: before ? JSON.parse(JSON.stringify(before)) : null,
        after: data,
      },
    );
    return rule;
  });
}

export async function applyInventoryMovement(
  tx: Tx,
  actor: Actor,
  input: {
    requestId: string;
    productId: string;
    quantity: number;
    type:
      | "INITIAL_STOCK"
      | "STOCK_IN"
      | "RETAIL_SALE"
      | "REPAIR_USE"
      | "SALE_RETURN"
      | "MANUAL_ADJUSTMENT";
    referenceType?: string;
    referenceId?: string;
    note?: string;
  },
) {
  const existing = await tx.inventoryMovement.findUnique({
    where: { requestId: input.requestId },
  });
  if (existing) {
    if (
      existing.productId !== input.productId ||
      existing.quantity !== input.quantity ||
      existing.type !== input.type
    )
      throw new BusinessError("Richiesta di magazzino già utilizzata.");
    return existing;
  }
  if (!Number.isSafeInteger(input.quantity) || input.quantity === 0)
    throw new BusinessError("Variazione di magazzino non valida.");
  const updated = await tx.product.updateMany({
    where: {
      id: input.productId,
      ...(input.quantity < 0
        ? { stockQuantity: { gte: -input.quantity } }
        : {}),
    },
    data: { stockQuantity: { increment: input.quantity } },
  });
  if (updated.count !== 1)
    throw new BusinessError("Scorte insufficienti o prodotto non disponibile.");
  const product = await tx.product.findUniqueOrThrow({
    where: { id: input.productId },
  });
  return tx.inventoryMovement.create({
    data: {
      requestId: input.requestId,
      productId: input.productId,
      quantity: input.quantity,
      stockBefore: product.stockQuantity - input.quantity,
      stockAfter: product.stockQuantity,
      type: input.type,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      note: input.note ?? "",
      actorId: actor.id,
      actorName: actor.name,
    },
  });
}

async function consumeWorkOrderProducts(
  tx: Tx,
  actor: Actor,
  orderId: string,
  kind: "REPAIR_PART" | "RETAIL_ADDON",
) {
  const lines = await tx.workOrderProduct.findMany({
    where: { orderId, kind, consumedAt: null },
  });
  const consumedAt = new Date();
  for (const line of lines) {
    await applyInventoryMovement(tx, actor, {
      requestId: `work-order-product:${line.id}`,
      productId: line.productId,
      quantity: -line.quantity,
      type: kind === "REPAIR_PART" ? "REPAIR_USE" : "RETAIL_SALE",
      referenceType: "WORK_ORDER",
      referenceId: orderId,
    });
    await tx.workOrderProduct.update({
      where: { id: line.id },
      data: { consumedAt },
    });
  }
}

export async function createProduct(actorInput: Actor, raw: unknown) {
  const data = productInput.parse(raw);
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    const previous = await tx.auditLog.findFirst({
      where: {
        action: "PRODUCT_CREATED",
        context: { path: ["requestId"], equals: data.requestId },
      },
    });
    if (previous)
      return tx.product.findUniqueOrThrow({ where: { id: previous.entityId } });
    const product = await tx.product.create({
      data: {
        name: data.name,
        category: data.category,
        usage: data.usage,
        costPrice: decimal(cents(data.costPrice)),
        salePrice: decimal(cents(data.salePrice)),
        minStock: data.minStock,
        favorite: data.favorite,
        enabled: data.enabled,
      },
    });
    if (data.initialStock > 0)
      await applyInventoryMovement(tx, actor, {
        requestId: data.requestId,
        productId: product.id,
        quantity: data.initialStock,
        type: "INITIAL_STOCK",
        referenceType: "PRODUCT",
        referenceId: product.id,
      });
    await audit(tx, actor, product.id, "PRODUCT_CREATED", {
      requestId: data.requestId,
      initialStock: data.initialStock,
    });
    return product;
  });
}

export async function adjustInventory(
  actorInput: Actor,
  productId: string,
  raw: unknown,
) {
  const data = inventoryAdjustmentInput.parse(raw);
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    const movement = await applyInventoryMovement(tx, actor, {
      ...data,
      productId,
      referenceType: "PRODUCT",
      referenceId: productId,
    });
    await audit(tx, actor, productId, "INVENTORY_ADJUSTED", {
      movementId: movement.id,
      quantity: movement.quantity,
      type: movement.type,
    });
    return movement;
  });
}

export async function addWorkOrderProduct(
  actorInput: Actor,
  orderId: string,
  raw: unknown,
) {
  const data = workOrderProductInput.parse(raw);
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    const order = await tx.workOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    if (["COMPLETED", "CANCELLED"].includes(order.status))
      throw new BusinessError("La scheda è chiusa.");
    if (data.kind === "REPAIR_PART" && order.status === "READY")
      throw new BusinessError("I ricambi sono già stati contabilizzati.");
    const product = await tx.product.findFirst({
      where: {
        id: data.productId,
        enabled: true,
        usage: {
          in:
            data.kind === "REPAIR_PART"
              ? ["REPAIR", "BOTH"]
              : ["RETAIL", "BOTH"],
        },
      },
    });
    if (!product) throw new BusinessError("Prodotto non disponibile.");
    const existing = await tx.workOrderProduct.findUnique({
      where: {
        orderId_productId_kind: {
          orderId,
          productId: product.id,
          kind: data.kind,
        },
      },
    });
    if (existing?.consumedAt)
      throw new BusinessError("Il movimento di magazzino è già registrato.");
    const line = await tx.workOrderProduct.upsert({
      where: {
        orderId_productId_kind: {
          orderId,
          productId: product.id,
          kind: data.kind,
        },
      },
      create: {
        orderId,
        productId: product.id,
        productName: product.name,
        category: product.category,
        kind: data.kind,
        unitPrice:
          data.kind === "RETAIL_ADDON" ? product.salePrice : decimal(0),
        quantity: data.quantity,
      },
      update: {
        quantity: data.quantity,
        productName: product.name,
        category: product.category,
        unitPrice:
          data.kind === "RETAIL_ADDON" ? product.salePrice : decimal(0),
      },
    });
    await audit(tx, actor, orderId, "WORK_ORDER_PRODUCT_SAVED", {
      lineId: line.id,
      productId: product.id,
      kind: data.kind,
      quantity: data.quantity,
    });
    return line;
  });
}

export async function removeWorkOrderProduct(
  actorInput: Actor,
  orderId: string,
  lineId: string,
) {
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    const line = await tx.workOrderProduct.findFirstOrThrow({
      where: { id: lineId, orderId },
      include: { order: true },
    });
    if (line.consumedAt)
      throw new BusinessError("Il movimento di magazzino è già registrato.");
    if (["COMPLETED", "CANCELLED"].includes(line.order.status))
      throw new BusinessError("La scheda è chiusa.");
    await tx.workOrderProduct.delete({ where: { id: line.id } });
    await audit(tx, actor, orderId, "WORK_ORDER_PRODUCT_REMOVED", {
      lineId,
      productId: line.productId,
    });
  });
}

export async function checkoutWorkOrder(
  actorInput: Actor,
  orderId: string,
  raw: unknown,
) {
  const data = checkoutInput.parse(raw);
  const amount = cents(data.amount);
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    const previousCheckout = await tx.auditLog.findFirst({
      where: {
        action: "ORDER_CHECKED_OUT",
        context: { path: ["requestId"], equals: data.requestId },
      },
    });
    if (previousCheckout) {
      if (previousCheckout.entityId !== orderId)
        throw new BusinessError("Richiesta di pagamento già utilizzata.");
      return tx.workOrder.findUniqueOrThrow({ where: { id: orderId } });
    }
    const existing = await tx.payment.findUnique({
      where: { requestId: data.requestId },
    });
    if (existing) {
      if (existing.orderId !== orderId || cents(existing.amount) !== amount)
        throw new BusinessError("Richiesta di pagamento già utilizzata.");
      return tx.workOrder.findUniqueOrThrow({ where: { id: orderId } });
    }
    const order = await tx.workOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        items: true,
        products: true,
        payments: { include: { allocations: true } },
      },
    });
    if (order.status !== "READY")
      throw new BusinessError("La riparazione non è pronta per la consegna.");
    const remaining = balance(order.items, order.payments, order);
    if (amount > remaining)
      throw new BusinessError("L'importo supera il saldo da pagare.");
    assertDelivery(actor, remaining - amount, data.override);
    if (amount > 0) {
      const repairDue = settlement(order.items, {
        orderDiscount: order.orderDiscount,
        includeVat: order.includeVat,
      }).due;
      const retailDue = settlement([], {
        products: order.products,
      }).productTotal;
      const repairPaid = order.payments
        .flatMap((payment) => payment.allocations)
        .filter((allocation) => allocation.source === "REPAIR")
        .reduce((sum, allocation) => sum + cents(allocation.amount), 0);
      const retailPaid = order.payments
        .flatMap((payment) => payment.allocations)
        .filter((allocation) => allocation.source === "RETAIL")
        .reduce((sum, allocation) => sum + cents(allocation.amount), 0);
      const allocation = allocatePayment(
        amount,
        Math.max(0, repairDue - repairPaid),
        Math.max(0, retailDue - retailPaid),
      );
      await tx.payment.create({
        data: {
          requestId: data.requestId,
          orderId,
          amount: decimal(amount),
          method: data.method,
          kind: "BALANCE",
          actorId: actor.id,
          actorName: actor.name,
          allocations: {
            create: [
              ...(allocation.repair
                ? [
                    {
                      source: "REPAIR" as const,
                      amount: decimal(allocation.repair),
                    },
                  ]
                : []),
              ...(allocation.retail
                ? [
                    {
                      source: "RETAIL" as const,
                      amount: decimal(allocation.retail),
                    },
                  ]
                : []),
            ],
          },
        },
      });
    }
    await consumeWorkOrderProducts(tx, actor, orderId, "RETAIL_ADDON");
    await tx.workOrder.update({
      where: { id: orderId },
      data: {
        status: "COMPLETED",
        pickedUpAt: new Date(),
        pickedUpBy: data.pickedUpBy,
      },
    });
    await tx.statusHistory.create({
      data: {
        orderId,
        from: "READY",
        to: "COMPLETED",
        actorId: actor.id,
        actorName: actor.name,
        note: "",
      },
    });
    await audit(tx, actor, orderId, "ORDER_CHECKED_OUT", {
      amount: decimal(amount),
      requestId: data.requestId,
      method: amount > 0 ? data.method : null,
      unpaidOverride: remaining - amount > 0,
    });
    return tx.workOrder.findUniqueOrThrow({ where: { id: orderId } });
  });
}

export async function createRetailSale(actorInput: Actor, raw: unknown) {
  const data = retailSaleInput.parse(raw);
  const uniqueItems = new Map<string, number>();
  for (const item of data.items)
    uniqueItems.set(
      item.productId,
      (uniqueItems.get(item.productId) ?? 0) + item.quantity,
    );
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    const existing = await tx.retailSale.findUnique({
      where: { requestId: data.requestId },
      include: { payments: true },
    });
    if (existing) return existing;
    const products = await tx.product.findMany({
      where: {
        id: { in: [...uniqueItems.keys()] },
        enabled: true,
        usage: { in: ["RETAIL", "BOTH"] },
      },
    });
    if (products.length !== uniqueItems.size)
      throw new BusinessError("Uno o più prodotti non sono disponibili.");
    const lines = products.map((product) => {
      const quantity = uniqueItems.get(product.id) ?? 0;
      const unitPrice = cents(product.salePrice);
      return {
        product,
        quantity,
        unitPrice,
        subtotal: unitPrice * quantity,
      };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
    const discount = cents(data.discount);
    if (discount >= subtotal)
      throw new BusinessError("Lo sconto deve essere inferiore al subtotale.");
    const totalAmount = subtotal - discount;
    const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
    const sale = await tx.retailSale.create({
      data: {
        requestId: data.requestId,
        subtotal: decimal(subtotal),
        discount: decimal(discount),
        total: decimal(totalAmount),
        itemCount,
        actorId: actor.id,
        actorName: actor.name,
        items: {
          create: lines.map((line) => ({
            productId: line.product.id,
            productName: line.product.name,
            category: line.product.category,
            unitPrice: decimal(line.unitPrice),
            quantity: line.quantity,
            subtotal: decimal(line.subtotal),
          })),
        },
      },
    });
    const payment = await tx.payment.create({
      data: {
        requestId: data.requestId,
        saleId: sale.id,
        amount: decimal(totalAmount),
        method: data.method,
        kind: "SALE",
        actorId: actor.id,
        actorName: actor.name,
        allocations: {
          create: { source: "RETAIL", amount: decimal(totalAmount) },
        },
      },
    });
    for (const line of lines)
      await applyInventoryMovement(tx, actor, {
        requestId: `${data.requestId}:${line.product.id}`,
        productId: line.product.id,
        quantity: -line.quantity,
        type: "RETAIL_SALE",
        referenceType: "RETAIL_SALE",
        referenceId: sale.id,
      });
    await audit(tx, actor, sale.id, "RETAIL_SALE_COMPLETED", {
      paymentId: payment.id,
      total: decimal(totalAmount),
      itemCount,
      method: data.method,
    });
    return tx.retailSale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { payments: true },
    });
  });
}
export async function createUser(actorInput: Actor, raw: unknown) {
  const input = userInput.parse(raw);
  const passwordHash = await hash(input.password, 12);
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    assertOwner(actor);
    const user = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        role: input.role,
        passwordHash,
      },
    });
    await audit(tx, actor, user.id, "USER_CREATED", { role: user.role });
    return { id: user.id };
  });
}
export async function setUserEnabled(
  actorInput: Actor,
  id: string,
  enabled: boolean,
) {
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    assertOwner(actor);
    if (actor.id === id)
      throw new BusinessError("Non puoi disattivare il tuo account.");
    await tx.user.update({ where: { id }, data: { enabled } });
    await audit(tx, actor, id, "USER_ACCESS_UPDATED", { enabled });
  });
}

async function syncPhones(
  tx: Tx,
  id: string,
  primary: string,
  extra: string[],
  merge = false,
) {
  const existing = merge
    ? await tx.customerPhone.findMany({ where: { customerId: id } })
    : [];
  const phones = [
    ...new Set([primary, ...existing.map((p) => p.phone), ...extra]),
  ];
  if (phones.length > 3)
    throw new BusinessError("Massimo tre telefoni per cliente.");
  const conflict = await tx.customer.findFirst({
    where: {
      id: { not: id },
      deletedAt: null,
      OR: [
        { phone: { in: phones } },
        { phones: { some: { phone: { in: phones } } } },
      ],
    },
  });
  if (conflict)
    throw new BusinessError("Telefono già associato a un altro cliente.");
  await tx.customerPhone.deleteMany({
    where: { customerId: id, phone: { notIn: phones } },
  });
  for (const phone of phones)
    await tx.customerPhone.upsert({
      where: { phone_customerId: { phone, customerId: id } },
      create: { phone, customerId: id },
      update: {},
    });
}
export async function saveCustomer(
  actorInput: Actor,
  id: string | null,
  raw: unknown,
) {
  const data = customerInput.parse(raw);
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    const customer = id
      ? await tx.customer.findFirstOrThrow({ where: { id, deletedAt: null } })
      : await tx.customer.create({
          data: { name: data.name, phone: data.phone },
        });
    await syncPhones(tx, customer.id, data.phone, data.additionalPhones);
    await tx.customer.update({
      where: { id: customer.id },
      data: { name: data.name, phone: data.phone },
    });
    await audit(
      tx,
      actor,
      customer.id,
      id ? "CUSTOMER_UPDATED" : "CUSTOMER_CREATED",
    );
    return { id: customer.id };
  });
}
export async function deleteCustomer(actorInput: Actor, id: string) {
  return deleteCustomers(actorInput, [id]);
}
export async function deleteCustomers(actorInput: Actor, raw: unknown) {
  const ids = [
    ...new Set(z.array(z.string().min(1)).min(1).max(500).parse(raw)),
  ];
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    const customers = await tx.customer.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    if (customers.length !== ids.length)
      throw new BusinessError(
        "Clienti non disponibili. Aggiorna la pagina e riprova.",
      );
    const deletedAt = new Date();
    await tx.customer.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt },
    });
    await tx.device.updateMany({
      where: { customerId: { in: ids }, deletedAt: null },
      data: { deletedAt },
    });
    for (const id of ids) await audit(tx, actor, id, "CUSTOMER_DELETED");
  });
}
export async function saveDevice(actorInput: Actor, id: string, raw: unknown) {
  const parsed = deviceInput.parse(raw);
  const data = {
    ...parsed,
    brand: normalizeBrand(parsed.brand),
    model: normalizeModel(parsed.model),
  };
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    const before = await tx.device.findFirstOrThrow({
      where: { id, deletedAt: null, customer: { deletedAt: null } },
    });
    await tx.device.update({ where: { id }, data });
    await audit(tx, actor, id, "DEVICE_UPDATED", {
      before: { brand: before.brand, model: before.model },
      after: data,
    });
  });
}
export async function deleteDevice(actorInput: Actor, id: string) {
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    await tx.device.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, actor, id, "DEVICE_DELETED");
  });
}
export async function deletePriceRules(actorInput: Actor, raw: unknown) {
  const ids = z.array(z.string().min(1)).min(1).max(500).parse(raw);
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    assertOwner(actor);
    const rules = await tx.priceRule.findMany({ where: { id: { in: ids } } });
    await tx.workOrderItem.updateMany({
      where: { ruleId: { in: ids } },
      data: { ruleId: null },
    });
    await tx.priceRule.deleteMany({ where: { id: { in: ids } } });
    for (const rule of rules)
      await audit(tx, actor, rule.id, "PRICE_RULE_DELETED", {
        project: rule.project,
        suggested: rule.suggested.toString(),
      });
  });
}
export async function hideFault(
  actorInput: Actor,
  category: string,
  name: string,
) {
  const data = z
    .object({
      category: deviceInput.shape.category,
      name: z.string().trim().min(1).max(120),
    })
    .parse({ category, name });
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    const key = data.name.toLowerCase();
    const fault = await tx.faultOption.upsert({
      where: { category_key: { category: data.category, key } },
      create: { ...data, key, hidden: true },
      update: { hidden: true },
    });
    await audit(tx, actor, fault.id, "FAULT_DELETED", data);
  });
}
export async function restoreFault(
  actorInput: Actor,
  category: string,
  name: string,
) {
  const data = z
    .object({
      category: deviceInput.shape.category,
      name: z.string().trim().min(1).max(120),
    })
    .parse({ category, name });
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    const key = data.name.toLowerCase();
    const fault = await tx.faultOption.upsert({
      where: { category_key: { category: data.category, key } },
      create: { ...data, key, hidden: false },
      update: { hidden: false },
    });
    await audit(tx, actor, fault.id, "FAULT_RESTORED", data);
  });
}
