import { Prisma, type PrismaClient } from "@prisma/client";
import { db } from "./db";
import {
  assertDelivery,
  assertOwner,
  assertTransition,
  balance,
  BusinessError,
  cents,
  decimal,
  matchRule,
  total,
  type Actor,
} from "./domain";
import {
  editInput,
  itemInput,
  orderInput,
  paymentInput,
  ruleInput,
  statusInput,
  userInput,
} from "./validation";
import { z } from "zod";
import { hash } from "bcryptjs";

type Tx = Prisma.TransactionClient;
export const orderInclude = {
  device: { include: { customer: true } },
  items: true,
  payments: { orderBy: { receivedAt: "asc" as const } },
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
  device: { brand: string; series: string; model: string },
  input: z.infer<typeof itemInput>[],
) {
  const rules = await tx.priceRule.findMany({
    where: { enabled: true },
    orderBy: { id: "asc" },
  });
  const results = [];
  for (const item of input) {
    const match = matchRule(rules, device, item.project);
    const final = cents(item.final);
    if (
      (!match || cents(match.rule.suggested) !== final) &&
      !item.adjustmentReason
    )
      throw new BusinessError(
        "Indica il motivo del prezzo manuale o modificato.",
      );
    let ruleId = match?.rule.id;
    if (item.saveRule && !match) {
      assertOwner(actor);
      const rule = await tx.priceRule.create({
        data: {
          brand: device.brand.toLowerCase(),
          model: device.model.toLowerCase(),
          project: item.project.toLowerCase(),
          suggested: decimal(final),
          minutes: 60,
        },
      });
      ruleId = rule.id;
      await audit(tx, actor, rule.id, "PRICE_RULE_CREATED");
    }
    results.push({
      project: item.project,
      final: decimal(final),
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
    let customer = await tx.customer.findUnique({
      where: { phone: data.phone },
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
    const device = data.deviceId
      ? await tx.device.findFirst({
          where: { id: data.deviceId, customerId: customer.id },
        })
      : await tx.device.create({
          data: {
            customerId: customer.id,
            brand: data.brand,
            series: data.series,
            model: data.model,
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
    if (cents(data.deposit) > total(items))
      throw new BusinessError("L'acconto supera il totale.");
    const order = await tx.workOrder.create({
      data: {
        deviceId: device.id,
        fault: data.fault,
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
                  kind: "DEPOSIT",
                  actorId: actor.id,
                  actorName: actor.name,
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
        kind: "DEPOSIT",
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
  const itemsInput = z.array(itemInput).min(1).max(30).parse(raw);
  return transact(async (tx) => {
    const actor = await currentActor(tx, actorInput);
    const order = await tx.workOrder.findUniqueOrThrow({
      where: { id },
      include: orderInclude,
    });
    if (["COMPLETED", "CANCELLED"].includes(order.status))
      throw new BusinessError("La scheda è chiusa.");
    const items = await snapshots(tx, actor, order.device, itemsInput);
    if (balance(items, order.payments) < 0)
      throw new BusinessError(
        "Il nuovo totale è inferiore agli incassi già registrati.",
      );
    await audit(tx, actor, id, "QUOTE_UPDATED", {
      before: order.items.map((i) => ({
        project: i.project,
        suggested: i.suggested?.toString() ?? null,
        final: i.final.toString(),
        matchLevel: i.matchLevel,
        adjustmentReason: i.adjustmentReason,
      })),
      after: items.map((i) => ({
        project: i.project,
        suggested: i.suggested?.toString() ?? null,
        final: i.final,
        matchLevel: i.matchLevel,
        adjustmentReason: i.adjustmentReason,
      })),
    });
    await tx.workOrderItem.deleteMany({ where: { orderId: id } });
    await tx.workOrder.update({
      where: { id },
      data: {
        items: { create: items },
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
      include: { items: true, payments: true },
    });
    if (order.status === "CANCELLED")
      throw new BusinessError("La scheda è annullata.");
    if (amount > balance(order.items, order.payments))
      throw new BusinessError("L'importo supera il saldo da pagare.");
    const payment = await tx.payment.create({
      data: {
        ...data,
        amount: decimal(amount),
        orderId: id,
        actorId: actor.id,
        actorName: actor.name,
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
      include: { items: true, payments: true },
    });
    assertTransition(order.status, data.status);
    if (
      ["REPAIRING", "READY", "COMPLETED"].includes(data.status) &&
      !order.confirmedAt
    )
      throw new BusinessError("Registra prima la conferma del preventivo.");
    if (data.status === "CANCELLED" && order.payments.length)
      throw new BusinessError(
        "Sono presenti incassi: gestire il rimborso prima dell'annullamento. I rimborsi non sono inclusi nel MVP.",
      );
    if (data.status === "COMPLETED") {
      if (!data.pickedUpBy)
        throw new BusinessError("Indica chi ritira il dispositivo.");
      assertDelivery(
        actor,
        balance(order.items, order.payments),
        data.override,
      );
    }
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
          balance(order.items, order.payments) > 0,
        balance: decimal(balance(order.items, order.payments)),
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
      brand: input.brand.toLowerCase(),
      series: input.series.toLowerCase(),
      model: input.model.toLowerCase(),
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
